const {DeployIfNotExist, CallWithEstimateGas, getDeployedByName, getDeployedAddress, GetDeployed} = require("../../utility/truffle-tool");
const {newAssetToken} = require("../helpers");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const LnAccessControl = artifacts.require("LnAccessControl");
const LinearFinance = artifacts.require("LinearFinance");
const LnAssetSystem = artifacts.require("LnAssetSystem");
const LnCollateralSystem = artifacts.require("LnCollateralSystem");
const LnExchangeSystem = artifacts.require("LnExchangeSystem");
const LnFeeSystem = artifacts.require("LnFeeSystem");
const LnFeeSystemTest = artifacts.require("LnFeeSystemTest");
const LnConfig = artifacts.require("LnConfig");
const LnDebtSystem = artifacts.require("LnDebtSystem");
const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");
const LnRewardLocker = artifacts.require("LnRewardLocker");
const assert = require('assert');

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];

    let kLinearFinance = await GetDeployed(LinearFinance);
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);

    let kLnChainLinkPrices = await GetDeployed(LnChainLinkPrices);
    let kLnDebtSystem = await GetDeployed(LnDebtSystem);
    let kLnCollateralSystem = await GetDeployed(LnCollateralSystem);
    let kLnBuildBurnSystem = await GetDeployed(LnBuildBurnSystem);
    let kLnExchangeSystem = await GetDeployed(LnExchangeSystem);

    let kLnAccessControl = await GetDeployed(LnAccessControl);
    let kLnAssetSystem = await GetDeployed(LnAssetSystem);

    let kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystem, admin);
    if (network == "ropsten" || network == "bsctestnet") {//console.log("deploy ropsten LnFeeSystemTest");
      kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystemTest, admin);
      /*
      let kLnRewardLocker = await GetDeployed(LnRewardLocker);
      await CallWithEstimateGas(kLnRewardLocker.Init, kLnFeeSystem.address);
      let rewardDistributer = "0x474f7783d9a01d8eaa6faee9de8bdb9453adf2cd"; // TODO: need a contract?
      await CallWithEstimateGas(kLnFeeSystem.Init, kLnExchangeSystem.address, rewardDistributer);
  
      // access role setting
      await CallWithEstimateGas(kLnAccessControl.SetIssueAssetRole, 
          [kLnFeeSystem.address], 
          [true]
      );
      await CallWithEstimateGas(kLnAccessControl.SetBurnAssetRole, 
          [kLnFeeSystem.address], 
          [true]
      );

      let contractNames = [];
      let contractAddrs = [];
      function registContract(name, contractObj) {
          contractNames.push(toBytes32(name));
          contractAddrs.push(contractObj.address);
      }
      registContract("LnFeeSystem", kLnFeeSystem);
      await CallWithEstimateGas(kLnAssetSystem.updateAll, contractNames, contractAddrs);

      await CallWithEstimateGas(kLnDebtSystem.updateAddressCache, kLnAssetSystem.address);
      await CallWithEstimateGas(kLnCollateralSystem.updateAddressCache, kLnAssetSystem.address);
      await CallWithEstimateGas(kLnBuildBurnSystem.updateAddressCache, kLnAssetSystem.address);
      await CallWithEstimateGas(kLnExchangeSystem.updateAddressCache, kLnAssetSystem.address);
      await CallWithEstimateGas(kLnFeeSystem.updateAddressCache, kLnAssetSystem.address);

      let old = await LnFeeSystemTest.at("0x8657f180611Ba12F9D2620FC9066aD1E866e0460");
      let curRewardPeriod = await old.curRewardPeriod();
      let preRewardPeriod = await old.preRewardPeriod();
      let ndata = curRewardPeriod;
      await CallWithEstimateGas(kLnFeeSystem.SetPeriodData, 0, ndata.id, 
        ndata.startingDebtFactor, ndata.startTime, ndata.feesToDistribute, ndata.feesClaimed,
        ndata.rewardsToDistribute, ndata.rewardsClaimed
      );
      ndata = preRewardPeriod;
      await CallWithEstimateGas(kLnFeeSystem.SetPeriodData, 1, ndata.id, 
        ndata.startingDebtFactor, ndata.startTime, ndata.feesToDistribute, ndata.feesClaimed,
        ndata.rewardsToDistribute, ndata.rewardsClaimed
      );*/
    }

    let lusdret = await kLnChainLinkPrices.LUSD();
    console.log("lusdret", lusdret, toBytes32("lUSD"));
    let lusdaddress = await kLnAssetSystem.getAddressWithRequire(lusdret, "");
    console.log(lusdaddress);
    /*
 // deploy a new LnChainLinkPrices and update to other referenced contract.
    let contractNames = [];
    let contractAddrs = [];
    function registContract(name, contractObj) {
        contractNames.push(toBytes32(name));
        contractAddrs.push(contractObj.address);
    }
    registContract("LnPrices", kLnChainLinkPrices);

    await CallWithEstimateGas(kLnAssetSystem.updateAll, contractNames, contractAddrs);

    await CallWithEstimateGas(kLnDebtSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnCollateralSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnBuildBurnSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnExchangeSystem.updateAddressCache, kLnAssetSystem.address);
    await CallWithEstimateGas(kLnFeeSystem.updateAddressCache, kLnAssetSystem.address);
    return;*/

    try {
      //await CallWithEstimateGas(kLnFeeSystem.switchPeriod);
      //reset rewardDistributer address
    } catch(e) {
      console.log(e);
    }
    
    if (network == "ropsten") {
      //let exchangeAddress = getDeployedAddress(LnExchangeSystem);
      //await CallWithEstimateGas(kLnFeeSystem.Init, exchangeAddress, "0x474f7783d9a01d8eaa6faee9de8bdb9453adf2cd");
     // await CallWithEstimateGas(kLnChainLinkPrices.setOracle, "0x474f7783d9a01d8eaa6faee9de8bdb9453adf2cd");
    }

    // 创建合成资产 lBTC
    let LnAsset_lBTCAddress = getDeployedByName("LnAsset_lBTC");
    let lBTC32 = toBytes32("lBTC");
    let lETH32 = toBytes32("lETH");
    let lHB1032 = toBytes32("lHB10");
    if (LnAsset_lBTCAddress == null) {
      let lBTCAsset = await newAssetToken(deployer, lBTC32, "lBTC", "lBTC", admin, kLnAssetSystem);
    }
    let LnAsset_lETHAddress = getDeployedByName("LnAsset_lETH");
    if (LnAsset_lETHAddress == null) {
      let lETHAsset = await newAssetToken(deployer, lETH32, "lETH", "lETH", admin, kLnAssetSystem);
    }
    
    let LnAsset_lHB10Address = getDeployedByName("LnAsset_lHB10");
    if (LnAsset_lHB10Address == null) {
      let lHB10Asset = await newAssetToken(deployer, lHB1032, "lHB10", "lHB10", admin, kLnAssetSystem);
    }

    //set fee rate
    let kLnConfig = await DeployIfNotExist(deployer, LnConfig, admin);
    let lUSD32 = toBytes32("lUSD");
    await CallWithEstimateGas(kLnConfig.setUint, lBTC32, toUnit("0.001"));
    await CallWithEstimateGas(kLnConfig.setUint, lETH32, toUnit("0.001"));
    await CallWithEstimateGas(kLnConfig.setUint, lUSD32, toUnit("0.001"));
    await CallWithEstimateGas(kLnConfig.setUint, lHB1032, toUnit("0.001"));
    
    
    if (network == "ropsten") {
      //console.log("mint to ropsten test address");
      let testaddress = "0x224ae8C61f31a0473dFf4aFB3Da279aCdcA9a8Fa";
      let testamount = toUnit(1000000000);
      //await CallWithEstimateGas(kLinearFinance.mint, testaddress, testamount);
      
      /* //user oracleAddress call updateAll
      let oracle = await kLnChainLinkPrices.oracle();
      console.log("oracle", oracle, admin);
      await CallWithEstimateGas(kLnChainLinkPrices.updateAll, 
        [lBTC32, lETH32],
        [toUnit(13140.02), toUnit(405.4)],
        Math.floor(Date.now()/1000).toString()
      );*/
    }

    //let kLnCollateralSystem = await GetDeployed(LnCollateralSystem);
    // 添加抵押物信息
    //await CallWithEstimateGas(kLnCollateralSystem.UpdateTokenInfo, 
    //    toBytes32("LINA"), linaProxyErc20Address, toBN(0), false
    //);
  });
};
