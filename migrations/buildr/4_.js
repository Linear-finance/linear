const {DeployIfNotExist, CallWithEstimateGas, getDeployedByName, getDeployedAddress} = require("../../utility/truffle-tool");
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

    // 创建合成资产 lBTC
    //let kLnAssetSystem = await LnAssetSystem.deployed();
    //let lBTCAsset = await newAssetToken(deployer, toBytes32("lBTC"), "lBTC", "lBTC", admin, kLnAssetSystem);
/*
    if (network == "ropsten") {
      console.log("mint to ropsten test address");
      let testaddress = "0x224ae8C61f31a0473dFf4aFB3Da279aCdcA9a8Fa";
      let testamount = toUnit(1000000000);
      //await CallWithEstimateGas(kLinearFinance.mint, testaddress, testamount);

      const linaBytes32 = toBytes32("LINA");
      const ETHBytes32 = toBytes32("ETH");
      const lUSDBytes32 = toBytes32("lUSD");
      await CallWithEstimateGas(kLnChainLinkPrices.updateAll, 
        [linaBytes32, ETHBytes32, lUSDBytes32],
        [toUnit(0.02), toUnit(351), toUnit(1)],
        Math.floor(Date.now()/1000).toString()
      );
    }

    let kLnCollateralSystem = await LnCollateralSystem.deployed();
    // 添加抵押物信息
    await CallWithEstimateGas(kLnCollateralSystem.UpdateTokenInfo, 
        toBytes32("LINA"), linaProxyErc20Address, toBN(0), false
    );
    */
   
  });
};
