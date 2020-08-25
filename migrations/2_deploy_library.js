
const DeployIfNotExist = require("../utility");

const SafeMath = artifacts.require("SafeMath");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    await DeployIfNotExist(deployer, SafeMath);
    await DeployIfNotExist(deployer, SafeDecimalMath);
  });
};
