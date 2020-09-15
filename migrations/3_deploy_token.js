const assert = require('assert');
const {GetDeployed, DeployIfNotExist, DeployWithEstimate} = require("../utility/truffle-tool");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { BN, toBN, toWei, fromWei, hexToAscii } = w3utils;
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

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

async function newAssetToken(deployer, keyname, name, symbol, admin, kLnAssetSystem) {
    let kLnProxyERC20 = await DeployIfNotExist(deployer, LnProxyERC20, admin);
    let kLnTokenStorage = await DeployIfNotExist(deployer, LnTokenStorage, admin, admin);
    let kAsset = await DeployIfNotExist(deployer, LnAsset, keyname, kLnProxyERC20.address, kLnTokenStorage.address, name, symbol, 0, 18, admin);
    await kLnTokenStorage.setOperator(kAsset.address);
    await kLnProxyERC20.setTarget(kAsset.address);
    await kAsset.setProxy(kLnProxyERC20.address);
    await kAsset.updateAddressCache(kLnAssetSystem.address);

    await kLnAssetSystem.addAsset(kAsset.address);

    return kAsset;
}

const BUILD_RATIO = toUnit("0.2");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    
    // lina token has deployed before main contract deploying.
    const contractLina = await GetDeployed(LinearFinance);
    const contractLinaProxy = await contractLina.proxy();
    
    //
    //assert.ok(contractLina, "LinearFinance was not deployed");

    // deploy base infrastructure
    let kLnAssetSystem = await DeployIfNotExist(deployer, LnAssetSystem, admin);
    
    let kLnConfig = await DeployIfNotExist(deployer, LnConfig, admin);
    let buildRatio = await kLnConfig.BUILD_RATIO();
    await kLnConfig.setUint(buildRatio, BUILD_RATIO);

    let kLnAccessControl = await DeployIfNotExist(deployer, LnAccessControl, admin);

    const emptyAddr = "0x0000000000000000000000000000000000000000";
    let oracleAddress = admin; // TODO: need udpate price later

    await deployer.link(SafeDecimalMath, LnChainLinkPrices);
    //await deployer.deploy(LnChainLinkPrices, admin, oracleAddress, [], []);
    let kLnChainLinkPrices = await DeployIfNotExist(deployer, LnChainLinkPrices, admin, oracleAddress, [], []);

    await deployer.link(SafeDecimalMath, LnDebtSystem);
    let kLnDebtSystem = await DeployIfNotExist(deployer, LnDebtSystem, admin);
   
    let kLnCollateralSystem = await DeployIfNotExist(deployer, LnCollateralSystem, admin);
 
    await deployer.link(SafeDecimalMath, LnBuildBurnSystem);
    let lUSDTokenAddress = emptyAddr;
    let kLnBuildBurnSystem = await DeployIfNotExist(deployer, LnBuildBurnSystem, admin, lUSDTokenAddress);

    // access role setting

    await kLnAccessControl.SetIssueAssetRole([kLnBuildBurnSystem.address],[true]);
    await kLnAccessControl.SetBurnAssetRole([kLnBuildBurnSystem.address],[true]);

    await kLnAccessControl.SetDebtSystemRole([kLnBuildBurnSystem.address, admin], [true, true]); // admin to test

    let contractNames = [];
    let contractAddrs = [];
    function registContract(name, contractObj) {
        contractNames.push(toBytes32(name));
        contractAddrs.push(contractObj.address);
    }

    registContract("LnAssetSystem", kLnAssetSystem); // regist self
    registContract("LnAccessControl", kLnAccessControl);
    registContract("LnConfig", kLnConfig);
    registContract("LnPrices", kLnChainLinkPrices); // Note: LnPrices
    registContract("LnDebtSystem", kLnDebtSystem);
    registContract("LnCollateralSystem", kLnCollateralSystem);
    registContract("LnBuildBurnSystem", kLnBuildBurnSystem);
  
    await kLnAssetSystem.updateAll(contractNames, contractAddrs);

    let lUSD = await newAssetToken(deployer, toBytes32("lUSD"), "lUSD", "lUSD", admin, kLnAssetSystem);
    await kLnBuildBurnSystem.SetLusdTokenAddress(lUSD.address);

    await kLnDebtSystem.updateAddressCache(kLnAssetSystem.address);
    await kLnCollateralSystem.updateAddressCache(kLnAssetSystem.address);
    await kLnBuildBurnSystem.updateAddressCache(kLnAssetSystem.address);
  });
};
