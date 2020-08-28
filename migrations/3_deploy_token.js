const {DeployIfNotExist} = require("../utility/truffle-tool");

const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LinearFinance = artifacts.require("LinearFinance");

const LnAddressStorage = artifacts.require("LnAddressStorage");
const testAddressCache = artifacts.require("testAddressCache");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let tokenstorage = await deployer.deploy(LnTokenStorage, admin, admin);
    let proxyErc20 = await deployer.deploy(LnProxyERC20, admin);

    await deployer.link(SafeMath, LinearFinance);
    await deployer.link(SafeDecimalMath, LinearFinance);
    let lina = await deployer.deploy(LinearFinance, proxyErc20.address, tokenstorage.address, admin, "0");

    await tokenstorage.setOperator(lina.address);
    await proxyErc20.setTarget(lina.address);
    await lina.setProxy(proxyErc20.address);

    let addrStorage = await deployer.deploy(LnAddressStorage, admin);
    let testAddrCache = await deployer.deploy( testAddressCache, admin );

  });
};
