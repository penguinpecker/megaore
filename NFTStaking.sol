// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTStaking
 * @notice Stake MegaBit NFTs for MegaORE protocol:
 *         - +50% ORE mining boost in OreGrid
 *         - ETH revenue share from OreTreasury
 */
contract NFTStaking is Ownable, ReentrancyGuard {
    IERC721 public immutable megabitNFT;

    struct Stake {
        address owner;
        uint64 stakedAt;
    }

    mapping(uint256 => Stake) public stakes;
    mapping(address => uint256[]) public stakedTokens;
    uint256 public totalStaked;

    uint256 public rewardPerToken;
    mapping(address => uint256) public userRewardDebt;
    mapping(address => uint256) public pendingRewards;

    address public gridContract;
    address public treasuryContract;

    event Staked(address indexed user, uint256 indexed tokenId);
    event Unstaked(address indexed user, uint256 indexed tokenId);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardsDeposited(uint256 amount);

    error NotTokenOwner();
    error NotStaker();
    error ZeroAddress();
    error NothingToClaim();
    error TransferFailed();

    constructor(address _megabitNFT) Ownable(msg.sender) {
        if (_megabitNFT == address(0)) revert ZeroAddress();
        megabitNFT = IERC721(_megabitNFT);
    }

    function setGridContract(address _grid) external onlyOwner {
        if (_grid == address(0)) revert ZeroAddress();
        gridContract = _grid;
    }

    function setTreasuryContract(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasuryContract = _treasury;
    }

    function stake(uint256 tokenId) external nonReentrant {
        if (megabitNFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _updateRewards(msg.sender);
        megabitNFT.transferFrom(msg.sender, address(this), tokenId);
        stakes[tokenId] = Stake({ owner: msg.sender, stakedAt: uint64(block.timestamp) });
        stakedTokens[msg.sender].push(tokenId);
        totalStaked++;
        emit Staked(msg.sender, tokenId);
    }

    function unstake(uint256 tokenId) external nonReentrant {
        if (stakes[tokenId].owner != msg.sender) revert NotStaker();
        _updateRewards(msg.sender);
        _claimRewards(msg.sender);
        _removeFromStakedList(msg.sender, tokenId);
        delete stakes[tokenId];
        totalStaked--;
        megabitNFT.transferFrom(address(this), msg.sender, tokenId);
        emit Unstaked(msg.sender, tokenId);
    }

    function depositRewards() external payable {
        if (totalStaked == 0) {
            (bool ok, ) = owner().call{value: msg.value}("");
            if (!ok) revert TransferFailed();
            return;
        }
        rewardPerToken += (msg.value * 1e18) / totalStaked;
        emit RewardsDeposited(msg.value);
    }

    function claimRewards() external nonReentrant {
        _updateRewards(msg.sender);
        _claimRewards(msg.sender);
    }

    function isStaker(address user) external view returns (bool) {
        return stakedTokens[user].length > 0;
    }

    function stakedCount(address user) external view returns (uint256) {
        return stakedTokens[user].length;
    }

    function getStakedTokens(address user) external view returns (uint256[] memory) {
        return stakedTokens[user];
    }

    function earned(address user) external view returns (uint256) {
        uint256 count = stakedTokens[user].length;
        if (count == 0) return pendingRewards[user];
        return pendingRewards[user] + (count * rewardPerToken / 1e18) - userRewardDebt[user];
    }

    function _updateRewards(address user) internal {
        uint256 count = stakedTokens[user].length;
        if (count > 0) {
            pendingRewards[user] += (count * rewardPerToken / 1e18) - userRewardDebt[user];
        }
        userRewardDebt[user] = count * rewardPerToken / 1e18;
    }

    function _claimRewards(address user) internal {
        uint256 reward = pendingRewards[user];
        if (reward == 0) revert NothingToClaim();
        pendingRewards[user] = 0;
        (bool ok, ) = user.call{value: reward}("");
        if (!ok) revert TransferFailed();
        emit RewardsClaimed(user, reward);
    }

    function _removeFromStakedList(address user, uint256 tokenId) internal {
        uint256[] storage tokens = stakedTokens[user];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                return;
            }
        }
    }

    receive() external payable {
        if (totalStaked == 0) return;
        rewardPerToken += (msg.value * 1e18) / totalStaked;
        emit RewardsDeposited(msg.value);
    }
}
