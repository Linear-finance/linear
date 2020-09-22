
const {DeployIfNotExist} = require("../utility/truffle-tool");

//const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    //await DeployIfNotExist(deployer, SafeMath);
    await DeployIfNotExist(deployer, SafeDecimalMath);

    await deployer.link(SafeDecimalMath, LnChainLinkPrices);
  });
};
