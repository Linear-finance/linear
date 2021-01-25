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

    ILnAddressStorage mAssets;
    ILnPrices mPrices;
    ILnConfig mConfig;
    address mRewardSys;
    address foundationFeeHolder;

    bytes32 private constant ASSETS_KEY = "LnAssetSystem";
    bytes32 private constant PRICES_KEY = "LnPrices";
    bytes32 private constant CONFIG_KEY = "LnConfig";
    bytes32 private constant REWARD_SYS_KEY = "LnRewardSystem";
    bytes32 private constant CONFIG_FEE_SPLIT = "FoundationFeeSplit";

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

    function exchange(
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey
    ) external {
        return _exchange(msg.sender, sourceKey, sourceAmount, destAddr, destKey);
    }

    function _exchange(
        address fromAddr,
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey
    ) internal {
        ILnAsset source = ILnAsset(mAssets.getAddressWithRequire(sourceKey, ""));
        ILnAsset dest = ILnAsset(mAssets.getAddressWithRequire(destKey, ""));
        uint destAmount = mPrices.exchange(sourceKey, sourceAmount, destKey);
        require(destAmount > 0, "dest amount must > 0");

        uint feeRate = mConfig.getUint(destKey);
        uint destRecived = destAmount.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
        uint fee = destAmount.sub(destRecived);

        // Fee going into the pool, to be adjusted based on foundation split
        uint feeForPoolInUsd = mPrices.exchange(destKey, fee, mPrices.LUSD());

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

        // 先不考虑预言机套利的问题
        source.burn(fromAddr, sourceAmount);

        dest.mint(destAddr, destRecived);

        emit ExchangeAsset(
            fromAddr,
            sourceKey,
            sourceAmount,
            destAddr,
            destKey,
            destRecived,
            feeForPoolInUsd,
            foundationSplit
        );
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[45] private __gap;
}
