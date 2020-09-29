// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAddressCache.sol";
import "./IAsset.sol";
import "./LnAsset.sol";
import "./LnPrices.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

contract LnAssetSystem is LnAddressStorage {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    IAsset[] public mAssetList; // 合约地址数组
    mapping(address => bytes32) public mAddress2Names; // 地址到名称的映射

    constructor(address _admin ) public LnAddressStorage(_admin ) {}

    function addAsset( IAsset asset ) external onlyAdmin {
        bytes32 name = asset.keyName();

        require(mAddrs[name] == address(0), "Asset already exists");
        require(mAddress2Names[address(asset)] == bytes32(0), "Asset address already exists");

        mAssetList.push(asset);
        mAddrs[name] = address(asset);
        mAddress2Names[address(asset)] = name;

        emit AssetAdded(name, address(asset));
    }

    function removeAsset(bytes32 name) external onlyAdmin {
        address assetToRemove = address(mAddrs[name]);

        require( assetToRemove != address(0), "asset does not exist");

        // Remove from list
        for (uint i = 0; i < mAssetList.length; i++) {
            if (address(mAssetList[i]) == assetToRemove) {
                delete mAssetList[i];
                mAssetList[i] = mAssetList[mAssetList.length - 1];
                mAssetList.pop();
                break;
            }
        }

        // And remove it from the assets mapping
        delete mAddress2Names[ assetToRemove ];
        delete mAddrs[name];

        emit AssetRemoved(name, assetToRemove);
    }

    function assetNumber() external view returns (uint) {
        return mAssetList.length;
    }

    // check exchange rate invalid condition ? invalid just fail.
    function totalAssetsInUsd() public view returns (uint256 rTotal) {
        require(mAddrs["LnPrices"] != address(0), "LnPrices address cannot access");
        LnPrices priceGetter = LnPrices( mAddrs["LnPrices"] ); //getAddress
        for (uint256 i=0; i< mAssetList.length; i++) {
            uint256 exchangeRate = priceGetter.getPrice(mAssetList[i].keyName());
            rTotal = rTotal.add( LnAsset(address(mAssetList[i])).totalSupply().multiplyDecimal(exchangeRate) );
        }
    }

    function getAssetAddresses() external view returns(address[] memory) {
        address[] memory addr = new address[](mAssetList.length);
        for (uint256 i=0; i<mAssetList.length; i++) {
            addr[i] = address(mAssetList[i]);
        }
        return addr;
    }

    event AssetAdded(bytes32 name, address asset);
    event AssetRemoved(bytes32 name, address asset);
}

