// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnDebtSystem {
    function GetUserDebtBalanceInUsd(address _user, bytes32 _currency) external view returns (uint256, uint256);

    function UpdateDebt(
        address _user,
        uint256 _debtProportion,
        uint256 _factor,
        bytes32 _currencySymbol
    ) external;
}
