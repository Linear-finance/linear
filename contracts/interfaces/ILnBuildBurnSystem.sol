// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface ILnBuildBurnSystem {
    function buildFromCollateralSys(address user, uint256 amount) external;

    function buildMaxFromCollateralSys(address user) external;

    function burnFromCollateralSys(address user, uint256 amount) external;
}
