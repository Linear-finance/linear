const {DeployWithEstimate, DeployIfNotExist, GetDeployed, CallWithEstimateGas} = require("../../utility/truffle-tool");
const assert = require('assert');
const fs = require("fs");
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.deployed();
    if (network == "mainnet") {
      kLinearFinance = await LinearFinance.at("0xA7e9dA4851992b424BAb4c8AE97689AF69C654FA");
    }
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
    
    let kLnTokenCliffLocker = await DeployWithEstimate(deployer, LnTokenCliffLocker, linaProxyErc20Address, admin);
    // mainnet 0x36cd1B5e4F4F2C4978Ec5D4253458bEe971e841b

    let jsonObj = JSON.parse(fs.readFileSync("./migrations/linaToken/oldStakingLockReward.json"));
    if (network == "ropsten") {
      jsonObj.push(["0x27f12994A218B1649FE185D19aAC00310aB198C5", toUnit(1000)]);
    }
    let maxList = 40;
    let lockTo = 1620806400;
    if (network == "ropsten") {
      lockTo = 1601287507;
    }
    console.log("lockTo", lockTo);
    let locktime = [];
    for (let i=0; i< maxList; i++) {
      locktime.push(lockTo);
    }

    while(jsonObj.length) {
      let part = jsonObj.splice(0, maxList);

      let address = [];
      let amount = [];
      part.map(x => {
        address.push(x[0]);
        amount.push(toBN(x[1]));
      });
      let lt = locktime;
      if (address.length != maxList) {
        lt = []
        for (let i=0; i< address.length; i++) {
          lt.push(lockTo);
        }
      }

      console.log("sendLockTokenMany", address.length);
      await CallWithEstimateGas(kLnTokenCliffLocker.sendLockTokenMany, address, amount, lt);
    }

    //check
    async function checkSend(index) {
      if (index >= jsonObj.length)
        return;
      let [u,a] = jsonObj[index];
      let data = await kLnTokenCliffLocker.lockData(u);
      if (data.amount.cmp( toBN(a) ) != 0) {
        console.log("Error send: ", u, a, data.amount.toString());
      }
    }
    checkSend(0);
    checkSend(2);
    checkSend(5);
    checkSend(20);
    checkSend(200);
    checkSend(333);
    checkSend(jsonObj.length-1);

  });
};
