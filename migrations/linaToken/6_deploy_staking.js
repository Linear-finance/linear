const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnLinearStakingStorage = artifacts.require("LnLinearStakingStorage");
const LnLinearStaking = artifacts.require("LnLinearStaking");

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

    let kLnAccessControl = await DeployIfNotExist(deployer, LnAccessControl, admin);
    let kLnLinearStakingStorage = await DeployIfNotExist(deployer, LnLinearStakingStorage, admin, kLnAccessControl.address);
    const kLnLinearStaking = await DeployIfNotExist(deployer, LnLinearStaking, admin, linaProxyErc20Address, kLnLinearStakingStorage.address);
    
    const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();
    gaslimit = await kLnAccessControl.SetRoles.estimateGas( roleKey, [kLnLinearStaking.address], [true] );
    await kLnAccessControl.SetRoles( roleKey, [kLnLinearStaking.address], [true], {gas: gaslimit} )

  });
};
