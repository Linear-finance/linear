const Migrations = artifacts.require("Migrations");
const {DeployIfNotExist} = require("../../utility/truffle-tool");

const LnTokenLocker = artifacts.require("LnTokenLocker");

module.exports = function (deployer, network, accounts) {
  deployer.then(async ()=>{
    let gaslimit = 0;
    gaslimit = await Migrations.new.estimateGas();
    //console.log("gaslimit Migrations new", gaslimit);
    //await DeployIfNotExist(deployer, Migrations, {gas: gaslimit});

    const admin = accounts[0];
    const linaTokenAddress = "0xFB3Fd84CC952fFD44D91A04A1714301eCBD530C0";
    gaslimit = await LnTokenLocker.new.estimateGas(linaTokenAddress, admin);
    await deployer.deploy(LnTokenLocker, linaTokenAddress, admin, {gas: gaslimit});
  });
};
