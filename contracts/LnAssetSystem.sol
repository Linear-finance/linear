// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnPerpetual.sol";
import "./interfaces/ILnPrices.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressStorage.sol";

contract LnAssetSystem is LnAddressStorage {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    ILnAsset[] public mAssetList; // 合约地址数组
    mapping(address => bytes32) public mAddress2Names; // 地址到名称的映射

    mapping(bytes32 => address) public perpAddresses;
    mapping(address => bytes32) public perpSymbols;

    function __LnAssetSystem_init(address _admin) public initializer {
        __LnAddressStorage_init(_admin);
    }

    function addAsset(ILnAsset asset) external onlyAdmin {
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

        require(assetToRemove != address(0), "asset does not exist");

        // Remove from list
        for (uint i = 0; i < mAssetList.length; i++) 
        {
            if (address(mAssetList[i]) == assetToRemove) {
                delete mAssetList[i];
                mAssetList[i] = mAssetList[mAssetList.length - 1];
                mAssetList.pop();
                break;
            }
        }

        // And remove it from the assets mapping
        delete mAddress2Names[assetToRemove];
        delete mAddrs[name];

        emit AssetRemoved(name, assetToRemove);
    }

    function addPerp(ILnPerpetual perp) external onlyAdmin {
        require(address(perp) != address(0), "LnAssetSystem: zero address");

        bytes32 symbol = perp.underlyingTokenSymbol();
        require(perpAddresses[symbol] == address(0), "LnAssetSystem: perp already exists");

        perpAddresses[symbol] = address(perp);
        perpSymbols[address(perp)] = symbol;

        emit PerpAdded(symbol, address(perp));
    }

    function removePerp(ILnPerpetual perp) external onlyAdmin {
        require(address(perp) != address(0), "LnAssetSystem: zero address");
        bytes32 symbolToRemove = perp.underlyingTokenSymbol();
        require(perpAddresses[symbolToRemove] != address(0), "LnAssetSystem: perp doens't exist");    
        perpAddresses[symbolToRemove] = address(0);
        perpSymbols[address(perp)] = bytes32(0);
        emit PerpRemoved(symbolToRemove, address(perp));
    }

    function assetNumber() external view returns (uint) {
        return mAssetList.length;
    }

    function totalAssetsInUsd() public view returns (uint256 rTotal) {
        address lnPricesAddress = mAddrs["LnPrices"];
        require(lnPricesAddress != address(0), "LnAssetSystem: LnPrices not set");

        uint256 totalSupplyValue = 0;
        uint256 totalPerpDebtValue = 0;

        for (uint256 ind = 0; ind < mAssetList.length; ind++) {
            ILnAsset asset = mAssetList[ind];
            bytes32 assetSymbol = asset.keyName();

            uint256 exchangeRate = ILnPrices(lnPricesAddress).getPrice(assetSymbol);
            address perpAddress = perpAddresses[assetSymbol];

            totalSupplyValue = totalSupplyValue.add(asset.totalSupply().multiplyDecimal(exchangeRate));

            if (perpAddress != address(0)) {
                totalPerpDebtValue = totalPerpDebtValue.add(ILnPerpetual(perpAddress).totalUsdDebt()).add(
                    ILnPerpetual(perpAddress).totalUnderlyingDebt().multiplyDecimal(exchangeRate)
                );
            }
        }

        rTotal = totalSupplyValue.sub(totalPerpDebtValue);
    }

    function getAssetAddresses() external view returns (address[] memory) {
        address[] memory addr = new address[](mAssetList.length);
        for (uint256 i = 0; i < mAssetList.length; i++) {
            addr[i] = address(mAssetList[i]);
        }
        return addr;
    }

    function isPerpAddressRegistered(address perpAddress) external view returns (bool) 
    {
        return perpSymbols[perpAddress] != bytes32(0);
    }

    event AssetAdded(bytes32 name, address asset);
    event AssetRemoved(bytes32 name, address asset);
    event PerpAdded(bytes32 underlying, address perp);
    event PerpRemoved(bytes32 underlying, address perp);

    // Reserved storage space to allow for layout changes in the future.
    uint256[48] private __gap;
}
