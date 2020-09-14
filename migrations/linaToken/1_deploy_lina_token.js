const {DeployWithEstimate, DeployIfNotExist} = require("../../utility/truffle-tool");

//const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LinearFinance = artifacts.require("LinearFinance");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];

    await DeployIfNotExist(deployer, SafeDecimalMath);
    
    let tokenstorage = await DeployIfNotExist(deployer, LnTokenStorage, admin, admin);
    let proxyErc20 = await DeployIfNotExist(deployer, LnProxyERC20, admin);

    //await deployer.link(SafeMath, LinearFinance);
    await deployer.link(SafeDecimalMath, LinearFinance);
    let lina = await DeployIfNotExist(deployer, LinearFinance, proxyErc20.address, tokenstorage.address, admin, "0");

    await tokenstorage.setOperator(lina.address);
    await proxyErc20.setTarget(lina.address);
    await lina.setProxy(proxyErc20.address);
  });
};
