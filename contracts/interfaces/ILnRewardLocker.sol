// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnRewardLocker {
    function balanceOf(address user) external view returns (uint256);

    function totalNeedToReward() external view returns (uint256);

    function appendReward(
        address _user,
        uint256 _amount,
        uint64 _lockTo
    ) external;
}
