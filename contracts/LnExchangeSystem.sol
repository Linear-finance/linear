// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAddressCache.sol";
import "./LnAsset.sol";
import "./LnAssetSystem.sol";
import "./LnPrices.sol";

contract LnExchangeSystem is LnAddressCache, LnAdmin {
    bytes32 public constant ASSETS_KEY = ("LnAssetSystem");
    bytes32 public constant PRICES_KEY = ("LnPrices");

    LnAssetSystem mAssets;
    LnPrices mPrices;

    constructor(address _admin, LnAddressStorage _addressStorage ) public LnAdmin(_admin ) {
        updateAddressCache( _addressStorage );
    }


    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        mAssets = LnAssetSystem(_addressStorage.getAddressWithRequire( ASSETS_KEY,"" ));
        mPrices = LnPrices(_addressStorage.getAddressWithRequire( PRICES_KEY,"" ));
        emit updateCachedAddress( ASSETS_KEY, address(mAssets) );
        emit updateCachedAddress( PRICES_KEY, address(mPrices) );

    }

    function exchange( bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey  ) external {
        return _exchange( msg.sender, sourceKey, sourceAmount, destAddr, destKey );
    }

    function _exchange( address fromAddr, bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey  ) internal {
        
        LnAsset source = LnAsset( mAssets.getAddressWithRequire( sourceKey, ""));
        LnAsset dest = LnAsset( mAssets.getAddressWithRequire( destKey, ""));
        uint destAmount=  mPrices.exchange( sourceKey, sourceAmount, destKey );
        require( destAmount > 0, "dest amount must > 0" );

        // 先不考虑手续费和预言机套利的问题
        source.burn( fromAddr, sourceAmount );

        dest.mint( destAddr, destAmount );

        emit exchangeAsset( fromAddr, sourceKey, sourceAmount, destAddr, destKey, destAmount );
    }

    event exchangeAsset( address fromAddr, bytes32 sourceKey, uint sourceAmount, address destAddr, bytes32 destKey,  uint destAmount );

}

