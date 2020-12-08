const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress, CallWithEstimateGas} = require("../../utility/truffle-tool");

const LinearFinance = artifacts.require("LinearFinance");
const Erc20Bridge = artifacts.require("LnErc20Bridge");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;

    let kLinearFinance = await GetDeployed(LinearFinance);
    let linaProxyErc20Address = await kLinearFinance.proxy();

    let kLnErc20Bridge = await DeployIfNotExist(deployer, Erc20Bridge, admin, kLinearFinance.address);
    
  });
};
