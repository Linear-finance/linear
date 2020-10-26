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

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];

    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);

    let kLnChainLinkPrices = await LnChainLinkPrices.deployed();
    //console.log(kLnChainLinkPrices);

    let kLnAccessControl = await LnAccessControl.deployed();
    //console.log(kLnAccessControl);
    
    let kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystem, admin);
    if (network == "ropsten") {
      kLnFeeSystem = await DeployIfNotExist(deployer, LnFeeSystemTest, admin);
    }

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
    let kLnAssetSystem = await GetDeployed(LnAssetSystem);
    let LnAsset_lBTCAddress = getDeployedByName("LnAsset_lBTC");
    let lBTC32 = toBytes32("lBTC");
    let lETH32 = toBytes32("lETH");
    if (LnAsset_lBTCAddress == null) {
      let lBTCAsset = await newAssetToken(deployer, lBTC32, "lBTC", "lBTC", admin, kLnAssetSystem);
    }
    let LnAsset_lETHAddress = getDeployedByName("LnAsset_lETH");
    if (LnAsset_lETHAddress == null) {
      let lETHAsset = await newAssetToken(deployer, lETH32, "lETH", "lETH", admin, kLnAssetSystem);
    }
    
    //set fee rate
    let kLnConfig = await DeployIfNotExist(deployer, LnConfig, admin);
    let lUSD32 = toBytes32("lUSD");
    await CallWithEstimateGas(kLnConfig.setUint, lBTC32, toUnit("0.001"));
    await CallWithEstimateGas(kLnConfig.setUint, lETH32, toUnit("0.001"));
    await CallWithEstimateGas(kLnConfig.setUint, lUSD32, toUnit("0.001"));
    
    if (network == "ropsten") {
      //console.log("mint to ropsten test address");
      let testaddress = "0x224ae8C61f31a0473dFf4aFB3Da279aCdcA9a8Fa";
      let testamount = toUnit(1000000000);
      //await CallWithEstimateGas(kLinearFinance.mint, testaddress, testamount);

      //await CallWithEstimateGas(kLnChainLinkPrices.updateAll, 
      //  [lBTC32, lETH32, lUSD32],
      //  [toUnit(13140.02), toUnit(405.4), toUnit(1)],
      //  Math.floor(Date.now()/1000).toString()
      //);
    }

    //let kLnCollateralSystem = await GetDeployed(LnCollateralSystem);
    // 添加抵押物信息
    //await CallWithEstimateGas(kLnCollateralSystem.UpdateTokenInfo, 
    //    toBytes32("LINA"), linaProxyErc20Address, toBN(0), false
    //);
  });
};
