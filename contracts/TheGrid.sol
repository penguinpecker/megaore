// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GridToken.sol";
import "./NFTStaking.sol";

/**
 * @title TheGrid (V4 — Bonus Rounds)
 * @notice Core game engine for The Grid protocol on MegaETH.
 *
 *  5×5 grid game with 30-second rounds. Players claim cells, winners
 *  receive ETH prize pool + GRID tokens. VRF via drand ensures fairness.
 *
 *  V4 additions:
 *  - Bonus Round: ~1/2880 chance per round (~once per 24h), winner gets
 *    10× GRID tokens. Determined by VRF, hidden until reveal.
 *  - Full rebrand: ORE → GRID
 *
 *  Carried from V3:
 *  - Winner picked ONLY from occupied cells (guaranteed winner)
 *  - Multiple players per cell
 *  - Pull-based ETH withdrawals to prevent griefing
 *  - try/catch on GRID minting so rounds resolve even if supply exhausted
 *  - Protocol fee capped at 20%
 *
 *  Resolution flow:
 *  1. resolveRound() — marks round pending, emits RandomnessRequested
 *  2. Bot fetches drand randomness
 *  3. fulfillRandomness() — picks winner, checks bonus round, distributes
 */
contract TheGrid is Ownable, ReentrancyGuard {
    uint8 public constant GRID_SIZE = 25;
    uint256 public constant MOTHERLODE_ODDS = 625;

    GridToken public immutable gridToken;
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
    uint256 public gridPerRound;
    uint256 public protocolFeeBps;
    uint256 public motherlodePerRound;
    uint256 public nftBoostBps;
    uint256 public resolverReward;

    // ── Bonus Round ──
    // ~1/2880 chance per resolved round (~once per 24h at 30s rounds)
    // Winner of a bonus round receives bonusMultiplier × gridPerRound
    // Determined from VRF randomness, hidden until round resolves
    uint256 public bonusRoundOdds;       // default 2880
    uint256 public bonusMultiplier;      // default 10 (10× GRID)
    uint256 public totalBonusRounds;

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

    // Track which rounds were bonus rounds (for frontend/indexer queries)
    mapping(uint256 => bool) public isBonusRound;

    event WithdrawalFailed(address indexed winner, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    uint256 public motherlodePool;
    uint256 public totalMotherlodesPaid;

    uint256 public totalRoundsPlayed;
    uint256 public totalETHDeposited;
    uint256 public totalGRIDMinted;
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
        uint256 gridPerWinner,
        uint8 flags // bit 0 = motherlode, bit 1 = bonus round
    );
    event MotherlodeTriggered(uint256 indexed roundId, uint256 amount, uint256 winnersCount);
    event BonusRoundTriggered(uint256 indexed roundId, uint256 gridPerWinner);
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
        address _gridToken,
        address _nftStaking,
        address _feeRecipient,
        address _fulfiller,
        uint256 _depositAmount,
        uint256 _roundDuration,
        uint256 _gridPerRound,
        uint256 _protocolFeeBps,
        uint256 _motherlodePerRound,
        uint256 _nftBoostBps,
        uint256 _resolverReward
    ) Ownable(msg.sender) {
        gridToken = GridToken(_gridToken);
        nftStaking = NFTStaking(payable(_nftStaking));
        feeRecipient = _feeRecipient;
        fulfiller = _fulfiller;

        depositAmount = _depositAmount;
        roundDuration = _roundDuration;
        gridPerRound = _gridPerRound;
        protocolFeeBps = _protocolFeeBps;
        motherlodePerRound = _motherlodePerRound;
        nftBoostBps = _nftBoostBps;
        resolverReward = _resolverReward;

        // Bonus round defaults
        bonusRoundOdds = 2880;   // ~1 per 24h at 30s rounds
        bonusMultiplier = 10;     // 10× GRID

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
            try gridToken.mint(msg.sender, resolverReward) {
                totalGRIDMinted += resolverReward;
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

        if (fee > 0) {
            (bool feeOk, ) = feeRecipient.call{value: fee}("");
            if (!feeOk) {
                pendingWithdrawals[feeRecipient] += fee;
            }
            totalFeesCollected += fee;
        }

        motherlodePool += motherlodePerRound;

        // flags: bit 0 = motherlode, bit 1 = bonus round
        uint8 flags = _checkSpecialRounds(roundId, randomness, winnersCount);

        uint256 potPerWinner = (totalPot - fee) / winnersCount;
        uint256 baseGrid = (gridPerRound * ((flags & 2) != 0 ? bonusMultiplier : 1)) / winnersCount;

        {
            uint256 motherlodePayout = 0;
            if ((flags & 1) != 0) {
                motherlodePayout = motherlodePool;
                motherlodePool = 0;
            }

            for (uint256 i = 0; i < winnersCount; i++) {
                _rewardWinner(winners[i], potPerWinner, baseGrid, motherlodePayout, winnersCount);
            }

            uint256 dust = (totalPot - fee) - (potPerWinner * winnersCount);
            if (dust > 0) {
                (bool dustOk, ) = feeRecipient.call{value: dust}("");
                if (!dustOk) {
                    pendingWithdrawals[feeRecipient] += dust;
                }
            }

            if ((flags & 1) != 0) {
                emit MotherlodeTriggered(roundId, motherlodePayout, winnersCount);
            }
        }

        totalRoundsPlayed++;
        totalETHDeposited += totalPot;

        emit RoundResolved(roundId, winningCell, winnersCount, potPerWinner, baseGrid, flags);
        if ((flags & 2) != 0) {
            emit BonusRoundTriggered(roundId, baseGrid);
        }
    }

    /// @dev Combined check for motherlode + bonus round. Returns packed flags.
    function _checkSpecialRounds(uint256 roundId, bytes32 randomness, uint256 winnersCount) internal returns (uint8 flags) {
        if (winnersCount > 0) {
            uint256 motherlodeRng = uint256(keccak256(abi.encodePacked(randomness, "motherlode"))) % MOTHERLODE_ODDS;
            if (motherlodeRng == 0) {
                totalMotherlodesPaid++;
                flags |= 1;
            }
        }
        uint256 bonusRng = uint256(keccak256(abi.encodePacked(randomness, "bonus_round"))) % bonusRoundOdds;
        if (bonusRng == 0) {
            isBonusRound[roundId] = true;
            totalBonusRounds++;
            flags |= 2;
        }
    }

    function _rewardWinner(
        address winner, uint256 potPerWinner, uint256 baseGrid,
        uint256 motherlodePayout, uint256 winnersCount
    ) internal {
        if (potPerWinner > 0) {
            (bool ok, ) = winner.call{value: potPerWinner}("");
            if (!ok) {
                pendingWithdrawals[winner] += potPerWinner;
                emit WithdrawalFailed(winner, potPerWinner);
            }
        }

        uint256 gridReward = baseGrid;
        if (nftStaking.isStaker(winner)) {
            gridReward += (baseGrid * nftBoostBps) / 10000;
        }
        if (gridReward > 0) {
            try gridToken.mint(winner, gridReward) {
                totalGRIDMinted += gridReward;
            } catch {}
        }

        if (motherlodePayout > 0) {
            uint256 motherShare = motherlodePayout / winnersCount;
            try gridToken.mint(winner, motherShare) {
                totalGRIDMinted += motherShare;
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

    // ── View functions ──

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
        uint8 winningCell, uint256 winnersCount, bool resolved, bool bonusRound
    ) {
        Round memory r = rounds[roundId];
        return (r.winningCell, cellPlayers[roundId][r.winningCell].length, r.resolved, isBonusRound[roundId]);
    }

    function isPendingVRF(uint256 roundId) external view returns (bool) {
        return rounds[roundId].pendingVRF;
    }

    // ── Admin setters ──

    function setFulfiller(address _v) external onlyOwner { fulfiller = _v; emit ConfigUpdated("fulfiller", uint256(uint160(_v))); }
    function setFeeRecipient(address _v) external onlyOwner { feeRecipient = _v; emit ConfigUpdated("feeRecipient", uint256(uint160(_v))); }
    function setDepositAmount(uint256 _v) external onlyOwner { depositAmount = _v; emit ConfigUpdated("depositAmount", _v); }
    function setRoundDuration(uint256 _v) external onlyOwner { roundDuration = _v; emit ConfigUpdated("roundDuration", _v); }
    function setGridPerRound(uint256 _v) external onlyOwner { gridPerRound = _v; emit ConfigUpdated("gridPerRound", _v); }
    function setProtocolFeeBps(uint256 _v) external onlyOwner { require(_v <= 2000, "Fee>20%"); protocolFeeBps = _v; emit ConfigUpdated("protocolFeeBps", _v); }
    function setResolverReward(uint256 _v) external onlyOwner { resolverReward = _v; emit ConfigUpdated("resolverReward", _v); }
    function setNftBoostBps(uint256 _v) external onlyOwner { nftBoostBps = _v; emit ConfigUpdated("nftBoostBps", _v); }
    function setMotherlodePerRound(uint256 _v) external onlyOwner { motherlodePerRound = _v; emit ConfigUpdated("motherlodePerRound", _v); }
    function setBonusRoundOdds(uint256 _v) external onlyOwner { require(_v >= 100, "Too frequent"); bonusRoundOdds = _v; emit ConfigUpdated("bonusRoundOdds", _v); }
    function setBonusMultiplier(uint256 _v) external onlyOwner { require(_v >= 1 && _v <= 100, "1-100x"); bonusMultiplier = _v; emit ConfigUpdated("bonusMultiplier", _v); }

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
