// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "./upgradeable/LnAdminUpgradeable.sol";

contract LinearFinance is ERC20Upgradeable, LnAdminUpgradeable {
    using SafeMathUpgradeable for uint256;

    uint256 public constant MAX_SUPPLY = 10000000000e18;

    function __LinearFinance_init(address _admin) public initializer {
        __ERC20_init("Linear Token", "LINA");
        __LnAdminUpgradeable_init(_admin);
    }

    function mint(address account, uint256 amount) external onlyAdmin {
        require(totalSupply().add(amount) <= MAX_SUPPLY, "LinearFinance: max supply exceeded");
        _mint(account, amount);
    }

    function burn(address account, uint amount) external onlyAdmin {
        _burn(account, amount);
    }
}
