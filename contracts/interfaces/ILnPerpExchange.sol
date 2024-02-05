// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnPerpExchange {
    function insuranceFundHolder() external view returns (address);

    function submitFees(uint256 positionId, uint256 amount) external;

    function submitInsuranceFund(uint256 positionId, uint256 amount) external;

    function requestPositionMint(address to) external returns (uint256 positionId);

    function requestPositionBurn(uint256 positionId) external;

    function requestAssetMint(
        address asset,
        address account,
        uint256 amount
    ) external;

    function requestAssetBurn(
        address asset,
        address account,
        uint256 amount
    ) external;
}
