const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnAssetSystem = artifacts.require("LnAssetSystem");
const LnAsset = artifacts.require("LnAsset");
const LnDefaultPrices = artifacts.require("LnDefaultPrices");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnCollateralSystem = artifacts.require("LnCollateralSystem");
const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");

const LinearFinance = artifacts.require("LinearFinance");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

async function newAssetToken(keyname, kLnAddressStorage, name, symbol, admin, kLnAssetSystem) {
    let kLnProxyERC20 = await LnProxyERC20.new(admin);
    let kLnTokenStorage = await LnTokenStorage.new(admin, admin);
    let kAsset = await LnAsset.new(keyname, kLnProxyERC20.address, kLnAddressStorage.address, name, symbol, 0, 18, admin, kLnTokenStorage.address);
    await kLnTokenStorage.setOperator(kAsset.address);
    await kLnProxyERC20.setTarget(kAsset.address);
    await kAsset.setProxy(kLnProxyERC20.address);

    await kLnAssetSystem.addAsset(kAsset.address);

    return kAsset;
}

async function InitComment(admin) {
    console.log("InitComment start");
    //let kSafeMath = await SafeMath.new();
    let kSafeDecimalMath = await SafeDecimalMath.new();
    
    let kLnAddressStorage = await LnAddressStorage.new(admin);

    // regist contract address
    let kLnAccessControl = await LnAccessControl.new();
    await kLnAddressStorage.update( toBytes32("LnAccessControl"), kLnAccessControl.address);

    let oracleAddress = "0x0000000000000000000000000000000000000000";
    let kLnDefaultPrices = await LnDefaultPrices.new(admin, oracleAddress, [], []);
    await kLnAddressStorage.update( toBytes32("LnDefaultPrices"), kLnDefaultPrices.address);

    let kLnChainLinkPrices = await LnChainLinkPrices.new(admin, oracleAddress, [], []);
    await kLnAddressStorage.update( toBytes32("LnChainLinkPrices"), kLnChainLinkPrices.address);

    let kLnAssetSystem = await LnAssetSystem.new(admin);
    await kLnAddressStorage.update( toBytes32("LnAssetSystem"), kLnAssetSystem.address);

    let kLnCollateralSystem = await LnCollateralSystem.new(kLnAddressStorage.address);
    await kLnAddressStorage.update( toBytes32("LnCollateralSystem"), kLnCollateralSystem.address);

    let lUSD = await newAssetToken(toBytes32("lUSD"), kLnAddressStorage, "lUSD", "lUSD", admin, kLnAssetSystem);

    await LnBuildBurnSystem.link(SafeDecimalMath);
    let kLnBuildBurnSystem = await LnBuildBurnSystem.new(kLnAddressStorage.address, lUSD.address);
    await kLnAddressStorage.update( toBytes32("LnBuildBurnSystem"), kLnBuildBurnSystem.address);

    // access role setting

    await kLnAccessControl.SetIssueAssetRole([kLnBuildBurnSystem.address],[true]);
    await kLnAccessControl.SetBurnAssetRole([kLnBuildBurnSystem.address],[true]);

    await kLnAccessControl.SetDebtSystemRole([kLnBuildBurnSystem.address],[true]);
    console.log("InitComment finish");
    return {
        kLnAddressStorage:kLnAddressStorage,
        kLnAccessControl:kLnAccessControl,
        kLnDefaultPrices:kLnDefaultPrices,
        kLnChainLinkPrices:kLnChainLinkPrices,
        kLnAssetSystem:kLnAssetSystem,
        kLnCollateralSystem:kLnCollateralSystem,
        kLnBuildBurnSystem:kLnBuildBurnSystem
    }
}

async function CreateLina(admin) {
    let tokenstorage = await LnTokenStorage.new(admin, admin);
    let proxyErc20 = await LnProxyERC20.new(admin);

    await LinearFinance.link(SafeMath);
    await LinearFinance.link(SafeDecimalMath);
    let lina = await LinearFinance.new(proxyErc20.address, tokenstorage.address, admin, "0");

    await tokenstorage.setOperator(lina.address);
    await proxyErc20.setTarget(lina.address);
    await lina.setProxy(proxyErc20.address);
    return lina
}

exports.newAssetToken = newAssetToken;
exports.InitComment = InitComment;
exports.CreateLina = CreateLina;
