const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress} = require("../../utility/truffle-tool");
const assert = require('assert');
const LinearFinance = artifacts.require("LinearFinance");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");

const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

function toTimestamp(year,month,day,hour,minute,second){
  var datum = new Date(Date.UTC(year,month-1,day,hour,minute,second));
  var timestamp = datum.getTime()/1000 - 8*3600;
  console.log(year,month,day,hour,minute,second, "->", timestamp);
  return timestamp;
 }

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    const admin = accounts[0];
    let gaslimit = 0;
 
    let kLinearFinance = await LinearFinance.deployed();
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    //let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);
    //oTimestamp(2021, 3, 17, 0, 0, 0);

    let teampAddrs = [
      "0x544EE32c25ae9e2413bC00E6DbDc920D48B4185d",
      "0x8570d551855EDe404bBa933ef5792E533B7a3a02",
      "0x8f65e61613BD6753b74D7F353003486Ea085B4c8",
      "0xB81075e660727A135D7Bc4e590e7b990fa7b4205",
      "0xb86F584ba4d2A7dF3B0aBd44A4A4987E97eA0b18",
      "0xcCAf9A1a5ED41263A58ef771d53F5c24Fd0990BD",
      "0xf102bDD4231884766061bd7870b7d08E9d70595B",
      "0x9f8ffF4e5Ca48A01552E8c026806aC50378012bE",
      "0xF2a54B174214657c20437214cFCE86f495C95D50",
    ];
    let teampAmouonts = [
      120000000,
      130000000,
      120000000,
      130000000,
      180000000,
      100000000,
      120000000,
      60000000 ,
      40000000 ,
    ].map(toUnit);

    let lockToTimes = [
      toTimestamp(2021, 3, 17, 0, 0, 0),
      toTimestamp(2021, 6, 17, 0, 0, 0),
      toTimestamp(2021, 9, 17, 0, 0, 0),
      toTimestamp(2021, 12, 17, 0, 0, 0),
      toTimestamp(2022, 3, 17, 0, 0, 0),
      toTimestamp(2022, 6, 17, 0, 0, 0),
      toTimestamp(2022, 9, 17, 0, 0, 0),
      toTimestamp(2022, 12, 17, 0, 0, 0),
    ];

    //console.log(teampAmouonts.map(v=> v.toString()));
    assert.ok(teampAddrs.length == teampAmouonts.length);
    //assert.ok(teampAddrs.length == lockToTimes.length);

    let addresses = [];
    for (let i=0; i< lockToTimes.length; i++) {
    //  let kLnTokenCliffLocker = await DeployWithEstimate(deployer, LnTokenCliffLocker, linaProxyErc20Address, admin);
    //  addresses.push(kLnTokenCliffLocker.address);
    }

    for (let i=0; i< lockToTimes.length; i++) {
      console.log("[",lockToTimes[i],",",addresses[i],"],");
    }

    let mainnetCliffLocker = [
      [ 1615910400 , 0x073882b743a3a1E134E8c765bc294f29cFa76b3F ],
      [ 1623859200 , 0x10872CFbbD289fEf1Ae359fA68b3bBE824d9D071 ],
      [ 1631808000 , 0x0d11249D03cfedc309aac189dd2609F9354aE65e ],
      [ 1639670400 , 0xA36f6E6d50b88f715A40EA29DF9B64bf04e6DE91 ],
      [ 1647446400 , 0x26c86A1E780Ac70DCd7a034D39E988627d1a46a4 ],
      [ 1655395200 , 0x6aEd4faE4A19f0312c2c1236f5974195E3D1f258 ],
      [ 1663344000 , 0xA425dc6db122B6Ae5214109D213d80C76D3619ab ],
      [ 1671206400 , 0xe42a84577B6cc949bf6a965235B956334d357A41 ],
    ];


    // TODO: mint
  });
};
