// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface ILnAssetSystem {
    function totalAssetsInUsd() external view returns (uint256 rTotal);
}
