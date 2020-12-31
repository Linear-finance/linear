// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface ILnRewardLocker {
    function appendReward(
        address _user,
        uint256 _amount,
        uint64 _lockTo
    ) external;
}
