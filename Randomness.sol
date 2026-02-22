// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Randomness
 * @notice V1 block hash randomness for MegaORE.
 *         Upgrade path: Chainlink VRF when available on MegaETH.
 */
library Randomness {
    function getWinningCell(
        uint256 roundId,
        uint256 totalDeposits,
        uint256 totalPlayers
    ) internal view returns (uint8) {
        uint256 entropy = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    block.timestamp,
                    block.prevrandao,
                    roundId,
                    totalDeposits,
                    totalPlayers,
                    msg.sender
                )
            )
        );
        return uint8(entropy % 25);
    }
}
