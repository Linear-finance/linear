const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");

const LinearFinance = artifacts.require("LinearFinance");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;

    //let kLinearStaking = await DeployIfNotExist(deployer, LnLinearStaking, admin, lina.address);
    //await lina.setOperator(kLinearStaking.address);
 // avoid to re-mint
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);

    let sendto = [
      ["0x219504cDb368E3E49c724bF8DeA41EdaBf1dC224", toUnit(1000000000)],
      ["0x6601f1e8eBA765cd176eBfC689634BB1642a2525", toUnit(1000000000)],
    ];
    
    for (let i=0; i < sendto.length; i++ ) {
      let v = sendto[i];
      console.log("mint", v[0], v[1].toString());
      gaslimit = await kLinearFinance.mint.estimateGas(v[0], v[1]);
      await kLinearFinance.mint(v[0], v[1], {gas: gaslimit});
    }

  });
};
