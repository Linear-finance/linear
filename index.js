'use strict';

const LinearFinance = artifacts.require('LinearFinance');

async function main() {
  // We can use the `deployed()` truffle helper to retrieve the upgradeable instance
  const deployed = await LinearFinance.deployed();
  const rewardFactor = await deployed.rewardFactor();
// other check..

}

// Handle truffle exec
module.exports = function(callback) {
  main().then(() => callback()).catch(err => callback(err))
};
