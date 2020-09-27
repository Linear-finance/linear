const {DeployWithEstimate, DeployIfNotExist, GetDeployed, getDeployedAddress, CallWithEstimateGas} = require("../../utility/truffle-tool");
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
 
    let kLinearFinance = await LinearFinance.at("0xA7e9dA4851992b424BAb4c8AE97689AF69C654FA");
    let linaProxyErc20Address = await kLinearFinance.proxy();
    console.log("linaProxyErc20Address", linaProxyErc20Address);
    let kLnProxyERC20 = await LnProxyERC20.at(linaProxyErc20Address);
    //oTimestamp(2021, 3, 17, 0, 0, 0);

    let teampAddrs = [
      "0x544EE32c25ae9e2413bC00E6DbDc920D48B4185d",
      "0x8570d551855EDe404bBa933ef5792E533B7a3a02",
      "0x8f65e61613BD6753b74D7F353003486Ea085B4c8",
      "0xB81075e660727A135D7Bc4e590e7b990fa7b4205",
      "0xb86F584ba4d2A7dF3B0aBd44A4A4987E97eA0b18",
      "0xcCAf9A1a5ED41263A58ef771d53F5c24Fd0990BD",
      "0xf102bDD4231884766061bd7870b7d08E9d70595B",
      //"0x9f8ffF4e5Ca48A01552E8c026806aC50378012bE",
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
    //60000000,
    //40000000,
      100000000,
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

    // after DeployWithEstimate LnTokenCliffLocker
    let oldMainnetCliffLocker = [
      [ 1615910400 , "0x073882b743a3a1E134E8c765bc294f29cFa76b3F" ],
      [ 1623859200 , "0x10872CFbbD289fEf1Ae359fA68b3bBE824d9D071" ],
      [ 1631808000 , "0x0d11249D03cfedc309aac189dd2609F9354aE65e" ],
      [ 1639670400 , "0xA36f6E6d50b88f715A40EA29DF9B64bf04e6DE91" ],
      [ 1647446400 , "0x26c86A1E780Ac70DCd7a034D39E988627d1a46a4" ],
      [ 1655395200 , "0x6aEd4faE4A19f0312c2c1236f5974195E3D1f258" ],
      [ 1663344000 , "0xA425dc6db122B6Ae5214109D213d80C76D3619ab" ],
      [ 1671206400 , "0xe42a84577B6cc949bf6a965235B956334d357A41" ],
    ];

    let mainnetCliffLocker = [
      [ 1615910400 , "0x59C02617C9DB4a2a77176A3DE771f280027F4b50" ],
      [ 1623859200 , "0x834a21D15EC6c2479A39c6b4b9Db3BA9598A1169" ],
      [ 1631808000 , "0x2662c886969DE43F70A9509A6CE23DbeB00d53Ac" ],
      [ 1639670400 , "0x3638B11ce641432Eb28B1F5264b61133C8618c1c" ],
      [ 1647446400 , "0x94191c407f22F4e975069a78021B44c0ACa2C7fd" ],
      [ 1655395200 , "0xcfFb48Ddd13bB6D19CF832888F3c55F5e3673a63" ],
      [ 1663344000 , "0x289CefD0C5ff738307c2e555dfe36e0dd68d3beb" ],
      [ 1671206400 , "0xd2bA0F0FbBecFe3b2330127971048E2B9285F526" ],
    ];

    let devLocker = [
      [ 1615910400 , "0x5760F375a9BF379d872FBbb9a9D18f4910602C0a" ],
      [ 1623859200 , "0x4544Ac0a005bAEcC47cd26E838f42C38bac96e75" ],
      [ 1631808000 , "0x57D9E261D1e51d44d1B8B17339d8d7cf4d2A7755" ],
      [ 1639670400 , "0x5F001BAE4eF40D139e29Fd60456E33F04e39654f" ],
      [ 1647446400 , "0x44d10a49e97E616808370e70878f6A2698f9D60C" ],
      [ 1655395200 , "0xEc81d17b372bcdf60093d241fc7DD4f0b37E85F1" ],
      [ 1663344000 , "0xAaf147c66AfFE4CE0BCf9B953a8822545544Ddd4" ],
      [ 1671206400 , "0x039E17b6235bC500d6bd8e4625dF5dDabcFAA50C" ],
    ];

    //************* */
    // Note
    let lockers;
    if (network == "mainnet") {
      lockers = mainnetCliffLocker;
    } else if (network == "development") {
      lockers = devLocker;
    } else {
      lockers = [];
    }

    //assert.ok(lockers.length == lockToTimes.length);
/*
    let sendAmount = teampAmouonts.map( x => x.div(new BN(lockToTimes.length)) );
    console.log("sendAmount", sendAmount.map( x => x.toString() ));

    for (let i=0; i<lockers.length; i++) {
      let time = lockers[i][0];
      let addr = lockers[i][1];
      console.log("running send:", time, addr, i);
      let kLnTokenCliffLocker = await LnTokenCliffLocker.at(addr);
      let times = teampAddrs.map(x => time);

      gaslimit = await kLnTokenCliffLocker.sendLockTokenMany.estimateGas(teampAddrs, sendAmount, times);
      console.log("gaslimit", gaslimit);
      await kLnTokenCliffLocker.sendLockTokenMany(teampAddrs, sendAmount, times, {gas: gaslimit});

      let pa = sendAmount.map(x => x.toString());
      console.log(teampAddrs, pa, times);
    }
*/
/*
    // burn
    for (let i=0; i<oldMainnetCliffLocker.length; i++) {
      let addr = oldMainnetCliffLocker[i][1];
      let balance = await kLnProxyERC20.balanceOf(addr);
      if (balance.cmp(new BN(0)) == 1) {
        console.log("burn", addr.toString(), balance);
        await CallWithEstimateGas(kLinearFinance.burn, addr, balance);
      }
    }
*/
    // mint

    let mintAmount = toUnit(187500000);
    for (let i=0; i<lockers.length; i++) {
      let addr = lockers[i][1];
      let balance = await kLnProxyERC20.balanceOf(addr);
      //assert.ok(balance.cmp(new BN(0)) == 0);
      if (balance.cmp(new BN(0)) == 0) {
        gaslimit = await kLinearFinance.mint.estimateGas(addr, mintAmount);
        console.log("gaslimit mint", gaslimit);
        await kLinearFinance.mint(addr, mintAmount, {gas: gaslimit});
      } else {
        console.log(addr, "has lina", balance.toString());
      }
    }
  
  });
};
