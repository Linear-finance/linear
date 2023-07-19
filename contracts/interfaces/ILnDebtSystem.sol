// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnDebtSystem {
    function GetUserDebtBalanceInUsd(address _user) external view returns (uint256, uint256);

    function increaseDebt(address _user, uint256 _amount) external;

    function decreaseDebt(address _user, uint256 _amount) external;
}
