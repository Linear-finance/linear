// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnPerpetual.sol";
import "./interfaces/ILnPerpExchange.sol";
import "./interfaces/ILnPerpPositionToken.sol";
import "./interfaces/ILnPrices.sol";

contract LnPerpetual is ILnPerpetual, OwnableUpgradeable {
    using SafeMathUpgradeable for uint256;

    event PositionCreated(
        address indexed user,
        uint256 indexed positionId,
        bool isLong,
        uint256 size,
        uint256 price,
        uint256 collateral,
        uint256 fees
    );
    event PositionIncreased(
        address indexed user,
        uint256 indexed positionId,
        uint256 size,
        uint256 price,
        uint256 additionalCollateral,
        uint256 fees
    );
    event CollateralAdded(address indexed user, uint256 indexed positionId, uint256 amount);
    event CollateralRemoved(address indexed user, uint256 indexed positionId, uint256 amount);
    event PoistionLiquidated(
        address indexed user,
        uint256 indexed positionId,
        uint256 size,
        uint256 price,
        address liquidator,
        uint256 fees,
        uint256 liquidatorReward,
        uint256 insuranceFundContribution
    );
    event PositionPartiallyClosed(
        address indexed user,
        uint256 indexed positionId,
        uint256 size,
        uint256 price,
        uint256 fees
    );
    event PositionClosed(
        address indexed user,
        uint256 indexed positionId,
        uint256 size,
        uint256 price,
        uint256 fees,
        uint256 collateralReturned
    );
    event PositionSync(uint256 indexed positionId, bool isLong, uint256 debt, uint256 locked, uint256 collateral);

    /**
     @param isLong Whether it's a long or short position.
     @param debt The amount of debt to be repaid to close the position. The amount is in lUSD for long positions, and in XYZ for short positions.
     @param locked The amount of locked proceeds. The amout is in XYZ for long positions, and is ignored for short positions.
     @param collateral The amount of lUSD collateral, which includes sell proceeds for short positions.
     */
    struct Position {
        bool isLong;
        uint256 debt;
        uint256 locked;
        uint256 collateral;
    }

    ILnPerpExchange public exchange;
    ILnPerpPositionToken public positionToken;
    ILnAsset public lusdToken;
    ILnAsset public underlyingToken;
    ILnPrices public lnPrices;
    uint256 public minInitMargin;
    uint256 public maintenanceMargin;
    uint256 public feeRate;
    uint256 public liquidatorRewardRatio; // % of position value liquidated to be rewarded
    uint256 public insuranceFundContributionRatio; // % of liquidator reward to be sent to insurance fund instead
    bytes32 public override underlyingTokenSymbol;

    uint256 public override totalUsdDebt;
    uint256 public override totalUnderlyingDebt;
    mapping(uint256 => Position) public positions;

    uint256 private constant UNIT = 10**18;
    bytes32 private constant LUSD = "lUSD";

    modifier onlyExchange() {
        require(msg.sender == address(exchange), "LnPerpetual: not exchange");
        _;
    }

    function __LnPerpetual_init(
        ILnPerpExchange _exchange,
        ILnPerpPositionToken _positionToken,
        ILnAsset _lusdToken,
        ILnAsset _underlyingToken,
        ILnPrices _lnPrices,
        uint256 _minInitMargin,
        uint256 _maintenanceMargin,
        uint256 _feeRate,
        uint256 _liquidatorRewardRatio,
        uint256 _insuranceFundContributionRatio
    ) public initializer {
        __Ownable_init();

        require(address(_exchange) != address(0), "LnPerpetual: zero address");
        require(address(_positionToken) != address(0), "LnPerpetual: zero address");
        require(address(_lusdToken) != address(0), "LnPerpetual: zero address");
        require(address(_underlyingToken) != address(0), "LnPerpetual: zero address");
        require(address(_lnPrices) != address(0), "LnPerpetual: zero address");
        require(_maintenanceMargin > 0, "LnPerpetual: zero amount");
        require(_minInitMargin > _maintenanceMargin, "LnPerpetual: invalid minInitMargin");

        exchange = _exchange;
        positionToken = _positionToken;
        lusdToken = _lusdToken;
        underlyingToken = _underlyingToken;
        lnPrices = _lnPrices;
        minInitMargin = _minInitMargin;
        maintenanceMargin = _maintenanceMargin;
        feeRate = _feeRate;
        liquidatorRewardRatio = _liquidatorRewardRatio;
        insuranceFundContributionRatio = _insuranceFundContributionRatio;

        underlyingTokenSymbol = _underlyingToken.keyName();

        // TODO: check if liquidator reward ratio makes sense
    }

    function setMinInitMargin(uint256 newMinInitMargin) external onlyOwner {
        require(newMinInitMargin > 0, "LnPerpetual: zero amount");
        minInitMargin = newMinInitMargin;
    }

    function setMaintenanceMargin(uint256 newMaintenanceMargin) external onlyOwner {
        require(newMaintenanceMargin > 0, "LnPerpetual: zero amount");
        maintenanceMargin = newMaintenanceMargin;
    }

    function setFeeRate(uint256 newFeeRate) external onlyOwner {
        feeRate = newFeeRate;
    }

    function openPosition(
        address user,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) external override onlyExchange returns (uint256 positionId) {
        positionId = _openPosition(user, isLong, size, collateral);
    }

    function increasePosition(
        address user,
        uint256 positionId,
        uint256 size,
        uint256 collateral
    ) external override onlyExchange {
        _increasePosition(user, positionId, size, collateral);
    }

    function addCollateral(uint256 positionId, uint256 amount) external {
        _addCollateral(msg.sender, positionId, amount);
    }

    function removeCollateral(
        uint256 positionId,
        uint256 amount,
        address to
    ) external {
        require(amount > 0, "LnPerpetual: zero amount");

        _removeCollateral(msg.sender, positionId, amount, to);
    }

    function closePositionByAmount(
        address user,
        uint256 positionId,
        uint256 amount,
        address to
    ) external override onlyExchange {
        require(amount > 0, "LnPerpetual: zero amount");

        _closePositionByAmount(user, positionId, amount, to);
    }

    function closePosition(
        address user,
        uint256 positionId,
        address to
    ) external override onlyExchange {
        _closePositionByAmount(user, positionId, 0, to);
    }

    function liquidatePosition(
        uint256 positionId,
        uint256 amount,
        address rewardTo
    ) external {
        require(amount > 0, "LnPerpetual: zero amount");

        _liquidatePosition(msg.sender, positionId, amount, rewardTo);
    }

    function _openPosition(
        address user,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) private returns (uint256 positionId) {
        require(size > 0, "LnPerpetual: zero amount");
        require(collateral > 0, "LnPerpetual: zero amount");

        positionId = exchange.requestPositionMint(user);

        // Leave all other fields empty and let _addPositionSize take care of that
        if (isLong) {
            positions[positionId].isLong = true;
        }

        uint256 fees = _addPositionSize(positionId, size, collateral);

        emit PositionCreated(user, positionId, isLong, size, lnPrices.getPrice(underlyingTokenSymbol), collateral, fees);

        _emitPositionSync(positionId);
    }

    function _increasePosition(
        address user,
        uint256 positionId,
        uint256 size,
        uint256 collateral
    ) private {
        require(size > 0, "LnPerpetual: zero amount");

        require(user == positionToken.ownerOf(positionId), "LnPerpetual: owner mismatch");
        require(positions[positionId].debt > 0, "LnPerpetual: position not found");

        uint256 fees = _addPositionSize(positionId, size, collateral);

        emit PositionIncreased(user, positionId, size, lnPrices.getPrice(underlyingTokenSymbol), collateral, fees);

        _emitPositionSync(positionId);
    }

    function _addPositionSize(
        uint256 positionId,
        uint256 size,
        uint256 collateral
    ) private returns (uint256 fees) {
        Position storage position = positions[positionId];

        if (collateral > 0) {
            lusdToken.transferFrom(address(exchange), address(this), collateral);
            position.collateral = position.collateral.add(collateral);
        }

        uint256 underlyingValue = lnPrices.exchange(underlyingTokenSymbol, size, LUSD);

        fees = underlyingValue.mul(feeRate).div(UNIT);
        if (fees > 0) {
            position.collateral = position.collateral.sub(fees);

            lusdToken.approve(address(exchange), fees);
            exchange.submitFees(positionId, fees);
        }

        if (position.isLong) {
            // Long: borrow lUSD to buy underlying
            position.debt = position.debt.add(underlyingValue);
            position.locked = position.locked.add(size);

            totalUsdDebt = totalUsdDebt.add(underlyingValue);
            exchange.requestAssetMint(address(underlyingToken), address(this), size);
        } else {
            // Short: borrow underlying to sell into lUSD
            position.debt = position.debt.add(size);
            position.collateral = position.collateral.add(underlyingValue);

            totalUnderlyingDebt = totalUnderlyingDebt.add(size);
            exchange.requestAssetMint(address(lusdToken), address(this), underlyingValue);
        }

        _assertCollateralizationRatio(positionId);
    }

    function _addCollateral(
        address user,
        uint256 positionId,
        uint256 amount
    ) private {
        require(positions[positionId].debt > 0, "LnPerpetual: position not found");

        positions[positionId].collateral = positions[positionId].collateral.add(amount);

        lusdToken.transferFrom(user, address(this), amount);

        emit CollateralAdded(user, positionId, amount);

        _emitPositionSync(positionId);
    }

    function _removeCollateral(
        address user,
        uint256 positionId,
        uint256 amount,
        address to
    ) private {
        require(user == positionToken.ownerOf(positionId), "LnPerpetual: owner mismatch");

        Position memory position = positions[positionId];
        require(position.debt > 0, "LnPerpetual: position not found");

        position.collateral = position.collateral.sub(amount);

        _assertCollateralizationRatio(positionId);

        lusdToken.transfer(to, amount);

        emit CollateralRemoved(user, positionId, amount);

        _emitPositionSync(positionId);
    }

    function _closePositionByAmount(
        address user,
        uint256 positionId,
        uint256 amount,
        address to
    ) private {
        require(user == positionToken.ownerOf(positionId), "LnPerpetual: owner mismatch");

        if (positions[positionId].isLong) {
            _closeLongPosition(user, positionId, amount, to, false);
        } else {
            _closeShortPosition(user, positionId, amount, to, false);
        }
    }

    // TODO: change to automatically calculate amount on-chain in a future iteration
    function _liquidatePosition(
        address liquidator,
        uint256 positionId,
        uint256 amount,
        address rewardTo
    ) private {
        require(
            _calculateCollateralizationRatio(positionId) < maintenanceMargin,
            "LnPerpetual: not lower than maintenance margin"
        );

        address positionOwner = positionToken.ownerOf(positionId);

        (uint256 fees, uint256 liquidatorReward) =
            positions[positionId].isLong
                ? _closeLongPosition(positionOwner, positionId, amount, positionOwner, true)
                : _closeShortPosition(positionOwner, positionId, amount, positionOwner, true);

        uint256 collateralizationRatioAfter = _calculateCollateralizationRatio(positionId);
        require(
            collateralizationRatioAfter >= maintenanceMargin && collateralizationRatioAfter <= minInitMargin,
            "LnPerpetual: invalid liquidation amount"
        );

        // No contribution is holder not set
        uint256 insuranceContribution =
            exchange.insuranceFundHolder() == address(0)
                ? 0
                : liquidatorReward.mul(insuranceFundContributionRatio).div(UNIT);
        liquidatorReward = liquidatorReward.sub(insuranceContribution);

        if (liquidatorReward > 0) {
            // This amount has already been deducted from position collateral
            lusdToken.transfer(rewardTo, liquidatorReward);
        }
        if (insuranceContribution > 0) {
            lusdToken.approve(address(exchange), insuranceContribution);
            exchange.submitInsuranceFund(positionId, insuranceContribution);
        }

        emit PoistionLiquidated(
            positionOwner,
            positionId,
            amount,
            lnPrices.getPrice(underlyingTokenSymbol),
            liquidator,
            fees,
            liquidatorReward,
            insuranceContribution
        );
    }

    function _closeLongPosition(
        address user,
        uint256 positionId,
        uint256 amount,
        address to,
        bool isLiquidation
    ) private returns (uint256 fees, uint256 liquidationReward) {
        Position memory position = positions[positionId];
        require(position.debt > 0, "LnPerpetual: position not found");

        if (amount == 0) {
            amount = position.locked;
        } else {
            require(amount <= position.locked, "LnPerpetual: amount too large");
        }

        // Repay debt proportionally
        uint256 debtToRepay = amount == position.locked ? position.debt : position.debt.mul(amount).div(position.locked);

        // Adjust position data in-memory
        position.debt = position.debt.sub(debtToRepay);
        position.locked = position.locked.sub(amount);

        // Pretend we have a larger debt to repay to account for fees
        fees = debtToRepay.mul(feeRate).div(UNIT);
        if (fees > 0) {
            debtToRepay = debtToRepay.add(fees);

            lusdToken.approve(address(exchange), fees);
            exchange.submitFees(positionId, fees);
        }

        // In liquidation, pretend we have a larger debt to repay (which is actually liquidation reward)
        if (isLiquidation) {
            liquidationReward = debtToRepay.mul(liquidatorRewardRatio).div(UNIT);
            debtToRepay = debtToRepay.add(liquidationReward);
        }

        // Sell underlying into lUSD for debt repayment
        uint256 sellProceeds = lnPrices.exchange(underlyingTokenSymbol, amount, LUSD);
        exchange.requestAssetBurn(address(underlyingToken), address(this), amount);

        if (sellProceeds >= debtToRepay) {
            // Sell proceeds alone are enough to cover debt repayment. The leftover goes into collateral
            position.collateral = position.collateral.add(sellProceeds.sub(debtToRepay));
        } else {
            // Still some debt left after repayment with sell proceeds
            debtToRepay = debtToRepay.sub(sellProceeds);

            if (position.collateral >= debtToRepay) {
                // Collateral enough to repay the remaining amount
                position.collateral = position.collateral.sub(debtToRepay);
            } else {
                // A bankrupted position can only be liquidated
                require(false, "LnPerpetual: bankrupted position");
            }
        }

        totalUsdDebt = totalUsdDebt.sub(debtToRepay);

        if (position.debt == 0 && position.locked == 0) {
            // Position completely closed
            exchange.requestPositionBurn(positionId);
            delete positions[positionId];

            if (position.collateral > 0) {
                lusdToken.transfer(to, amount);
            }

            if (!isLiquidation) {
                emit PositionClosed(
                    user,
                    positionId,
                    amount,
                    lnPrices.getPrice(underlyingTokenSymbol),
                    fees,
                    position.collateral
                );
            }

            emit PositionSync(positionId, true, 0, 0, 0);
        } else {
            // Position partically closed (PnL goes into collateral)
            positions[positionId].debt = position.debt;
            positions[positionId].locked = position.locked;
            positions[positionId].collateral = position.collateral;

            if (!isLiquidation) {
                emit PositionPartiallyClosed(user, positionId, amount, lnPrices.getPrice(underlyingTokenSymbol), fees);
            }

            _emitPositionSync(positionId);
        }
    }

    function _closeShortPosition(
        address user,
        uint256 positionId,
        uint256 amount,
        address to,
        bool isLiquidation
    ) private returns (uint256 fees, uint256 liquidationReward) {
        Position memory position = positions[positionId];
        require(position.debt > 0, "LnPerpetual: position not found");

        uint256 debtToRepay = amount == 0 ? position.debt : amount;
        require(debtToRepay <= position.debt, "LnPerpetual: amount too large");

        // Buy underlying with lUSD
        uint256 lusdNeededToRepay = lnPrices.exchange(underlyingTokenSymbol, debtToRepay, LUSD);

        // Pretend more lUSD is needed to repay the debt to account for fees
        fees = lusdNeededToRepay.mul(feeRate).div(UNIT);
        if (fees > 0) {
            lusdNeededToRepay = lusdNeededToRepay.add(fees);

            lusdToken.approve(address(exchange), fees);
            exchange.submitFees(positionId, fees);
        }

        // In liquidation, pretend more lUSD is needed to repay the debt (which is actually liquidation reward)
        if (isLiquidation) {
            liquidationReward = lusdNeededToRepay.mul(liquidatorRewardRatio).div(UNIT);
            lusdNeededToRepay = lusdNeededToRepay.add(liquidationReward);
        }

        require(position.collateral >= lusdNeededToRepay, "LnPerpetual: bankrupted position");

        exchange.requestAssetBurn(address(lusdToken), address(this), lusdNeededToRepay);

        // Adjust position data in-memory (no SafeMath needed actually)
        position.debt = position.debt.sub(debtToRepay);
        position.collateral = position.collateral.sub(lusdNeededToRepay);

        totalUnderlyingDebt = totalUnderlyingDebt.add(debtToRepay);

        if (position.debt == 0) {
            // Position completely closed
            exchange.requestPositionBurn(positionId);
            delete positions[positionId];

            if (position.collateral > 0) {
                lusdToken.transfer(to, amount);
            }

            if (!isLiquidation) {
                emit PositionClosed(
                    user,
                    positionId,
                    amount,
                    lnPrices.getPrice(underlyingTokenSymbol),
                    fees,
                    position.collateral
                );
            }

            emit PositionSync(positionId, false, 0, 0, 0);
        } else {
            // Position partically closed (PnL goes into collateral)
            positions[positionId].debt = position.debt;
            positions[positionId].collateral = position.collateral;

            if (!isLiquidation) {
                emit PositionPartiallyClosed(user, positionId, amount, lnPrices.getPrice(underlyingTokenSymbol), fees);
            }

            _emitPositionSync(positionId);
        }
    }

    // This function should only be called after position is updated since it reads from storage
    function _assertCollateralizationRatio(uint256 positionId) private view {
        require(_calculateCollateralizationRatio(positionId) >= minInitMargin, "LnPerpetual: min init margin not reached");
    }

    // This function should only be called after position is updated since it reads from storage
    function _calculateCollateralizationRatio(uint256 positionId) private view returns (uint256) {
        Position memory position = positions[positionId];
        require(position.debt > 0, "LnPerpetual: position not found");

        if (position.isLong) {
            // Long: collateralRatio = (collateral + locked * price) / debt - 1
            return
                position
                    .collateral
                    .add(lnPrices.exchange(underlyingTokenSymbol, position.locked, LUSD))
                    .mul(UNIT)
                    .div(position.debt)
                    .sub(UNIT);
        } else {
            // Short: collateralRatio = collateral / (debt * price) - 1
            return
                position.collateral.mul(UNIT).div(lnPrices.exchange(underlyingTokenSymbol, position.debt, LUSD)).sub(UNIT);
        }
    }

    function _emitPositionSync(uint256 positionId) private {
        Position memory position = positions[positionId];
        require(position.debt > 0, "LnPerpetual: position not found");

        emit PositionSync(positionId, position.isLong, position.debt, position.locked, position.collateral);
    }
}
