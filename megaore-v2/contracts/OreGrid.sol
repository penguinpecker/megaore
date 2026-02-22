// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OreToken.sol";
import "./NFTStaking.sol";
import "./OreTreasury.sol";

/**
 * @title OreGrid (V2 — Goldsky drand VRF)
 * @notice Core game engine for MegaORE protocol on MegaETH.
 *
 *  Rules:
 *  - 5×5 grid (25 cells), 30-second rounds
 *  - Fixed deposit per cell
 *  - One player, one cell per round
 *  - Verifiable random winning cell via Goldsky Compose + drand
 *  - 10% fee → OreTreasury
 *  - 90% pot split equally among winners
 *  - ORE tokens minted to winners (+50% for NFT stakers)
 *  - Motherlode jackpot: 1/625 chance per round
 *
 *  Resolution flow:
 *  1. resolveRound() — marks round pending, emits RandomnessRequested
 *  2. Goldsky Compose detects event, fetches drand randomness
 *  3. fulfillRandomness() — uses drand value to pick winner + distribute
 */
contract OreGrid is Ownable, ReentrancyGuard {
    uint8 public constant GRID_SIZE = 25;
    uint256 public constant MOTHERLODE_ODDS = 625;

    OreToken public immutable oreToken;
    NFTStaking public immutable nftStaking;
    OreTreasury public immutable treasury;

    // VRF
    address public fulfiller;
    uint256 public nextRequestId;

    struct VRFRequest {
        uint256 roundId;
        bool fulfilled;
    }
    mapping(uint256 => VRFRequest) public vrfRequests;
    mapping(uint256 => uint256) public roundToRequestId; // roundId => requestId

    // Config
    uint256 public depositAmount;
    uint256 public roundDuration;
    uint256 public orePerRound;
    uint256 public protocolFeeBps;
    uint256 public motherlodePerRound;
    uint256 public nftBoostBps;
    uint256 public resolverReward;

    // ──────────────────────────────────────
    //  Round State
    // ──────────────────────────────────────

    struct Round {
        uint64 startTime;
        uint64 endTime;
        uint256 totalDeposits;
        uint16 totalPlayers;
        uint8 winningCell;
        bool resolved;       // true once fulfillRandomness completes
        bool pendingVRF;     // true after resolveRound, before fulfill
    }

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint8 => address[])) public cellPlayers;
    mapping(uint256 => mapping(address => uint8)) public playerCell;
    mapping(uint256 => mapping(address => bool)) public hasJoined;

    // Motherlode
    uint256 public motherlodePool;
    uint256 public totalMotherlodesPaid;

    // Stats
    uint256 public totalRoundsPlayed;
    uint256 public totalETHDeposited;
    uint256 public totalOREMinted;
    uint256 public totalFeesCollected;

    // ──────────────────────────────────────
    //  Events
    // ──────────────────────────────────────

    event RoundStarted(uint256 indexed roundId, uint64 startTime, uint64 endTime);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 cell);
    event RandomnessRequested(uint256 indexed requestId, address indexed requester);
    event RandomnessFulfilled(uint256 indexed requestId, bytes32 randomness, uint64 round, bytes signature);
    event RoundResolved(
        uint256 indexed roundId,
        uint8 winningCell,
        uint256 winnersCount,
        uint256 potPerWinner,
        uint256 orePerWinner,
        bool motherlodeTriggered
    );
    event MotherlodeTriggered(uint256 indexed roundId, uint256 amount, uint256 winnersCount);
    event ConfigUpdated(string param, uint256 value);

    // ──────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────

    error RoundNotActive();
    error RoundNotEnded();
    error RoundAlreadyResolved();
    error RoundAlreadyPending();
    error AlreadyJoinedThisRound();
    error InvalidCell();
    error IncorrectDeposit();
    error TransferFailed();
    error OnlyFulfiller();
    error RequestNotFound();
    error AlreadyFulfilled();

    // ──────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────

    constructor(
        address _oreToken,
        address _nftStaking,
        address _treasury,
        address _fulfiller,
        uint256 _depositAmount,
        uint256 _roundDuration,
        uint256 _orePerRound,
        uint256 _protocolFeeBps,
        uint256 _motherlodePerRound,
        uint256 _nftBoostBps,
        uint256 _resolverReward
    ) Ownable(msg.sender) {
        oreToken = OreToken(_oreToken);
        nftStaking = NFTStaking(payable(_nftStaking));
        treasury = OreTreasury(payable(_treasury));
        fulfiller = _fulfiller;

        depositAmount = _depositAmount;
        roundDuration = _roundDuration;
        orePerRound = _orePerRound;
        protocolFeeBps = _protocolFeeBps;
        motherlodePerRound = _motherlodePerRound;
        nftBoostBps = _nftBoostBps;
        resolverReward = _resolverReward;

        _startNewRound();
    }

    // ──────────────────────────────────────
    //  Player Actions
    // ──────────────────────────────────────

    function joinRound(uint8 cell) external payable nonReentrant {
        if (cell >= GRID_SIZE) revert InvalidCell();
        if (msg.value != depositAmount) revert IncorrectDeposit();

        Round storage round = rounds[currentRoundId];
        if (block.timestamp >= round.endTime) revert RoundNotActive();
        if (hasJoined[currentRoundId][msg.sender]) revert AlreadyJoinedThisRound();

        hasJoined[currentRoundId][msg.sender] = true;
        playerCell[currentRoundId][msg.sender] = cell;
        cellPlayers[currentRoundId][cell].push(msg.sender);

        round.totalDeposits += msg.value;
        round.totalPlayers++;

        emit PlayerJoined(currentRoundId, msg.sender, cell);
    }

    // ──────────────────────────────────────
    //  Step 1: Request Randomness
    // ──────────────────────────────────────

    function resolveRound() external nonReentrant {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (block.timestamp < round.endTime) revert RoundNotEnded();
        if (round.resolved) revert RoundAlreadyResolved();
        if (round.pendingVRF) revert RoundAlreadyPending();

        // Empty round — resolve immediately, no VRF needed
        if (round.totalPlayers == 0) {
            round.resolved = true;
            _startNewRound();
            return;
        }

        // Mark pending and request randomness
        round.pendingVRF = true;

        uint256 requestId = nextRequestId++;
        vrfRequests[requestId] = VRFRequest({
            roundId: roundId,
            fulfilled: false
        });
        roundToRequestId[roundId] = requestId;

        emit RandomnessRequested(requestId, msg.sender);

        // Reward resolver for triggering
        if (resolverReward > 0) {
            oreToken.mint(msg.sender, resolverReward);
            totalOREMinted += resolverReward;
        }

        // Start next round immediately so players can join
        _startNewRound();
    }

    // ──────────────────────────────────────
    //  Step 2: Fulfill Randomness (Goldsky)
    // ──────────────────────────────────────

    function fulfillRandomness(
        uint256 requestId,
        bytes32 randomness,
        uint64 drandRound,
        bytes calldata signature
    ) external nonReentrant {
        if (msg.sender != fulfiller) revert OnlyFulfiller();

        VRFRequest storage req = vrfRequests[requestId];
        if (req.roundId == 0 && requestId != 0) revert RequestNotFound();
        if (req.fulfilled) revert AlreadyFulfilled();

        req.fulfilled = true;

        uint256 roundId = req.roundId;
        Round storage round = rounds[roundId];
        round.resolved = true;
        round.pendingVRF = false;

        emit RandomnessFulfilled(requestId, randomness, drandRound, signature);

        // Use drand randomness to pick winner
        uint8 winningCell = uint8(uint256(randomness) % GRID_SIZE);
        round.winningCell = winningCell;

        _distributeRewards(roundId, winningCell, randomness);
    }

    function _distributeRewards(uint256 roundId, uint8 winningCell, bytes32 randomness) internal {
        Round storage round = rounds[roundId];
        address[] memory winners = cellPlayers[roundId][winningCell];
        uint256 winnersCount = winners.length;

        // Calculate fee
        uint256 totalPot = round.totalDeposits;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 distributablePot = totalPot - fee;

        // Send fee to treasury
        if (fee > 0) {
            treasury.depositFee{value: fee}(roundId);
            totalFeesCollected += fee;
        }

        // Add to motherlode
        motherlodePool += motherlodePerRound;

        // Check motherlode trigger using drand randomness
        bool motherlodeTriggered = _checkMotherlode(randomness, winnersCount);

        if (winnersCount == 0) {
            _handleNoWinners(roundId, winningCell, distributablePot);
        } else {
            _handleWinners(roundId, winningCell, winners, distributablePot, motherlodeTriggered);
        }

        totalRoundsPlayed++;
        totalETHDeposited += totalPot;
    }

    function _checkMotherlode(bytes32 randomness, uint256 winnersCount) internal returns (bool) {
        if (winnersCount == 0) return false;
        uint256 motherlodeRng = uint256(
            keccak256(abi.encodePacked(randomness, "motherlode"))
        ) % MOTHERLODE_ODDS;
        if (motherlodeRng == 0) {
            totalMotherlodesPaid++;
            return true;
        }
        return false;
    }

    function _handleNoWinners(uint256 roundId, uint8 winningCell, uint256 distributablePot) internal {
        if (distributablePot > 0) {
            treasury.depositFee{value: distributablePot}(roundId);
        }
        emit RoundResolved(roundId, winningCell, 0, 0, 0, false);
    }

    function _handleWinners(
        uint256 roundId, uint8 winningCell, address[] memory winners,
        uint256 distributablePot, bool motherlodeTriggered
    ) internal {
        uint256 winnersCount = winners.length;
        uint256 potPerWinner = distributablePot / winnersCount;
        uint256 baseOre = orePerRound / winnersCount;

        uint256 motherlodePayout = 0;
        if (motherlodeTriggered) {
            motherlodePayout = motherlodePool;
            motherlodePool = 0;
        }

        for (uint256 i = 0; i < winnersCount; i++) {
            _rewardWinner(winners[i], potPerWinner, baseOre, motherlodePayout, winnersCount);
        }

        // Dust to treasury
        uint256 dust = distributablePot - (potPerWinner * winnersCount);
        if (dust > 0) {
            treasury.depositFee{value: dust}(roundId);
        }

        emit RoundResolved(roundId, winningCell, winnersCount, potPerWinner, baseOre, motherlodeTriggered);
        if (motherlodeTriggered) {
            emit MotherlodeTriggered(roundId, motherlodePayout, winnersCount);
        }
    }

    function _rewardWinner(
        address winner, uint256 potPerWinner, uint256 baseOre,
        uint256 motherlodePayout, uint256 winnersCount
    ) internal {
        // Send ETH
        if (potPerWinner > 0) {
            (bool ok, ) = winner.call{value: potPerWinner}("");
            if (!ok) revert TransferFailed();
        }

        // Mint ORE (with NFT boost)
        uint256 oreReward = baseOre;
        if (nftStaking.isStaker(winner)) {
            oreReward += (baseOre * nftBoostBps) / 10000;
        }
        if (oreReward > 0) {
            oreToken.mint(winner, oreReward);
            totalOREMinted += oreReward;
        }

        // Motherlode ORE
        if (motherlodePayout > 0) {
            uint256 motherShare = motherlodePayout / winnersCount;
            oreToken.mint(winner, motherShare);
            totalOREMinted += motherShare;
        }
    }

    // ──────────────────────────────────────
    //  Views
    // ──────────────────────────────────────

    function getCurrentRound() external view returns (
        uint256 roundId, uint64 startTime, uint64 endTime,
        uint256 totalDeposits, uint16 totalPlayers, bool resolved
    ) {
        Round memory r = rounds[currentRoundId];
        return (currentRoundId, r.startTime, r.endTime, r.totalDeposits, r.totalPlayers, r.resolved);
    }

    function getCellPlayers(uint256 roundId, uint8 cell) external view returns (address[] memory) {
        return cellPlayers[roundId][cell];
    }

    function getCellCounts() external view returns (uint16[25] memory counts) {
        for (uint8 i = 0; i < GRID_SIZE; i++) {
            counts[i] = uint16(cellPlayers[currentRoundId][i].length);
        }
    }

    function canResolve() external view returns (bool) {
        Round memory r = rounds[currentRoundId];
        return block.timestamp >= r.endTime && !r.resolved && !r.pendingVRF;
    }

    function getRoundResult(uint256 roundId) external view returns (
        uint8 winningCell, uint256 winnersCount, bool resolved
    ) {
        Round memory r = rounds[roundId];
        return (r.winningCell, cellPlayers[roundId][r.winningCell].length, r.resolved);
    }

    function isPendingVRF(uint256 roundId) external view returns (bool) {
        return rounds[roundId].pendingVRF;
    }

    // ──────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────

    function setFulfiller(address _fulfiller) external onlyOwner { fulfiller = _fulfiller; emit ConfigUpdated("fulfiller", uint256(uint160(_fulfiller))); }
    function setDepositAmount(uint256 _v) external onlyOwner { depositAmount = _v; emit ConfigUpdated("depositAmount", _v); }
    function setRoundDuration(uint256 _v) external onlyOwner { roundDuration = _v; emit ConfigUpdated("roundDuration", _v); }
    function setOrePerRound(uint256 _v) external onlyOwner { orePerRound = _v; emit ConfigUpdated("orePerRound", _v); }
    function setProtocolFeeBps(uint256 _v) external onlyOwner { protocolFeeBps = _v; emit ConfigUpdated("protocolFeeBps", _v); }
    function setResolverReward(uint256 _v) external onlyOwner { resolverReward = _v; emit ConfigUpdated("resolverReward", _v); }
    function setNftBoostBps(uint256 _v) external onlyOwner { nftBoostBps = _v; emit ConfigUpdated("nftBoostBps", _v); }
    function setMotherlodePerRound(uint256 _v) external onlyOwner { motherlodePerRound = _v; emit ConfigUpdated("motherlodePerRound", _v); }

    // ──────────────────────────────────────
    //  Internals
    // ──────────────────────────────────────

    function _startNewRound() internal {
        currentRoundId++;
        uint64 start = uint64(block.timestamp);
        uint64 end = start + uint64(roundDuration);
        rounds[currentRoundId] = Round({
            startTime: start, endTime: end,
            totalDeposits: 0, totalPlayers: 0,
            winningCell: 0, resolved: false, pendingVRF: false
        });
        emit RoundStarted(currentRoundId, start, end);
    }

    function emergencyWithdraw() external onlyOwner {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }
}
