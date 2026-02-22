// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OreToken.sol";

/**
 * @title OreTreasury
 * @notice Receives 10% protocol fee from OreGrid and splits:
 *         - 40% → Team wallet
 *         - 30% → Buyback ORE from DEX + burn
 *         - 30% → NFT staker rewards
 */
contract OreTreasury is Ownable, ReentrancyGuard {
    OreToken public immutable oreToken;
    address public stakingContract;
    address public teamWallet;
    address public gridContract;

    uint256 public teamShare = 4000;
    uint256 public buybackShare = 3000;
    uint256 public stakerShare = 3000;

    address public dexRouter;

    uint256 public totalReceived;
    uint256 public totalDistributed;
    uint256 public totalBurned;
    uint256 public pendingBuyback;

    event FeeReceived(uint256 amount, uint256 roundId);
    event Distributed(uint256 toTeam, uint256 toBuyback, uint256 toStakers);
    event BuybackExecuted(uint256 ethSpent, uint256 oreBurned);
    event SharesUpdated(uint256 team, uint256 buyback, uint256 staker);

    error ZeroAddress();
    error InvalidShares();
    error NothingToDistribute();
    error NotGridContract();
    error TransferFailed();

    constructor(address _oreToken, address _teamWallet) Ownable(msg.sender) {
        if (_oreToken == address(0) || _teamWallet == address(0)) revert ZeroAddress();
        oreToken = OreToken(_oreToken);
        teamWallet = _teamWallet;
    }

    function setStakingContract(address _staking) external onlyOwner {
        if (_staking == address(0)) revert ZeroAddress();
        stakingContract = _staking;
    }

    function setGridContract(address _grid) external onlyOwner {
        if (_grid == address(0)) revert ZeroAddress();
        gridContract = _grid;
    }

    function setTeamWallet(address _team) external onlyOwner {
        if (_team == address(0)) revert ZeroAddress();
        teamWallet = _team;
    }

    function setDexRouter(address _router) external onlyOwner {
        dexRouter = _router;
    }

    function setShares(uint256 _team, uint256 _buyback, uint256 _staker) external onlyOwner {
        if (_team + _buyback + _staker != 10000) revert InvalidShares();
        teamShare = _team;
        buybackShare = _buyback;
        stakerShare = _staker;
        emit SharesUpdated(_team, _buyback, _staker);
    }

    function depositFee(uint256 roundId) external payable {
        if (msg.sender != gridContract) revert NotGridContract();
        totalReceived += msg.value;
        emit FeeReceived(msg.value, roundId);
    }

    function distribute() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();

        uint256 toTeam = (balance * teamShare) / 10000;
        uint256 toBuyback = (balance * buybackShare) / 10000;
        uint256 toStakers = balance - toTeam - toBuyback;

        if (toTeam > 0) {
            (bool ok, ) = teamWallet.call{value: toTeam}("");
            if (!ok) revert TransferFailed();
        }

        pendingBuyback += toBuyback;

        if (toStakers > 0 && stakingContract != address(0)) {
            (bool ok, ) = stakingContract.call{value: toStakers}("");
            if (!ok) revert TransferFailed();
        }

        totalDistributed += balance;
        emit Distributed(toTeam, toBuyback, toStakers);
    }

    function executeBuyback() external onlyOwner nonReentrant {
        uint256 amount = pendingBuyback;
        pendingBuyback = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function burnOre(uint256 amount) external onlyOwner {
        oreToken.burn(amount);
        totalBurned += amount;
        emit BuybackExecuted(0, amount);
    }

    function getStats() external view returns (
        uint256 _totalReceived,
        uint256 _totalDistributed,
        uint256 _totalBurned,
        uint256 _pendingBuyback,
        uint256 _balance
    ) {
        return (totalReceived, totalDistributed, totalBurned, pendingBuyback, address(this).balance);
    }

    receive() external payable {}
}
