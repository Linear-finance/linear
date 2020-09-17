const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");
const LnTokenLocker = artifacts.require("LnTokenLocker");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);

    //let kLnTokenLocker = await LnTokenLocker.deployed();
    //
    let user1 = [
      "0xD0605442b51E6884d4Ccdfe7BCd31ac2722DB541",
      "0x3f38E0B4C6663381515c6E12AaEb5068C6370654",
      "0x8b7C0421e19D5685B86D942Bb8ADA3eADa5baa2c",
      "0x4530D87dfBdd0a59C499249F08C67dc8B4BD6eE1",
      "0x3706F5754D41EFAEd8e70d49826F035fA1b0c328",
      "0xF4F1f0e3Bb56822D8316473261170b365496668E",
      "0x6a45dDD485b3b0E478137Be03Bc242382763D603",
      "0x8017Ff21bc4972d84a4dfFf2141517dAeFD0c256",
      "0x3Aa485a8e745Fc2Bd68aBbdB3cf05B58E338D7FE",
      "0x1dDcd1F0C62EFD432b793c0Ac6017e7A3b970941",
      "0xf3F88412Fe2c190fF4D3a21e487E29C38988245d",
      "0xAe9DB1fF69cfCa2720fF2e5d81807d7383138A39",
      "0x252378Dd762da1EB778e1a3B6683f5457184ac98",
      "0x4065626bcD4F2120CaeD30a88b89cca9E044Db63",
      "0x57Eea687e1241922f5bEb50473168ec7a26e9617",
    ];

  
    let amount1 = [
      685714.4      ,
      685714.4      ,
      4571428.8     ,
      685714.4      ,
      2857143.2     ,
      133333333.33  ,
      8000000       ,
      2666666.4     ,
      10666666.4    ,
      5333333.6     ,
      4000000       ,
      2666666.4     ,
      2666666.4     ,
      25333333.6    ,
      5333333.6     ,
    ].map(toUnit);

  
    let days1 = [
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
    ];

    assert.ok(user1.length == amount1.length);
    assert.ok(user1.length == days1.length);

    //gaslimit = await kLnTokenLocker.sendLockTokenMany.estimateGas(user1, amount1, days1);
    //console.log("gaslimit", gaslimit);
    //await kLnTokenLocker.sendLockTokenMany(user1, amount1, days1, {gas: gaslimit});

  });
};
