// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IDebtDistribution.sol";
import "./interfaces/ILnAssetSystem.sol";

/**
 * @title DebtDistribution
 *
 * @dev This contract was added for the multi-collateral upgrade for distributing the aggregated
 * debt amount proportionally to each collateral type. It works by requiring all `DebtSystem`
 * instances to report to this contract whenever debt changes.
 *
 * This contract is invisible to consumers of `DebtSystem`, and is only used for coordination among
 * `DebtSystem` instances.
 */
contract DebtDistribution is IDebtDistribution, OwnableUpgradeable {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    event CollateralRegistered(address indexed debtSystemAddress, bytes32 indexed collteralSymbol);
    event DebtUpdated(
        address indexed debtSystemAddress,
        bytes32 indexed collteralSymbol,
        uint256 newCollateralProportion,
        uint256 newGlobalDebtFactor
    );

    struct CollateralDebtData {
        uint256 debtProportion;
        uint256 debtFactor;
    }

    mapping(address => bytes32) public collateralSymbols;

    // We use the exact same mechanism as in `DebtSystem` for tracking collateral debt proportions.
    uint256 public globalDebtFactor;
    mapping(address => CollateralDebtData) public collateralDebtData;

    ILnAssetSystem public assetRegistry;

    modifier onlyRegisteredCollaterals() {
        require(collateralSymbols[msg.sender] != bytes32(0), "DebtDistribution: permission denied");
        _;
    }

    function getCollateralDebtBalanceByDebtSystemAddress(address _debtSystem) external view override returns (uint256) {
        (uint256 collateralDebtBalance, ) = _getDebtBalances(_debtSystem);
        return collateralDebtBalance;
    }

    function __DebtDistribution_init(ILnAssetSystem _assetRegistry) external initializer {
        __Ownable_init();

        require(address(_assetRegistry) != address(0), "DebtDistribution: zero address");

        assetRegistry = _assetRegistry;
    }

    function addCollateral(address _contractAddress, bytes32 _collateralSymbol) external onlyOwner {
        collateralSymbols[_contractAddress] = _collateralSymbol;

        emit CollateralRegistered(_contractAddress, _collateralSymbol);
    }

    function increaseDebt(uint256 _amount) external override onlyRegisteredCollaterals {
        _increaseDebt(msg.sender, _amount);
    }

    function decreaseDebt(uint256 _amount) external override onlyRegisteredCollaterals {
        _decreaseDebt(msg.sender, _amount);
    }

    function _getDebtBalances(address _debtSystem)
        private
        view
        returns (uint256 collateralDebtBalance, uint256 systemDebtBalance)
    {
        systemDebtBalance = assetRegistry.totalAssetsInUsd();

        uint256 debtProportion = collateralDebtData[_debtSystem].debtProportion;

        if (debtProportion > 0) {
            uint256 recordedDebtFactor = collateralDebtData[_debtSystem].debtFactor;
            uint256 latestDebtProportion =
                (globalDebtFactor == 0 ? SafeDecimalMath.preciseUnit() : globalDebtFactor)
                    .divideDecimalRoundPrecise(recordedDebtFactor)
                    .multiplyDecimalRoundPrecise(debtProportion);

            collateralDebtBalance = systemDebtBalance
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(latestDebtProportion)
                .preciseDecimalToDecimal();
        }
    }

    function _increaseDebt(address _debtSystemAddress, uint256 _amount) private {
        (uint256 oldCollateralDebtBalance, uint256 oldSystemDebtBalance) = _getDebtBalances(_debtSystemAddress);

        uint256 newCollateralDebtBalance = oldCollateralDebtBalance.add(_amount);
        uint256 newSystemDebtBalance = oldSystemDebtBalance.add(_amount);
        uint256 amountProportion = _amount.divideDecimalRoundPrecise(newSystemDebtBalance);

        uint256 newCollateralDebtProportion = newCollateralDebtBalance.divideDecimalRoundPrecise(newSystemDebtBalance);
        uint256 oldDebtProportion = SafeDecimalMath.preciseUnit().sub(amountProportion);

        _updateDebt(_debtSystemAddress, newCollateralDebtProportion, oldDebtProportion);
    }

    function _decreaseDebt(address _debtSystemAddress, uint256 _amount) private {
        (uint256 oldCollateralDebtBalance, uint256 oldSystemDebtBalance) = _getDebtBalances(_debtSystemAddress);

        uint256 newCollateralDebtBalance = oldCollateralDebtBalance.sub(_amount);
        uint256 newSystemDebtBalance = oldSystemDebtBalance.sub(_amount);

        uint256 newCollateralDebtProportion = newCollateralDebtBalance.divideDecimalRoundPrecise(newSystemDebtBalance);

        uint256 oldDebtProportion;
        if (newSystemDebtBalance > 0) {
            uint256 amountProportion = _amount.divideDecimalRoundPrecise(newSystemDebtBalance);
            oldDebtProportion = SafeDecimalMath.preciseUnit().add(amountProportion);
        } else {
            oldDebtProportion = 0;
        }

        _updateDebt(_debtSystemAddress, newCollateralDebtProportion, oldDebtProportion);
    }

    function _updateDebt(
        address _debtSystemAddress,
        uint256 _debtProportion,
        uint256 _factor
    ) private {
        uint256 newGlobalDebtFactor =
            globalDebtFactor == 0 ? SafeDecimalMath.preciseUnit() : globalDebtFactor.multiplyDecimalRoundPrecise(_factor);
        globalDebtFactor = newGlobalDebtFactor;

        collateralDebtData[_debtSystemAddress] = CollateralDebtData({
            debtProportion: _debtProportion,
            debtFactor: newGlobalDebtFactor
        });

        emit DebtUpdated(_debtSystemAddress, collateralSymbols[_debtSystemAddress], _debtProportion, newGlobalDebtFactor);
    }
}
