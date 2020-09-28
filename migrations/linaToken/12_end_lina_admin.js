const {DeployWithEstimate, DeployIfNotExist, GetDeployed, CallWithEstimateGas} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnEndAdmin = artifacts.require("LnEndAdmin");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.at("0xA7e9dA4851992b424BAb4c8AE97689AF69C654FA");
    let linaProxyErc20Address = await kLinearFinance.proxy();
    let storageAddress = await kLinearFinance.tokenStorage();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    console.log("storageAddress", storageAddress);
    let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);
    let kLnTokenStorage = await LnTokenStorage.at(storageAddress);
    if (network == "mainnet") {
      assert.ok(linaProxyErc20Address == "0x3E9BC21C9b189C09dF3eF1B824798658d5011937");
      assert.ok(storageAddress == "0xf1A16D778fE004c495dF8d3C46d2ABe71eCF6CfE");
    }

    //let kLnEndAdmin = await DeployIfNotExist(deployer, LnEndAdmin);
    let kLnEndAdmin = await LnEndAdmin.at("0x38d47d313e70d0Cbcf618ADBB84b0dA66d35ED5E");
    
    //await CallWithEstimateGas(kLinearFinance.setCandidate, kLnEndAdmin.address);
    //await CallWithEstimateGas(kLnProxyERC20.setCandidate, kLnEndAdmin.address);
    //await CallWithEstimateGas(kLnTokenStorage.setCandidate, kLnEndAdmin.address);

    //await CallWithEstimateGas(kLnEndAdmin.becomeAdmin, kLinearFinance.address);
    //await CallWithEstimateGas(kLnEndAdmin.becomeAdmin, kLnProxyERC20.address);
    //await CallWithEstimateGas(kLnEndAdmin.becomeAdmin, kLnTokenStorage.address);

  });
};
