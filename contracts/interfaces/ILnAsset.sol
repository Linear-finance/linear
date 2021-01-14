// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILnAsset is IERC20 {
    function keyName() external view returns (bytes32);

    function mint(address account, uint256 amount) external;

    function burn(address account, uint amount) external;
}
