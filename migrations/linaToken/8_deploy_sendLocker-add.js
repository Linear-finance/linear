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

    let kLnTokenLocker = await LnTokenLocker.deployed();
    //
    let user1 = [
      "0x89E0CD61D02B0072b1f13E4d3d61Bb915242393D",
      "0x53A2f447C61152917493679F8105811198648d81",
    ];

    let amount1 = [
      8000000,
      8000000,
    ].map(toUnit);
  
    let days1 = [
      360,
      360,
    ];

    assert.ok(user1.length == amount1.length);
    assert.ok(user1.length == days1.length);

    gaslimit = await kLnTokenLocker.sendLockTokenMany.estimateGas(user1, amount1, days1);
    console.log("gaslimit", gaslimit);
    await kLnTokenLocker.sendLockTokenMany(user1, amount1, days1, {gas: gaslimit});

  });
};
