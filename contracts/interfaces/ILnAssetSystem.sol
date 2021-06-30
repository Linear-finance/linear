// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnAssetSystem {
    function perpAddresses(bytes32 symbol) external view returns (address);

    function perpSymbols(address perpAddress) external view returns (bytes32);

    function isPerpAddressRegistered(address perpAddress) external view returns (bool);

    function totalAssetsInUsd() external view returns (uint256 rTotal);
}
