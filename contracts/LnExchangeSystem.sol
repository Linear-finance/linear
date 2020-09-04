// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAddressCache.sol";
import "./LnAsset.sol";
import "./LnAssetSystem.sol";
import "./LnPrices.sol";
import "./LnConfig.sol";

contract LnExchangeSystem is LnAddressCache, LnAdmin {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    bytes32 public constant ASSETS_KEY = ("LnAssetSystem");
    bytes32 public constant PRICES_KEY = ("LnPrices");
    bytes32 public constant CONFIG_KEY = ("LnConfig");


    LnAssetSystem mAssets;
    LnPrices mPrices;
    LnConfig mConfig;

    constructor(address _admin, LnAddressStorage _addressStorage ) public LnAdmin(_admin ) {
        updateAddressCache( _addressStorage );
    }


    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        mAssets = LnAssetSystem(_addressStorage.getAddressWithRequire( ASSETS_KEY,"" ));
        mPrices = LnPrices(_addressStorage.getAddressWithRequire( PRICES_KEY,"" ));
        mConfig = LnConfig(_addressStorage.getAddressWithRequire( CONFIG_KEY,"" ));


        emit updateCachedAddress( ASSETS_KEY, address(mAssets) );
        emit updateCachedAddress( PRICES_KEY, address(mPrices) );
        emit updateCachedAddress( CONFIG_KEY, address(mConfig) );
    }


    function exchange( bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey  ) external {
        return _exchange( msg.sender, sourceKey, sourceAmount, destAddr, destKey );
    }

    function _exchange( address fromAddr, bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey  ) internal {
        
        LnAsset source = LnAsset( mAssets.getAddressWithRequire( sourceKey, ""));
        LnAsset dest = LnAsset( mAssets.getAddressWithRequire( destKey, ""));
        uint destAmount=  mPrices.exchange( sourceKey, sourceAmount, destKey );
        require( destAmount > 0, "dest amount must > 0" );

        // 计算手续费
        //uint feeRate = 1 ether / 100; // 0.01
        //  JS设置手续费:  await config.batchSet( ["BTC","CNY"].map(toBytes32), [0.01, 0.01].map(toUnit));
        uint feeRate = mConfig.getUint( destKey ); // fee rate
        uint destRecived = destAmount.multiplyDecimal(SafeDecimalMath.unit().sub(feeRate));
        uint fee = destAmount.sub( destRecived );

        // 把手续费转成USD
        uint feeUsd = mPrices.exchange( destKey, fee, mPrices.LUSD() );
        // 这里接下来要把手续费放入资金池
                

        // 先不考虑手续费和预言机套利的问题
        source.burn( fromAddr, sourceAmount );

        dest.mint( destAddr, destRecived );

        emit exchangeAsset( fromAddr, sourceKey, sourceAmount, destAddr, destKey, destRecived, feeUsd );
    }

    event exchangeAsset( address fromAddr, bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey,  uint destRecived, uint fee );

}

