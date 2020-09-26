const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress, CallWithEstimateGas} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnAsset = artifacts.require("LnAsset");


const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];

    if (network == "ropsten") {
      // lUSD, recover
      /*
      let proxyErc20 = await LnProxyERC20.at("0xd8dAaCE0557726475758Ae2EaE13E05b9cE2956E");
      let tokenstorage = await LnTokenStorage.at("0xa4baFb83514926106c6802d9fA11E96Ab943FeBE");
      let kAsset = await LnAsset.at("0xeef6729d47e6dfD4a67704764E6A22dbE496080A");

      await CallWithEstimateGas(proxyErc20.setTarget, "0xeef6729d47e6dfD4a67704764E6A22dbE496080A");
      await CallWithEstimateGas(tokenstorage.setOperator, "0xeef6729d47e6dfD4a67704764E6A22dbE496080A");
      await CallWithEstimateGas(kAsset.setProxy, proxyErc20.address);
*/
      //
      // fix new lina
      let proxyErc20 = await LnProxyERC20.at("0x908B56f016233E84c391eebe52Ee4d461fD8fb87");
      let tokenstorage = await LnTokenStorage.at("0xFFfE11e7a3CB07C32917694A1047ab88CE99CF7D");

      let totalSupply = await proxyErc20.totalSupply();
      totalSupply = toUnit("2000000000");
      let lina = await DeployWithEstimate(deployer, LinearFinance, proxyErc20.address, tokenstorage.address, admin, totalSupply);

      await CallWithEstimateGas(tokenstorage.setOperator, lina.address); 
      await CallWithEstimateGas(proxyErc20.setTarget, lina.address);
      await CallWithEstimateGas(lina.setProxy, proxyErc20.address);

      // burn old staking, mint simple staking.
      let balance = await proxyErc20.balanceOf("0x6E399001031fe7105ff218c3d5c9b558d3Be837c");
      console.log("old staking balance", balance.toString());
      await lina.burn("0x6E399001031fe7105ff218c3d5c9b558d3Be837c", balance);
      await lina.mint("0x21e7A26b1eF76845DEa8b93b23501c54f1c6BBd4", balance);
    }
/*
    if (network == "mainnet") {
      let proxyErc20 = await LnProxyERC20.at("0x3E9BC21C9b189C09dF3eF1B824798658d5011937");
      let tokenstorage = await LnTokenStorage.at("0xf1A16D778fE004c495dF8d3C46d2ABe71eCF6CfE");
      
      let totalSupply = await proxyErc20.totalSupply();
      console.log("totalSupply", totalSupply.toString());
      let lina = await DeployWithEstimate(deployer, LinearFinance, proxyErc20.address, tokenstorage.address, admin, totalSupply);

      await CallWithEstimateGas(tokenstorage.setOperator, lina.address);  
      await CallWithEstimateGas(proxyErc20.setTarget, lina.address);
      await CallWithEstimateGas(lina.setProxy, proxyErc20.address);
    } */

    if (network == "mainnet") {
      let lina = await LinearFinance.at("0xA7e9dA4851992b424BAb4c8AE97689AF69C654FA");
      let proxyErc20 = await LnProxyERC20.at("0x3E9BC21C9b189C09dF3eF1B824798658d5011937");

      let oldstakingAddress = "0x410903Bff34f4d7DC510FbFd15E5Ba68C7218130";
      let newSimpleStakingAddress = "0xeEA988387700dB4e163cd72D8d4A6994af31EeB1";
      /*
      let b = await proxyErc20.balanceOf("0xE943340B0474D50460C05BA8358d894bF300Ab08");
      await lina.burn("0xE943340B0474D50460C05BA8358d894bF300Ab08", b);
      console.log("burn", b.toString());
      b = await proxyErc20.balanceOf("0xaC75749cE61d9349f6B7dD6251045F5A9EC09bBA");
      await lina.burn("0xaC75749cE61d9349f6B7dD6251045F5A9EC09bBA", b);
      console.log("burn", b.toString());
*/
      //let balance = await proxyErc20.balanceOf(oldstakingAddress);
      //console.log("old staking balance", balance.toString());
      //await lina.burn(oldstakingAddress, balance);

      //await lina.mint(newSimpleStakingAddress, toBN("171638244150265300746187316"));

      await CallWithEstimateGas(lina.mint, "0xaC75749cE61d9349f6B7dD6251045F5A9EC09bBA", toUnit("0.6"));
    }


  });
};
