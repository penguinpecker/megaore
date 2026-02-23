// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ITheGrid {
    function resolveRound() external;
    function fulfillRandomness(uint256 requestId, bytes32 randomness, uint64 drandRound, bytes calldata signature) external;
    function currentRoundId() external view returns (uint256);
    function roundToRequestId(uint256 roundId) external view returns (uint256);
    function rounds(uint256) external view returns (
        uint64 startTime,
        uint64 endTime,
        uint256 totalDeposits,
        uint16 totalPlayers,
        uint8 winningCell,
        bool resolved,
        bool pendingVRF
    );
}

/**
 * @title GridBatchResolver
 * @notice Combines resolveRound() + fulfillRandomness() into a single
 *         atomic transaction. Eliminates nonce conflicts on MegaETH's
 *         10ms block times where sequential txs can race.
 */
contract GridBatchResolver {
    address public owner;
    ITheGrid public immutable grid;

    error OnlyOwner();
    error RoundNotReady();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _grid) {
        owner = msg.sender;
        grid = ITheGrid(_grid);
    }

    function fulfillOnly(
        uint256 roundId,
        bytes32 randomness,
        uint64 drandRound,
        bytes calldata signature
    ) external onlyOwner {
        uint256 requestId = grid.roundToRequestId(roundId);
        grid.fulfillRandomness(requestId, randomness, drandRound, signature);
    }

    function resolveAndFulfill(
        bytes32 randomness,
        uint64 drandRound,
        bytes calldata signature
    ) external onlyOwner {
        uint256 currentRound = grid.currentRoundId();

        (,,, uint16 totalPlayers,, bool resolved, bool pendingVRF) = grid.rounds(currentRound);

        if (resolved || pendingVRF) revert RoundNotReady();

        grid.resolveRound();

        if (totalPlayers > 0) {
            uint256 requestId = grid.roundToRequestId(currentRound);
            grid.fulfillRandomness(requestId, randomness, drandRound, signature);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
