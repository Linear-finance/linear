// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnConfig {
    function BUILD_RATIO() external view returns (bytes32);

    function getUint(bytes32 key) external view returns (uint);
}
