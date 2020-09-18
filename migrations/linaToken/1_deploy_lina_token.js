const {DeployWithEstimate, DeployIfNotExist} = require("../../utility/truffle-tool");

const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LinearFinance = artifacts.require("LinearFinance");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
/* done
    let tokenstorage = await DeployIfNotExist(deployer, LnTokenStorage, admin, admin);
    let proxyErc20 = await DeployIfNotExist(deployer, LnProxyERC20, admin);

    let lina = await DeployIfNotExist(deployer, LinearFinance, proxyErc20.address, tokenstorage.address, admin, "0");

    gaslimit = await tokenstorage.setOperator.estimateGas(lina.address);
    console.log("gaslimit setOperator", gaslimit);
    await tokenstorage.setOperator(lina.address, {gas: gaslimit});

    gaslimit = await proxyErc20.setTarget.estimateGas(lina.address);
    console.log("gaslimit setTarget", gaslimit);
    await proxyErc20.setTarget(lina.address, {gas: gaslimit});

    //estimateGas example
    gaslimit = await lina.setProxy.estimateGas(proxyErc20.address);
    console.log("gaslimit setProxy", gaslimit);
    await lina.setProxy(proxyErc20.address, {gas: gaslimit});
  */  
  });
};
