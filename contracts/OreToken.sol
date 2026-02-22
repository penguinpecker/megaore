// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OreToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 5_000_000 ether;

    address public minter;
    bool public mintFrozen;

    event MinterSet(address indexed oldMinter, address indexed newMinter);
    event MintFrozen();

    error NotMinter();
    error MintIsFrozen();
    error ExceedsMaxSupply();
    error ZeroAddress();

    constructor() ERC20("MegaORE", "ORE") Ownable(msg.sender) {}

    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert ZeroAddress();
        emit MinterSet(minter, _minter);
        minter = _minter;
    }

    function freezeMint() external onlyOwner {
        mintFrozen = true;
        emit MintFrozen();
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (mintFrozen) revert MintIsFrozen();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external {
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
