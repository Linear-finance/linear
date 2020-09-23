const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");
const LnTokenLocker = artifacts.require("LnTokenLocker");
const LnSimpleStaking = artifacts.require("LnSimpleStaking");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnLinearStakingStorage = artifacts.require("LnLinearStakingStorage");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    //let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);

    let kLnLinearStakingStorage = await LnLinearStakingStorage.deployed();
    let kLnAccessControl = await LnAccessControl.deployed();
    // TODO: setup value
    if (network == "ropsten") {
      let rewardPerBlock = toUnit(10000);
      let rewardStartBlock = 8708024;
      let rewardEndBlock = 8708024 + 300000;
      let kLnSimpleStaking = await DeployIfNotExist(deployer, LnSimpleStaking, admin, linaProxyErc20Address, kLnLinearStakingStorage.address, rewardPerBlock, rewardStartBlock, rewardEndBlock);
      //const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();
      //await kLnAccessControl.SetRoles( roleKey, [kLnSimpleStaking.address], [true] );
      let arrayTotal = await kLnLinearStakingStorage.weekTotalStaking();
      let oldStakingAddress = kLnLinearStakingStorage.address;
      let oldStakingAmount = arrayTotal[7];
      let oldStakingBlockNumber = rewardStartBlock;
      await kLnSimpleStaking.migrationsOldStaking(oldStakingAddress, oldStakingAmount, oldStakingBlockNumber);
    }
    
  });
};
