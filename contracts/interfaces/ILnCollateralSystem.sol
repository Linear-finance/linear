// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnCollateralSystem {
    function getUserLinaCollateralBreakdown(address _user) external view returns (uint256 staked, uint256 locked);

    function IsSatisfyTargetRatioByCurrency(address _user, bytes32 _currencySymbol) external view returns (bool);

    function GetUserCollateral(address _user, bytes32 _currency) external view returns (uint256);

    function GetUserTotalCollateralInUsd(address _user) external view returns (uint256 rTotal);

    function MaxRedeemableInUsd(address _user) external view returns (uint256);

    function getFreeCollateralInUsd(address user, bytes32 currencySymbol) external view returns (uint256);

    function moveCollateral(
        address fromUser,
        address toUser,
        bytes32 currency,
        uint256 amount
    ) external;

    function collateralFromUnlockReward(
        address user,
        address rewarder,
        bytes32 currency,
        uint256 amount
    ) external;

    function GetUserCollateralInUsd(address _user, bytes32 _currencySymbol) external view returns (uint256 rTotal);
}
