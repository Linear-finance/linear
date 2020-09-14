
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

// TODO: deploy and record
async function DeployWithEstimate(deployer, contactObj, ...manyMoreArgs) {
    let gaslimit = await contactObj.new.estimateGas(...manyMoreArgs);
    console.log("estimate gaslimit:", contactObj.contractName, gaslimit);
    let newContract = await deployer.deploy(contactObj, ...manyMoreArgs, {gas: gaslimit});
    return newContract;
}

async function DeployIfNotExist(deployer, contract, ...manyMoreArgs) {
    var deployed = await GetDeployed(contract);
    if (deployed == null) {
        //deployed = await deployer.deploy(contract, option);
        deployed = await DeployWithEstimate(deployer, contract, ...manyMoreArgs);
    }
    return deployed;
}

//console.log(toBytes32("ETH"));
//console.log(toBytes32("BTC"));

// get gas price online
// deploy contract: 1.estimateGas, 2.save deployed contract address.

exports.GetDeployed = GetDeployed
exports.DeployIfNotExist = DeployIfNotExist
exports.toBytes32 = toBytes32
exports.DeployWithEstimate = DeployWithEstimate
