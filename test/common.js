const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnConfig = artifacts.require("LnConfig");
const LnAssetSystem = artifacts.require("LnAssetSystem");
const LnAsset = artifacts.require("LnAsset");
const LnDefaultPrices = artifacts.require("LnDefaultPrices");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnCollateralSystem = artifacts.require("LnCollateralSystem");
const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");
const LnDebtSystem = artifacts.require("LnDebtSystem");

const LinearFinance = artifacts.require("LinearFinance");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { BN, toBN, toWei, fromWei, hexToAscii } = w3utils;
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

let contractNames = [];
let contractAddrs = [];

function registContract(name, contractObj) {
    contractNames.push(toBytes32(name));
    contractAddrs.push(contractObj.address);
}

async function newAssetToken(keyname, name, symbol, admin, kLnAssetSystem) {
    let kLnProxyERC20 = await LnProxyERC20.new(admin);
    let kLnTokenStorage = await LnTokenStorage.new(admin, admin);
    let kAsset = await LnAsset.new(keyname, kLnProxyERC20.address, kLnTokenStorage.address, name, symbol, 0, 18, admin);
    await kLnTokenStorage.setOperator(kAsset.address);
    await kLnProxyERC20.setTarget(kAsset.address);
    await kAsset.setProxy(kLnProxyERC20.address);
    await kAsset.updateAddressCache(kLnAssetSystem.address);

    await kLnAssetSystem.addAsset(kAsset.address);

    return kAsset;
}

const BUILD_RATIO = toUnit("0.2");

async function InitComment(admin) {
    //console.log("InitComment start");
    //let kSafeMath = await SafeMath.new();
    let kSafeDecimalMath = await SafeDecimalMath.new();
    
    let kLnAssetSystem = await LnAssetSystem.new(admin);
    let kLnConfig = await LnConfig.new(admin);
    let buildRatio = await kLnConfig.BUILD_RATIO();
    await kLnConfig.setUint(buildRatio.valueOf(), BUILD_RATIO);
    
    // regist contract address
    let kLnAccessControl = await LnAccessControl.new(admin);
  
    let emptyAddr = "0x0000000000000000000000000000000000000000";
    let oracleAddress = admin;//"0x0000000000000000000000000000000000000000";
    //let kLnDefaultPrices = await LnDefaultPrices.new(admin, oracleAddress, [], []);

    let kLnChainLinkPrices = await LnChainLinkPrices.new(admin, oracleAddress, [], []);
  
    await LnDebtSystem.link(SafeDecimalMath);
    let kLnDebtSystem = await LnDebtSystem.new(admin);
   
    let kLnCollateralSystem = await LnCollateralSystem.new(admin);
 
    await LnBuildBurnSystem.link(SafeDecimalMath);
    let kLnBuildBurnSystem = await LnBuildBurnSystem.new(admin, emptyAddr);

    // access role setting

    await kLnAccessControl.SetIssueAssetRole([kLnBuildBurnSystem.address],[true]);
    await kLnAccessControl.SetBurnAssetRole([kLnBuildBurnSystem.address],[true]);

    await kLnAccessControl.SetDebtSystemRole([kLnBuildBurnSystem.address, admin], [true, true]); // admin to test

    registContract("LnAssetSystem", kLnAssetSystem); // regist self
    registContract("LnAccessControl", kLnAccessControl);
    registContract("LnConfig", kLnConfig);
    registContract("LnPrices", kLnChainLinkPrices); // Note: LnPrices
    registContract("LnDebtSystem", kLnDebtSystem);
    registContract("LnCollateralSystem", kLnCollateralSystem);
    registContract("LnBuildBurnSystem", kLnBuildBurnSystem);
  
    await kLnAssetSystem.updateAll(contractNames, contractAddrs);

    let lUSD = await newAssetToken(toBytes32("lUSD"), "lUSD", "lUSD", admin, kLnAssetSystem);
    await kLnBuildBurnSystem.SetLusdTokenAddress(lUSD.address);

    await kLnDebtSystem.updateAddressCache(kLnAssetSystem.address);
    await kLnCollateralSystem.updateAddressCache(kLnAssetSystem.address);
    await kLnBuildBurnSystem.updateAddressCache(kLnAssetSystem.address);

    //console.log("InitComment finish");
    return {
        kLnAccessControl:kLnAccessControl,
        //kLnDefaultPrices:kLnDefaultPrices,
        kLnChainLinkPrices:kLnChainLinkPrices,
        kLnAssetSystem:kLnAssetSystem,
        kLnCollateralSystem:kLnCollateralSystem,
        kLnBuildBurnSystem:kLnBuildBurnSystem,
        kLnDebtSystem:kLnDebtSystem
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
