// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./LnAddressCache.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnAddressStorage.sol";
import "./interfaces/ILnPrices.sol";
import "./interfaces/ILnConfig.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "./SafeDecimalMath.sol";

contract LnExchangeSystem is LnAdminUpgradeable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    event ExchangeAsset(
        address fromAddr,
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey,
        uint destRecived,
        uint feeForPool,
        uint feeForFoundation
    );
    event FoundationFeeHolderChanged(address oldHolder, address newHolder);
    event ExitPositionOnlyChanged(bool oldValue, bool newValue);
    event PendingExchangeAdded(
        uint256 id,
        address fromAddr,
        address destAddr,
        uint256 fromAmount,
        bytes32 fromCurrency,
        bytes32 toCurrency
    );
    event PendingExchangeSettled(
        uint256 id,
        address settler,
        uint256 destRecived,
        uint256 feeForPool,
        uint256 feeForFoundation
    );
    event PendingExchangeReverted(uint256 id);

    struct PendingExchangeEntry {
        uint64 id;
        uint64 timestamp;
        address fromAddr;
        address destAddr;
        uint256 fromAmount;
        bytes32 fromCurrency;
        bytes32 toCurrency;
    }

    ILnAddressStorage mAssets;
    ILnPrices mPrices;
    ILnConfig mConfig;
    address mRewardSys;
    address foundationFeeHolder;

    bool public exitPositionOnly;

    uint256 public lastPendingExchangeEntryId;
    mapping(uint256 => PendingExchangeEntry) public pendingExchangeEntries;

    bytes32 private constant ASSETS_KEY = "LnAssetSystem";
    bytes32 private constant PRICES_KEY = "LnPrices";
    bytes32 private constant CONFIG_KEY = "LnConfig";
    bytes32 private constant REWARD_SYS_KEY = "LnRewardSystem";
    bytes32 private constant CONFIG_FEE_SPLIT = "FoundationFeeSplit";
    bytes32 private constant CONFIG_TRADE_SETTLEMENT_DELAY = "TradeSettlementDelay";
    bytes32 private constant CONFIG_TRADE_REVERT_DELAY = "TradeRevertDelay";

    bytes32 private constant LUSD_KEY = "lUSD";

    function __LnExchangeSystem_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function updateAddressCache(ILnAddressStorage _addressStorage) public override onlyAdmin {
        mAssets = ILnAddressStorage(_addressStorage.getAddressWithRequire(ASSETS_KEY, ""));
        mPrices = ILnPrices(_addressStorage.getAddressWithRequire(PRICES_KEY, ""));
        mConfig = ILnConfig(_addressStorage.getAddressWithRequire(CONFIG_KEY, ""));
        mRewardSys = _addressStorage.getAddressWithRequire(REWARD_SYS_KEY, "");

        emit CachedAddressUpdated(ASSETS_KEY, address(mAssets));
        emit CachedAddressUpdated(PRICES_KEY, address(mPrices));
        emit CachedAddressUpdated(CONFIG_KEY, address(mConfig));
        emit CachedAddressUpdated(REWARD_SYS_KEY, address(mRewardSys));
    }

    function setFoundationFeeHolder(address _foundationFeeHolder) public onlyAdmin {
        require(_foundationFeeHolder != address(0), "LnExchangeSystem: zero address");
        require(_foundationFeeHolder != foundationFeeHolder, "LnExchangeSystem: foundation fee holder not changed");

        address oldHolder = foundationFeeHolder;
        foundationFeeHolder = _foundationFeeHolder;

        emit FoundationFeeHolderChanged(oldHolder, foundationFeeHolder);
    }

    function setExitPositionOnly(bool newValue) public onlyAdmin {
        require(exitPositionOnly != newValue, "LnExchangeSystem: value not changed");

        bool oldValue = exitPositionOnly;
        exitPositionOnly = newValue;

        emit ExitPositionOnlyChanged(oldValue, newValue);
    }

    function exchange(
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey
    ) external {
        return _exchange(msg.sender, sourceKey, sourceAmount, destAddr, destKey);
    }

    function settle(uint256 pendingExchangeEntryId) external {
        _settle(pendingExchangeEntryId, msg.sender);
    }

    function revert(uint256 pendingExchangeEntryId) external {
        _revert(pendingExchangeEntryId, msg.sender);
    }

    function _exchange(
        address fromAddr,
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey
    ) private {
        if (exitPositionOnly) {
            require(destKey == LUSD_KEY, "LnExchangeSystem: can only exit position");
        }

        // We don't need the return value here. It's just for preventing entering invalid trades
        mAssets.getAddressWithRequire(destKey, "LnExchangeSystem: dest asset not found");

        ILnAsset source = ILnAsset(mAssets.getAddressWithRequire(sourceKey, "LnExchangeSystem: source asset not found"));

        // Only lock up the source amount here. Everything else will be performed in settlement.
        // The `move` method is a special variant of `transferForm` that doesn't require approval.
        source.move(fromAddr, address(this), sourceAmount);

        // Record the pending entry
        PendingExchangeEntry memory newPendingEntry =
            PendingExchangeEntry({
                id: uint64(++lastPendingExchangeEntryId),
                timestamp: uint64(block.timestamp),
                fromAddr: fromAddr,
                destAddr: destAddr,
                fromAmount: sourceAmount,
                fromCurrency: sourceKey,
                toCurrency: destKey
            });
        pendingExchangeEntries[uint256(newPendingEntry.id)] = newPendingEntry;

        // Emit event for off-chain indexing
        emit PendingExchangeAdded(newPendingEntry.id, fromAddr, destAddr, sourceAmount, sourceKey, destKey);
    }

    function _settle(uint256 pendingExchangeEntryId, address settler) private {
        PendingExchangeEntry memory exchangeEntry = pendingExchangeEntries[pendingExchangeEntryId];
        require(exchangeEntry.id > 0, "LnExchangeSystem: pending entry not found");

        uint settlementDelay = mConfig.getUint(CONFIG_TRADE_SETTLEMENT_DELAY);
        uint256 revertDelay = mConfig.getUint(CONFIG_TRADE_REVERT_DELAY);
        require(settlementDelay > 0, "LnExchangeSystem: settlement delay not set");
        require(revertDelay > 0, "LnExchangeSystem: revert delay not set");
        require(
            block.timestamp >= exchangeEntry.timestamp + settlementDelay,
            "LnExchangeSystem: settlement delay not passed"
        );
        require(
            block.timestamp <= exchangeEntry.timestamp + revertDelay,
            "LnExchangeSystem: trade can only be reverted now"
        );

        ILnAsset source =
            ILnAsset(mAssets.getAddressWithRequire(exchangeEntry.fromCurrency, "LnExchangeSystem: source asset not found"));
        ILnAsset dest =
            ILnAsset(mAssets.getAddressWithRequire(exchangeEntry.toCurrency, "LnExchangeSystem: dest asset not found"));
        uint destAmount = mPrices.exchange(exchangeEntry.fromCurrency, exchangeEntry.fromAmount, exchangeEntry.toCurrency);

        // This might cause a transaction to deadlock, but impact would be negligible
        require(destAmount > 0, "LnExchangeSystem: zero dest amount");

        uint feeRate = mConfig.getUint(exchangeEntry.toCurrency);
        uint destRecived = destAmount.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
        uint fee = destAmount.sub(destRecived);

        // Fee going into the pool, to be adjusted based on foundation split
        uint feeForPoolInUsd = mPrices.exchange(exchangeEntry.toCurrency, fee, mPrices.LUSD());

        // Split the fee between pool and foundation when both holder and ratio are set
        uint256 foundationSplit;
        if (foundationFeeHolder == address(0)) {
            foundationSplit = 0;
        } else {
            uint256 splitRatio = mConfig.getUint(CONFIG_FEE_SPLIT);

            if (splitRatio == 0) {
                foundationSplit = 0;
            } else {
                foundationSplit = feeForPoolInUsd.multiplyDecimal(splitRatio);
                feeForPoolInUsd = feeForPoolInUsd.sub(foundationSplit);
            }
        }

        ILnAsset lusd =
            ILnAsset(mAssets.getAddressWithRequire(mPrices.LUSD(), "LnExchangeSystem: failed to get lUSD address"));

        if (feeForPoolInUsd > 0) lusd.mint(mRewardSys, feeForPoolInUsd);
        if (foundationSplit > 0) lusd.mint(foundationFeeHolder, foundationSplit);

        source.burn(address(this), exchangeEntry.fromAmount);
        dest.mint(exchangeEntry.destAddr, destRecived);

        delete pendingExchangeEntries[pendingExchangeEntryId];

        emit PendingExchangeSettled(exchangeEntry.id, settler, destRecived, feeForPoolInUsd, foundationSplit);
    }

    function _revert(uint256 pendingExchangeEntryId, address reverter) private {
        PendingExchangeEntry memory exchangeEntry = pendingExchangeEntries[pendingExchangeEntryId];
        require(exchangeEntry.id > 0, "LnExchangeSystem: pending entry not found");

        uint256 revertDelay = mConfig.getUint(CONFIG_TRADE_REVERT_DELAY);
        require(revertDelay > 0, "LnExchangeSystem: revert delay not set");
        require(block.timestamp > exchangeEntry.timestamp + revertDelay, "LnExchangeSystem: revert delay not passed");

        ILnAsset source =
            ILnAsset(mAssets.getAddressWithRequire(exchangeEntry.fromCurrency, "LnExchangeSystem: source asset not found"));

        // Refund the amount locked
        source.move(address(this), exchangeEntry.fromAddr, exchangeEntry.fromAmount);

        delete pendingExchangeEntries[pendingExchangeEntryId];

        emit PendingExchangeReverted(exchangeEntry.id);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[42] private __gap;
}
