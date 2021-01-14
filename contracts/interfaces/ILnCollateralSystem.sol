// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnCollateralSystem {
    function IsSatisfyTargetRatio(address _user) external view returns (bool);

    function GetUserTotalCollateralInUsd(address _user) external view returns (uint256 rTotal);

    function MaxRedeemableInUsd(address _user) external view returns (uint256);
}
