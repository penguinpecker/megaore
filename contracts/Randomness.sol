// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
