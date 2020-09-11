const Migrations = artifacts.require("Migrations");
const {DeployIfNotExist} = require("../../utility/truffle-tool");

const LnFundVault = artifacts.require("LnFundVault");

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    
    let gaslimit = await Migrations.new.estimateGas();
    //console.log("gaslimit Migrations new", gaslimit);

    //await DeployIfNotExist(deployer, Migrations, {gas: gaslimit});

    //(address _admin, uint fund, uint investNumb, address payable _receive )
    const admin = accounts[0];
    const fundVal = toUnit("0.01");
    const investNumber = 2; //
    const receive = "0x81de13D9749cEb529638353bD5086D6CBb942fDd";

    gaslimit = await LnFundVault.new.estimateGas(admin, fundVal, investNumber, receive);

    console.log("gaslimit LnFundVault new", gaslimit);

    await deployer.deploy(LnFundVault, admin, fundVal, investNumber, receive, {gas: gaslimit});
  });
};
