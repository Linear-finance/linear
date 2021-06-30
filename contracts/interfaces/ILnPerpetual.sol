// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnPerpetual {
    function underlyingTokenSymbol() external view returns (bytes32);

    function totalUsdDebt() external view returns (uint256);

    function totalUnderlyingDebt() external view returns (uint256);

    function openPosition(
        address user,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) external returns (uint256 positionId);

    function increasePosition(
        address user,
        uint256 positionId,
        uint256 size,
        uint256 collateral
    ) external;

    function closePositionByAmount(
        address user,
        uint256 positionId,
        uint256 amount,
        address to
    ) external;

    function closePosition(
        address user,
        uint256 positionId,
        address to
    ) external;
}
