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

    bytes32 public constant ASSETS_KEY = ("LnAssetSystem");
    bytes32 public constant PRICES_KEY = ("LnPrices");
    bytes32 public constant CONFIG_KEY = ("LnConfig");
    bytes32 public constant REWARD_SYS_KEY = ("LnRewardSystem");

    ILnAddressStorage mAssets;
    ILnPrices mPrices;
    ILnConfig mConfig;
    address mRewardSys;

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

        // 计算手续费
        //uint feeRate = 1 ether / 100; // 0.01
        //  JS设置手续费:  await config.batchSet( ["BTC","CNY"].map(toBytes32), [0.01, 0.01].map(toUnit));
        uint feeRate = mConfig.getUint(destKey); // fee rate
        uint destRecived = destAmount.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
        uint fee = destAmount.sub(destRecived);

        // 把手续费转成USD
        uint feeUsd = mPrices.exchange(destKey, fee, mPrices.LUSD());
        // 这里接下来要把手续费放入资金池
        _addExchangeFee(feeUsd);

        // 先不考虑预言机套利的问题
        source.burn(fromAddr, sourceAmount);

        dest.mint(destAddr, destRecived);

        emit ExchangeAsset(fromAddr, sourceKey, sourceAmount, destAddr, destKey, destRecived, feeUsd);
    }

    function _addExchangeFee(uint feeUsd) internal {
        ILnAsset lusd = ILnAsset(mAssets.getAddressWithRequire(mPrices.LUSD(), ""));
        lusd.mint(mRewardSys, feeUsd);
    }

    event ExchangeAsset(
        address fromAddr,
        bytes32 sourceKey,
        uint sourceAmount,
        address destAddr,
        bytes32 destKey,
        uint destRecived,
        uint fee
    );

    // Reserved storage space to allow for layout changes in the future.
    uint256[46] private __gap;
}
