
const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

async function GetDeployed(contract) {
    try {
        var deployed = await contract.deployed();
        return deployed;
    }
    catch (e) {
    }
    return null
}

async function DeployIfNotExist(deployer, contract, option) {
    var deployed = await GetDeployed(contract);
    if (deployed == null) {
        deployed = await deployer.deploy(contract, option);
    }
    return deployed;
}

//console.log(toBytes32("ETH"));
//console.log(toBytes32("BTC"));

exports.GetDeployed = GetDeployed
exports.DeployIfNotExist = DeployIfNotExist
exports.toBytes32 = toBytes32
