
const {DeployIfNotExist} = require("../utility/truffle-tool");

const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    await DeployIfNotExist(deployer, SafeMath);
    await DeployIfNotExist(deployer, SafeDecimalMath);
  });
};
