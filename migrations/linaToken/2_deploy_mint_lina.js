const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");

const LinearFinance = artifacts.require("LinearFinance");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
/*
    //let kLinearStaking = await DeployIfNotExist(deployer, LnLinearStaking, admin, lina.address);
    //await lina.setOperator(kLinearStaking.address);
 // avoid to re-mint
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);

    let sendto = [
      ["0xa8B1B2fE20910BfdaC05787A16Ee78A4f15c64dB", toUnit(500000000)],
      ["0xcaC895c9271550934721191767ebD2945A149b95", toUnit(1000000000)],
      ["0xEC2Be13d8bfb5C7398826b6A74C9975948417BC4", toUnit(500000000)],
      ["0x35809DCe944D8333cdD6bf3c845dFcF5e4B51eC5", toUnit(1500000000)],
      ["0xA2627045414B080B47E4Da21A7D57470BbA0E57B", toUnit(4000000000)],
    ];
    
    for (let i=0; i < sendto.length; i++ ) {
      let v = sendto[i];
      console.log("mint", v[0], v[1].toString());
      gaslimit = await kLinearFinance.mint.estimateGas(v[0], v[1]);
      await kLinearFinance.mint(v[0], v[1], {gas: gaslimit});
    }
*/
  });
};
