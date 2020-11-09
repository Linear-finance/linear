const assert = require('assert');
const {DeployIfNotExist, DeployWithEstimate, DeployWithEstimateSuffix, CallWithEstimateGas, getDeployedByName, GetDeployed} = require("../../utility/truffle-tool");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const { BN, toBN, toWei, fromWei, hexToAscii } = w3utils;
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const SafeDecimalMath = artifacts.require("SafeDecimalMath");
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
const LnRewardCalculator = artifacts.require("LnRewardCalculator");
const LnExchangeSystem = artifacts.require("LnExchangeSystem");
const LnRewardLocker = artifacts.require("LnRewardLocker");
const LnFeeSystem = artifacts.require("LnFeeSystem");
const LnFeeSystemTest = artifacts.require("LnFeeSystemTest");
const {newAssetToken} = require("../helpers");

const BUILD_RATIO = toUnit("0.2");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    
    // lina token has deployed before main contract deploying.
    const kLinearFinance = await GetDeployed(LinearFinance);//LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    let klinaProxy = await LnProxyERC20.at(linaProxyErc20Address);
    
    if (network == "mainnet" || network == "ropsten")
      assert.ok(kLinearFinance, "LinearFinance was not deployed");

    // deploy base infrastructure
    let kLnAssetSystem = await DeployIfNotExist(deployer, LnAssetSystem, admin);
    
    let kLnConfig = await DeployIfNotExist(deployer, LnConfig, admin);
    let buildRatio = await kLnConfig.BUILD_RATIO();
    await CallWithEstimateGas(kLnConfig.setUint, buildRatio, BUILD_RATIO);

    let kLnAccessControl = await DeployIfNotExist(deployer, LnAccessControl, admin);

    await deployer.link(SafeDecimalMath, LnRewardCalculator);

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

    await deployer.link(SafeDecimalMath, LnExchangeSystem);
    let kLnExchangeSystem = await DeployIfNotExist(deployer, LnExchangeSystem, admin)
    let kLnRewardLocker = await DeployIfNotExist(deployer, LnRewardLocker, admin, linaProxyErc20Address);
    let kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystem, admin);
    if (network == "ropsten" || network == "bsctestnet") {
      kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystemTest, admin);
    }

    await CallWithEstimateGas(kLnRewardLocker.Init, kLnFeeSystem.address);
    let rewardDistributer = admin; // TODO: need a contract?
    await CallWithEstimateGas(kLnFeeSystem.Init, kLnExchangeSystem.address, rewardDistributer);

    // access role setting

    await CallWithEstimateGas(kLnAccessControl.SetIssueAssetRole, 
        [kLnBuildBurnSystem.address, kLnExchangeSystem.address, kLnFeeSystem.address], 
        [true, true, true]
    );
    await CallWithEstimateGas(kLnAccessControl.SetBurnAssetRole, 
        [kLnBuildBurnSystem.address, kLnExchangeSystem.address, kLnFeeSystem.address], 
        [true, true, true]
    );

    await CallWithEstimateGas(kLnAccessControl.SetDebtSystemRole, [kLnBuildBurnSystem.address, admin], [true, true]); // admin to test

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
    registContract("LnFeeSystem", kLnFeeSystem);
    registContract("LnRewardLocker", kLnRewardLocker);
    registContract("LnExchangeSystem", kLnExchangeSystem);
  
    await CallWithEstimateGas(kLnAssetSystem.updateAll, contractNames, contractAddrs);

    let LnAsset_lUSDAddress = getDeployedByName("LnAsset_lUSD");
    if (LnAsset_lUSDAddress == null) {
      let lUSD = await newAssetToken(deployer, toBytes32("lUSD"), "lUSD", "lUSD", admin, kLnAssetSystem);
      LnAsset_lUSDAddress = lUSD.address;
    }
    console.log("kLnAssetSystem.address", kLnAssetSystem.address);
    console.log("kLnFeeSystem", kLnFeeSystem.address);
    await CallWithEstimateGas(kLnBuildBurnSystem.SetLusdTokenAddress, LnAsset_lUSDAddress);
    await CallWithEstimateGas(kLnDebtSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnCollateralSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnBuildBurnSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnExchangeSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnFeeSystem.updateAddressCache, kLnAssetSystem.address);
  });
};
