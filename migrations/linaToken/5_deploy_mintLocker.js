const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");
const LnTokenLocker = artifacts.require("LnTokenLocker");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);

    //await deployer.deploy(LnTokenLocker, linaProxyErc20Address, admin);

    let kLnTokenLocker = await LnTokenLocker.deployed();
    console.log("kLnTokenLocker address", kLnTokenLocker.address);
  
    //gaslimit = await kLinearFinance.mint.estimateGas(kLnTokenLocker.address, toUnit(784000002.13));
    //await kLinearFinance.mint(kLnTokenLocker.address, toUnit(784000002.13), {gas: gaslimit});

    if (network != "mainnet") {
      let testAddress = "0x224ae8C61f31a0473dFf4aFB3Da279aCdcA9a8Fa";
      let amount = toUnit(1000000000);
      gaslimit = await kLinearFinance.mint.estimateGas(testAddress, amount);
      await kLinearFinance.mint(testAddress, amount, {gas: gaslimit});
    }
    
  });
};
