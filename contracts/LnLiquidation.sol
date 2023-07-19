// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "./interfaces/ILnBuildBurnSystem.sol";
import "./interfaces/ILnCollateralSystem.sol";
import "./interfaces/ILnConfig.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnPrices.sol";
import "./interfaces/ILnRewardLocker.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "./utilities/ConfigHelper.sol";
import "./SafeDecimalMath.sol";

contract LnLiquidation is LnAdminUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeDecimalMath for uint256;

    event PositionMarked(address user, address marker);
    event PositionUnmarked(address user);
    event PositionLiquidated(
        address user,
        address marker,
        address liquidator,
        uint256 debtBurnt,
        bytes32 collateralCurrency,
        uint256 collateralWithdrawnFromStaked,
        uint256 collateralWithdrawnFromLocked,
        uint256 markerReward,
        uint256 liquidatorReward
    );

    struct UndercollateralizationMark {
        address marker;
        uint64 timestamp;
    }
    struct EvalUserPositionResult {
        uint256 debtBalance;
        uint256 stakedCollateral;
        uint256 lockedCollateral;
        uint256 collateralPrice;
        uint8 collateralDecimals;
        uint256 collateralValue;
        uint256 collateralizationRatio;
    }
    struct FetchRatiosResult {
        uint256 issuanceRatio;
        uint256 markerRewardRatio;
        uint256 liquidatorRewardRatio;
    }
    struct LiquidationRewardCalculationResult {
        uint256 collateralWithdrawalAmount;
        uint256 markerReward;
        uint256 liquidatorReward;
        uint256 totalReward;
    }
    struct LiquidatePositionParams {
        address user;
        address liquidator;
        uint256 lusdToBurn;
    }
    struct WithdrawCollateralParams {
        address user;
        address liquidator;
        uint256 collateralWithdrawalAmount;
        uint256 stakedCollateral;
        uint256 lockedCollateral;
    }
    struct DistributeRewardsParams {
        address user;
        address marker;
        address liquidator;
        uint256 markerReward;
        uint256 liquidatorReward;
        uint256 stakedCollateral;
        uint256 lockedCollateral;
    }

    ILnBuildBurnSystem public lnBuildBurnSystem;
    ILnCollateralSystem public lnCollateralSystem;
    ILnConfig public lnConfig;
    ILnDebtSystem public lnDebtSystem;
    ILnPrices public lnPrices;
    ILnRewardLocker public lnRewardLocker;

    mapping(address => UndercollateralizationMark) public undercollateralizationMarks;

    function isPositionMarkedAsUndercollateralized(address user) public view returns (bool) {
        return undercollateralizationMarks[user].timestamp > 0;
    }

    function getUndercollateralizationMarkMarker(address user) public view returns (address) {
        return undercollateralizationMarks[user].marker;
    }

    function getUndercollateralizationMarkTimestamp(address user) public view returns (uint256) {
        return uint256(undercollateralizationMarks[user].timestamp);
    }

    function __LnLiquidation_init(
        ILnBuildBurnSystem _lnBuildBurnSystem,
        ILnCollateralSystem _lnCollateralSystem,
        ILnConfig _lnConfig,
        ILnDebtSystem _lnDebtSystem,
        ILnPrices _lnPrices,
        ILnRewardLocker _lnRewardLocker,
        address _admin
    ) public initializer {
        __LnAdminUpgradeable_init(_admin);

        require(address(_lnBuildBurnSystem) != address(0), "LnLiquidation: zero address");
        require(address(_lnCollateralSystem) != address(0), "LnLiquidation: zero address");
        require(address(_lnConfig) != address(0), "LnLiquidation: zero address");
        require(address(_lnDebtSystem) != address(0), "LnLiquidation: zero address");
        require(address(_lnPrices) != address(0), "LnLiquidation: zero address");
        require(address(_lnRewardLocker) != address(0), "LnLiquidation: zero address");

        lnBuildBurnSystem = _lnBuildBurnSystem;
        lnCollateralSystem = _lnCollateralSystem;
        lnConfig = _lnConfig;
        lnDebtSystem = _lnDebtSystem;
        lnPrices = _lnPrices;
        lnRewardLocker = _lnRewardLocker;
    }

    function setLnPrices(ILnPrices newLnPrices) external onlyAdmin {
        require(address(newLnPrices) != address(0), "LnLiquidation: zero address");
        lnPrices = newLnPrices;
    }

    function markPositionAsUndercollateralized(address user) external {
        require(!isPositionMarkedAsUndercollateralized(user), "LnLiquidation: already marked");

        EvalUserPositionResult memory evalResult = evalUserPostion(user);
        uint256 liquidationRatio =
            lnConfig.getUint(ConfigHelper.getLiquidationRatioKey(lnCollateralSystem.collateralCurrency()));
        require(evalResult.collateralizationRatio > liquidationRatio, "LnLiquidation: not undercollateralized");

        undercollateralizationMarks[user] = UndercollateralizationMark({
            marker: msg.sender,
            timestamp: uint64(block.timestamp)
        });

        emit PositionMarked(user, msg.sender);
    }

    function removeUndercollateralizationMark(address user) external {
        require(isPositionMarkedAsUndercollateralized(user), "LnLiquidation: not marked");

        // Can only remove mark if C ratio is restored to issuance ratio
        EvalUserPositionResult memory evalResult = evalUserPostion(user);
        uint256 markRemoveRatio =
            lnConfig.getUint(ConfigHelper.getLiquidationMarkRemoveRatioKey(lnCollateralSystem.collateralCurrency()));
        require(evalResult.collateralizationRatio <= markRemoveRatio, "LnLiquidation: mark removal ratio violation");

        delete undercollateralizationMarks[user];

        emit PositionUnmarked(user);
    }

    function liquidatePosition(
        address user,
        uint256 lusdToBurn,
        uint256[] calldata rewardEntryIds
    ) external {
        require(lusdToBurn > 0, "LnLiquidation: zero amount");

        _liquidatePosition(
            LiquidatePositionParams({user: user, liquidator: msg.sender, lusdToBurn: lusdToBurn}),
            rewardEntryIds
        );
    }

    function liquidatePositionMax(address user, uint256[] calldata rewardEntryIds) external {
        _liquidatePosition(LiquidatePositionParams({user: user, liquidator: msg.sender, lusdToBurn: 0}), rewardEntryIds);
    }

    function _liquidatePosition(LiquidatePositionParams memory params, uint256[] calldata rewardEntryIds) private {
        // Check mark and delay
        UndercollateralizationMark memory mark = undercollateralizationMarks[params.user];
        {
            uint256 liquidationDelay =
                lnConfig.getUint(ConfigHelper.getLiquidationDelayKey(lnCollateralSystem.collateralCurrency()));
            require(mark.timestamp > 0, "LnLiquidation: not marked for undercollateralized");
            require(block.timestamp > mark.timestamp + liquidationDelay, "LnLiquidation: liquidation delay not passed");
        }

        // Confirm that the position is still undercollateralized
        FetchRatiosResult memory ratios = fetchRatios();
        EvalUserPositionResult memory evalResult = evalUserPostion(params.user);
        require(evalResult.collateralizationRatio > ratios.issuanceRatio, "LnLiquidation: not undercollateralized");

        uint256 maxLusdToBurn =
            evalResult.debtBalance.sub(evalResult.collateralValue.multiplyDecimal(ratios.issuanceRatio)).divideDecimal(
                SafeDecimalMath.unit().sub(
                    SafeDecimalMath.unit().add(ratios.markerRewardRatio.add(ratios.liquidatorRewardRatio)).multiplyDecimal(
                        ratios.issuanceRatio
                    )
                )
            );
        if (params.lusdToBurn == 0) {
            // Liquidate max
            params.lusdToBurn = maxLusdToBurn;
        } else {
            // User specified amount to liquidate
            require(params.lusdToBurn <= maxLusdToBurn, "LnLiquidation: burn amount too large");
        }

        // Burn lUSD and update debt
        lnBuildBurnSystem.burnForLiquidation(params.user, params.liquidator, params.lusdToBurn);

        LiquidationRewardCalculationResult memory rewards =
            calculateRewards(
                params.lusdToBurn,
                evalResult.collateralPrice,
                evalResult.collateralDecimals,
                ratios.markerRewardRatio,
                ratios.liquidatorRewardRatio
            );

        {
            uint256 totalCollateralToMove = rewards.collateralWithdrawalAmount.add(rewards.totalReward);
            uint256 totalCollateralAmount = evalResult.stakedCollateral.add(evalResult.lockedCollateral);
            require(totalCollateralToMove > 0, "LnLiquidation: no collateral withdrawal");
            require(totalCollateralToMove <= totalCollateralAmount, "LnLiquidation: insufficient collateral"); // Insurance fund needed to resolve this
        }

        uint256 totalFromStaked;
        uint256 totalFromLocked;

        // Collateral withdrawal
        {
            (totalFromStaked, totalFromLocked) = withdrawCollateral(
                WithdrawCollateralParams({
                    user: params.user,
                    liquidator: params.liquidator,
                    collateralWithdrawalAmount: rewards.collateralWithdrawalAmount,
                    stakedCollateral: evalResult.stakedCollateral,
                    lockedCollateral: evalResult.lockedCollateral
                }),
                rewardEntryIds
            );

            // Track staked and locked amounts locally
            evalResult.stakedCollateral = evalResult.stakedCollateral.sub(totalFromStaked);
            evalResult.lockedCollateral = evalResult.lockedCollateral.sub(totalFromLocked);
        }

        // Rewards
        {
            (uint256 fromStaked, uint256 fromLocked) =
                distributeRewards(
                    DistributeRewardsParams({
                        user: params.user,
                        marker: mark.marker,
                        liquidator: params.liquidator,
                        markerReward: rewards.markerReward,
                        liquidatorReward: rewards.liquidatorReward,
                        stakedCollateral: evalResult.stakedCollateral,
                        lockedCollateral: evalResult.lockedCollateral
                    }),
                    rewardEntryIds
                );

            totalFromStaked = totalFromStaked.add(fromStaked);
            totalFromLocked = totalFromLocked.add(fromLocked);
        }

        emit PositionLiquidated(
            params.user,
            mark.marker,
            params.liquidator,
            params.lusdToBurn,
            lnCollateralSystem.collateralCurrency(),
            totalFromStaked,
            totalFromLocked,
            rewards.markerReward,
            rewards.liquidatorReward
        );

        // If the position is completely liquidated, remove the marker
        if (params.lusdToBurn == maxLusdToBurn) {
            delete undercollateralizationMarks[params.user];
            emit PositionUnmarked(params.user);
        }
    }

    function evalUserPostion(address user) private view returns (EvalUserPositionResult memory) {
        (uint256 debtBalance, ) = lnDebtSystem.GetUserDebtBalanceInUsd(user);
        (uint256 stakedCollateral, uint256 lockedCollateral) = lnCollateralSystem.getUserLinaCollateralBreakdown(user);

        uint8 collateralDecimals = lnCollateralSystem.collateralDecimals();

        uint256 collateralPrice = lnPrices.getPrice(lnCollateralSystem.collateralCurrency());
        uint256 collateralValue =
            stakedCollateral.add(lockedCollateral).multiplyDecimalWith(collateralPrice, collateralDecimals);

        uint256 collateralizationRatio = collateralValue == 0 ? 0 : debtBalance.divideDecimal(collateralValue);
        return
            EvalUserPositionResult({
                debtBalance: debtBalance,
                stakedCollateral: stakedCollateral,
                lockedCollateral: lockedCollateral,
                collateralPrice: collateralPrice,
                collateralDecimals: collateralDecimals,
                collateralValue: collateralValue,
                collateralizationRatio: collateralizationRatio
            });
    }

    function fetchRatios() private view returns (FetchRatiosResult memory) {
        bytes32 collateralCurrency = lnCollateralSystem.collateralCurrency();

        uint256 issuanceRatio = lnConfig.getUint(ConfigHelper.getBuildRatioKey(collateralCurrency));
        uint256 markerRewardRatio = lnConfig.getUint(ConfigHelper.getLiquidationMarkerRewardKey(collateralCurrency));
        uint256 liquidatorRewardRatio = lnConfig.getUint(ConfigHelper.getLiquidationLiquidatorRewardKey(collateralCurrency));

        return
            FetchRatiosResult({
                issuanceRatio: issuanceRatio,
                markerRewardRatio: markerRewardRatio,
                liquidatorRewardRatio: liquidatorRewardRatio
            });
    }

    function calculateRewards(
        uint256 lusdToBurn,
        uint256 collateralPrice,
        uint8 collateralDecimals,
        uint256 markerRewardRatio,
        uint256 liquidatorRewardRatio
    ) private pure returns (LiquidationRewardCalculationResult memory) {
        // Amount of collateral with the same value as the debt burnt (without taking into account rewards)
        uint256 collateralWithdrawalAmount = lusdToBurn.divideDecimalWith(collateralPrice, collateralDecimals);

        // Reward amounts
        uint256 markerReward = collateralWithdrawalAmount.multiplyDecimal(markerRewardRatio);
        uint256 liquidatorReward = collateralWithdrawalAmount.multiplyDecimal(liquidatorRewardRatio);
        uint256 totalReward = markerReward.add(liquidatorReward);

        return
            LiquidationRewardCalculationResult({
                collateralWithdrawalAmount: collateralWithdrawalAmount,
                markerReward: markerReward,
                liquidatorReward: liquidatorReward,
                totalReward: totalReward
            });
    }

    function withdrawCollateral(WithdrawCollateralParams memory params, uint256[] calldata rewardEntryIds)
        private
        returns (uint256 amountFromStaked, uint256 amountFromLocked)
    {
        amountFromStaked = Math.min(params.collateralWithdrawalAmount, params.stakedCollateral);
        amountFromLocked = params.collateralWithdrawalAmount.sub(amountFromStaked);

        require(amountFromLocked <= params.lockedCollateral, "LnLiquidation: insufficient locked collateral");

        if (amountFromStaked > 0) {
            lnCollateralSystem.moveCollateral(
                params.user,
                params.liquidator,
                lnCollateralSystem.collateralCurrency(),
                amountFromStaked
            );
        }

        if (amountFromLocked > 0) {
            lnRewardLocker.moveReward(params.user, params.liquidator, amountFromLocked, rewardEntryIds);
        }
    }

    function distributeRewards(DistributeRewardsParams memory params, uint256[] calldata rewardEntryIds)
        private
        returns (uint256 amountFromStaked, uint256 amountFromLocked)
    {
        uint256 totalReward = params.markerReward.add(params.liquidatorReward);

        amountFromStaked = Math.min(totalReward, params.stakedCollateral);
        amountFromLocked = totalReward.sub(amountFromStaked);

        require(amountFromLocked <= params.lockedCollateral, "LnLiquidation: insufficient locked collateral");

        uint256 markerRewardFromLocked = params.markerReward;
        uint256 liquidatorRewardFromLocked = params.liquidatorReward;

        if (amountFromStaked > 0) {
            uint256 markerRewardFromStaked = amountFromStaked.mul(params.markerReward).div(totalReward);
            uint256 liquidatorRewardFromStaked = amountFromStaked.sub(markerRewardFromStaked);

            markerRewardFromLocked = markerRewardFromLocked.sub(markerRewardFromStaked);
            liquidatorRewardFromLocked = liquidatorRewardFromLocked.sub(liquidatorRewardFromStaked);

            lnCollateralSystem.moveCollateral(
                params.user,
                params.marker,
                lnCollateralSystem.collateralCurrency(),
                markerRewardFromStaked
            );
            lnCollateralSystem.moveCollateral(
                params.user,
                params.liquidator,
                lnCollateralSystem.collateralCurrency(),
                liquidatorRewardFromStaked
            );
        }

        if (amountFromLocked > 0) {
            lnRewardLocker.moveRewardProRata(
                params.user,
                params.marker,
                markerRewardFromLocked,
                params.liquidator,
                liquidatorRewardFromLocked,
                rewardEntryIds
            );
        }
    }
}
