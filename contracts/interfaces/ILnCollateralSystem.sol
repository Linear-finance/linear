// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface ILnCollateralSystem {
    function IsSatisfyTargetRatio(address _user) external view returns (bool);
}
