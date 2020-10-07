
const {DeployIfNotExist, DeployWithEstimate} = require("../utility/truffle-tool");
const fs = require("fs");
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

//const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const LnRewardCalculatorTest = artifacts.require("LnRewardCalculatorTest");


async function testCalcStakingReward() {
  let jsonObj = JSON.parse(fs.readFileSync("./test/stakingBlock-sort.log"));

  let rewardPerBlock = toBN("457709195988026327432");
  let totalByBlock = [];// [blcoknumber, total]
  let cancelRewards = {};
  let staking = {}; // user still staking  [blcoknumber, amount]
  let totalstaking = toBN(0);
  let totalRewardAmount = toBN(0);

  function cancelReward(address, stakedBlock, amount, curBlock) {
    let [lastBlock,lasttotal] = totalByBlock[0];
    for (let i=0; i<totalByBlock.length; i++) {
      let [b, total] = totalByBlock[i];
      if (b > stakedBlock) {
        let pass = b-lastBlock;
        let rewardPass = rewardPerBlock.mul(toBN(pass));
        let r = amount.mul(toBN(1e20)).div(lasttotal).mul(rewardPass).div(toBN(1e20));
        cancelRewards[address] = cancelRewards[address] == null ? r : r.add( cancelRewards[address] );
        //console.log("reward", address, r.toString(), amount.toString(), pass);
        totalRewardAmount = totalRewardAmount.add(r);
      }
      lastBlock = b;
      lasttotal = total;
    }
  }

  for (let i=0; i<jsonObj.length; i++) {
    let item = jsonObj[i];
    let isStaking = item[0] == "Staking";
    let address = item[1];
    let amount = toBN(item[2]);
    let blocknumber = item[item.length-1];

    if (isStaking) {
      let userArray = staking[address] == null ? [] : staking[address];
      if (userArray.length == 0|| userArray[userArray.length-1][0] != blocknumber) {
        userArray.push([blocknumber, amount]);
      } else {
        userArray[userArray.length-1][1] = amount.add(userArray[userArray.length-1][1]);
        //console.log(address, amount.toString(), userArray[userArray.length-1][1].toString());
      }
      staking[address] = userArray;
    } else { // calc reward
      let userArray = staking[address];
      let leftToCancel = amount;
      for (let j=0; j<userArray.length; j++) {
        let [b, a] = userArray[j];
        //console.log(address, b, a.toString());
        if (a.cmp(leftToCancel) == 1) {
          cancelReward(address, b, leftToCancel, blocknumber);
          userArray[j][1] = a.sub(leftToCancel);
          leftToCancel = toBN(0);
        } else {
          cancelReward(address, b, a, blocknumber);
          userArray.pop();
          leftToCancel = leftToCancel.sub(a);
        }
        if (leftToCancel.cmp(toBN(0)) == 0) {
          break;
        }
      }
      staking[address] = userArray;
    }

    totalstaking = isStaking ? totalstaking.add(amount) : totalstaking.sub(amount);
    if (totalByBlock.length == 0 || totalByBlock[totalByBlock.length-1][0] != blocknumber) {
      totalByBlock.push([blocknumber, totalstaking]);
      //console.log("+", blocknumber, totalstaking.toString());
    } else {
      totalByBlock[totalByBlock.length-1][1] = totalstaking; // modify
      //console.log("=", blocknumber, totalstaking.toString());
    }

  }

  let rewards = [];
  Object.keys(cancelRewards).map(x=>{
    rewards.push([x, cancelRewards[x].toString()]);
    //console.log(x, ",", fromWei(cancelRewards[x]));
    //console.log('["'+ x + '","'+ (cancelRewards[x]).toString() + '"],');
  });

  //console.log(JSON.stringify(rewards, null, 2));
  console.log("totalRewardAmount", totalRewardAmount.toString());

  ////////---------------------------
  /*
  let kLnRewardCalculatorTest = await LnRewardCalculatorTest.new(rewardPerBlock, toBN(10880026));
  console.log("kLnRewardCalculatorTest", kLnRewardCalculatorTest.address);
  for (let i=0; i<jsonObj.length; i++) {
      let item = jsonObj[i];
      let isStaking = item[0] == "Staking";
      let address = item[1];
      let amount = toBN(item[2]);
      let blocknumber = item[item.length-1];
      blocknumber = toBN(blocknumber);

      if (isStaking) {
          await kLnRewardCalculatorTest.deposit(blocknumber, address, amount);
      } else {
          await kLnRewardCalculatorTest.withdraw(blocknumber, address, amount);
      }
  }
*/
  //
  let kLnRewardCalculatorTest = await LnRewardCalculatorTest.at("0xf2284e2A4E2fB45B043857E7DB92b8cDcdf91f1E");

  let keys = Object.keys(cancelRewards);
  for (let i=0; i<keys.length; i++) {
      let x = keys[i];
      let info = await kLnRewardCalculatorTest.userInfo(x);
      //console.log(x, info.reward);
      let delta = info.reward.sub(cancelRewards[x]);
      if (delta.abs().cmp(toUnit("0.001")) == 1) {
          console.log(x, fromWei(info.reward), fromWei(cancelRewards[x]), fromWei(delta));
      }
  }

}

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    //await DeployIfNotExist(deployer, SafeMath);
    if (network == "development") { // testnet always new SafeDecimalMath
      await DeployWithEstimate(deployer, SafeDecimalMath);
    } else {
      await DeployIfNotExist(deployer, SafeDecimalMath);
    }

    await deployer.link(SafeDecimalMath, LnChainLinkPrices);

  });
};
