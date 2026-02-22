// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OreToken.sol";
import "./NFTStaking.sol";

/**
 * @title OreGrid (V3 — Guaranteed Winners)
 * @notice Core game engine for MegaORE protocol on MegaETH.
 *
 *  Changes from V2:
 *  - Winner picked ONLY from occupied cells (no more empty-cell wins)
 *  - Multiple players allowed per cell (visible on-chain via getCellCounts)
 *  - Protocol fee sent directly to feeRecipient EOA (no treasury contract)
 *  - _handleNoWinners removed — every round with miners has a winner
 *  - Pull-based ETH withdrawals to prevent griefing attacks
 *  - try/catch on ORE minting so rounds resolve even if supply exhausted
 *  - Protocol fee capped at 20%
 *
 *  Resolution flow:
 *  1. resolveRound() — marks round pending, emits RandomnessRequested
 *  2. Bot fetches drand randomness
 *  3. fulfillRandomness() — picks winner from occupied cells + distributes
 */
contract OreGrid is Ownable, ReentrancyGuard {
    uint8 public constant GRID_SIZE = 25;
    uint256 public constant MOTHERLODE_ODDS = 625;

    OreToken public immutable oreToken;
    NFTStaking public immutable nftStaking;

    address public feeRecipient;

    address public fulfiller;
    uint256 public nextRequestId;

    struct VRFRequest {
        uint256 roundId;
        bool fulfilled;
    }
    mapping(uint256 => VRFRequest) public vrfRequests;
    mapping(uint256 => uint256) public roundToRequestId;

    uint256 public depositAmount;
    uint256 public roundDuration;
    uint256 public orePerRound;
    uint256 public protocolFeeBps;
    uint256 public motherlodePerRound;
    uint256 public nftBoostBps;
    uint256 public resolverReward;

    struct Round {
        uint64 startTime;
        uint64 endTime;
        uint256 totalDeposits;
        uint16 totalPlayers;
        uint8 winningCell;
        bool resolved;
        bool pendingVRF;
    }

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint8 => address[])) public cellPlayers;
    mapping(uint256 => mapping(address => uint8)) public playerCell;
    mapping(uint256 => mapping(address => bool)) public hasJoined;

    mapping(uint256 => uint8[]) internal _occupiedCells;
    mapping(uint256 => mapping(uint8 => bool)) internal _cellOccupied;

    mapping(address => uint256) public pendingWithdrawals;

    event WithdrawalFailed(address indexed winner, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    uint256 public motherlodePool;
    uint256 public totalMotherlodesPaid;

    uint256 public totalRoundsPlayed;
    uint256 public totalETHDeposited;
    uint256 public totalOREMinted;
    uint256 public totalFeesCollected;

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

    constructor(
        address _oreToken,
        address _nftStaking,
        address _feeRecipient,
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
        feeRecipient = _feeRecipient;
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

    function joinRound(uint8 cell) external payable nonReentrant {
        if (cell >= GRID_SIZE) revert InvalidCell();
        if (msg.value != depositAmount) revert IncorrectDeposit();

        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (block.timestamp >= round.endTime) revert RoundNotActive();
        if (hasJoined[roundId][msg.sender]) revert AlreadyJoinedThisRound();

        hasJoined[roundId][msg.sender] = true;
        playerCell[roundId][msg.sender] = cell;
        cellPlayers[roundId][cell].push(msg.sender);

        if (!_cellOccupied[roundId][cell]) {
            _cellOccupied[roundId][cell] = true;
            _occupiedCells[roundId].push(cell);
        }

        round.totalDeposits += msg.value;
        round.totalPlayers++;

        emit PlayerJoined(roundId, msg.sender, cell);
    }

    function resolveRound() external nonReentrant {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];

        if (block.timestamp < round.endTime) revert RoundNotEnded();
        if (round.resolved) revert RoundAlreadyResolved();
        if (round.pendingVRF) revert RoundAlreadyPending();

        if (round.totalPlayers == 0) {
            round.resolved = true;
            _startNewRound();
            return;
        }

        round.pendingVRF = true;

        uint256 requestId = nextRequestId++;
        vrfRequests[requestId] = VRFRequest({
            roundId: roundId,
            fulfilled: false
        });
        roundToRequestId[roundId] = requestId;

        emit RandomnessRequested(requestId, msg.sender);

        if (resolverReward > 0) {
            try oreToken.mint(msg.sender, resolverReward) {
                totalOREMinted += resolverReward;
            } catch {}
        }

        _startNewRound();
    }

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

        uint8[] memory occupied = _occupiedCells[roundId];
        uint256 index = uint256(randomness) % occupied.length;
        uint8 winningCell = occupied[index];
        round.winningCell = winningCell;

        _distributeRewards(roundId, winningCell, randomness);
    }

    function _distributeRewards(uint256 roundId, uint8 winningCell, bytes32 randomness) internal {
        Round storage round = rounds[roundId];
        address[] memory winners = cellPlayers[roundId][winningCell];
        uint256 winnersCount = winners.length;

        uint256 totalPot = round.totalDeposits;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 distributablePot = totalPot - fee;

        if (fee > 0) {
            (bool feeOk, ) = feeRecipient.call{value: fee}("");
            if (!feeOk) {
                pendingWithdrawals[feeRecipient] += fee;
            }
            totalFeesCollected += fee;
        }

        motherlodePool += motherlodePerRound;

        bool motherlodeTriggered = _checkMotherlode(randomness, winnersCount);

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

        uint256 dust = distributablePot - (potPerWinner * winnersCount);
        if (dust > 0) {
            (bool dustOk, ) = feeRecipient.call{value: dust}("");
            if (!dustOk) {
                pendingWithdrawals[feeRecipient] += dust;
            }
        }

        totalRoundsPlayed++;
        totalETHDeposited += totalPot;

        emit RoundResolved(roundId, winningCell, winnersCount, potPerWinner, baseOre, motherlodeTriggered);
        if (motherlodeTriggered) {
            emit MotherlodeTriggered(roundId, motherlodePayout, winnersCount);
        }
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

    function _rewardWinner(
        address winner, uint256 potPerWinner, uint256 baseOre,
        uint256 motherlodePayout, uint256 winnersCount
    ) internal {
        if (potPerWinner > 0) {
            (bool ok, ) = winner.call{value: potPerWinner}("");
            if (!ok) {
                pendingWithdrawals[winner] += potPerWinner;
                emit WithdrawalFailed(winner, potPerWinner);
            }
        }

        uint256 oreReward = baseOre;
        if (nftStaking.isStaker(winner)) {
            oreReward += (baseOre * nftBoostBps) / 10000;
        }
        if (oreReward > 0) {
            try oreToken.mint(winner, oreReward) {
                totalOREMinted += oreReward;
            } catch {}
        }

        if (motherlodePayout > 0) {
            uint256 motherShare = motherlodePayout / winnersCount;
            try oreToken.mint(winner, motherShare) {
                totalOREMinted += motherShare;
            } catch {}
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert TransferFailed();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

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

    function getOccupiedCells(uint256 roundId) external view returns (uint8[] memory) {
        return _occupiedCells[roundId];
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

    function setFulfiller(address _v) external onlyOwner { fulfiller = _v; emit ConfigUpdated("fulfiller", uint256(uint160(_v))); }
    function setFeeRecipient(address _v) external onlyOwner { feeRecipient = _v; emit ConfigUpdated("feeRecipient", uint256(uint160(_v))); }
    function setDepositAmount(uint256 _v) external onlyOwner { depositAmount = _v; emit ConfigUpdated("depositAmount", _v); }
    function setRoundDuration(uint256 _v) external onlyOwner { roundDuration = _v; emit ConfigUpdated("roundDuration", _v); }
    function setOrePerRound(uint256 _v) external onlyOwner { orePerRound = _v; emit ConfigUpdated("orePerRound", _v); }
    function setProtocolFeeBps(uint256 _v) external onlyOwner { require(_v <= 2000, "Fee>20%"); protocolFeeBps = _v; emit ConfigUpdated("protocolFeeBps", _v); }
    function setResolverReward(uint256 _v) external onlyOwner { resolverReward = _v; emit ConfigUpdated("resolverReward", _v); }
    function setNftBoostBps(uint256 _v) external onlyOwner { nftBoostBps = _v; emit ConfigUpdated("nftBoostBps", _v); }
    function setMotherlodePerRound(uint256 _v) external onlyOwner { motherlodePerRound = _v; emit ConfigUpdated("motherlodePerRound", _v); }

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

    receive() external payable {}
}
