// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

interface IAsset {
    function keyName() external view returns (bytes32);
}
