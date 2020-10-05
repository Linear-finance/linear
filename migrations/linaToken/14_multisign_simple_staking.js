const {DeployWithEstimate, DeployIfNotExist, GetDeployed, CallWithEstimateGas} = require("../../utility/truffle-tool");
const assert = require('assert');
const fs = require("fs");
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnSimpleStaking = artifacts.require("LnSimpleStaking");
const MultiSigForTransferFunds = artifacts.require("MultiSigForTransferFunds");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLnSimpleStaking = await LnSimpleStaking.deployed();
    //0xeEA988387700dB4e163cd72D8d4A6994af31EeB1
    console.log("kLnSimpleStaking at",kLnSimpleStaking.address);
  
    let admins = [
      "​0xdf8Dd0ffF2B4EAe87bAD683E66A25522c237766e​",
      "0xfB2d8d4Eed33e58505A2CC82fc17c439F051ed0c​",
      "0x4Ff7c0810F4EEebe7Cba15f1517d4910966df237​"
    ];

    let iConfirmNumb = 2; // TODO?
    assert.ok(admins.length > 0);
    assert.ok(iConfirmNumb <= admins.length);
    assert.ok(iConfirmNumb > 0);

    let kMultiSigForTransferFunds = await DeployIfNotExist(deployer, MultiSigForTransferFunds, admins, iConfirmNumb, kLnSimpleStaking.address);
    //await kLnSimpleStaking.setCandidate(kMultiSigForTransferFunds.address);
    //await kMultiSigForTransferFunds.becomeAdmin(kLnSimpleStaking.address);

    console.log((await kLnSimpleStaking.candidate()));
    console.log((await kLnSimpleStaking.admin()));
  });
};
