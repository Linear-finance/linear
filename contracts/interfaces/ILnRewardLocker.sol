// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnRewardLocker {
    function balanceOf(address user) external view returns (uint256);

    function totalLockedAmount() external view returns (uint256);

    function addReward(
        address user,
        uint256 amount,
        uint256 unlockTime
    ) external;
}
