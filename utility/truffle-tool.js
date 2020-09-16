const fs = require('fs');
const path = require('path');

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

function readJson(filePath) {
    jsonObj = {};
    if(fs.existsSync(filePath)){
        try {
            jsonObj = require(filePath); // the `require` method alway return the loaded obj
            //jsonObj = JSON.parse(fs.readFileSync(filePath)); // reload from disk
        } catch (error) {
            logerr.error("readJson error:", error);
        }
    }
    return jsonObj;
}

exports.readJson = readJson

let deployedContracts;

// TODO : log many address, an array list
function LoadDeployedContractsData() {
    let file = path.join(__dirname, "../log", process.env.NETWORK + "-deployed.json");
    deployedContracts = readJson(file);
}
LoadDeployedContractsData();

function getDeployedAddress(contract) {
    if (deployedContracts[contract.contractName] != null) {
        return deployedContracts[contract.contractName].address;
    }
    return null
}

async function GetDeployed(contract, deployedAddress) {
    try {
        var deployed = await contract.deployed();
        if (deployed == null) {
            if (deployedAddress != null) {
                deployed = await contract.at(deployedAddress);
                console.log("GetDeployed", contract.contractName, "from build", deployedAddress);
            } else {
                let deployedaddr = getDeployedAddress(contract);
                if (deployedaddr != null) {
                    deployed = await contract.at(deployedaddr);
                    console.log("GetDeployed", contract.contractName, "from config", deployedaddr);
                }
            }
        }
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
exports.getDeployedAddress = getDeployedAddress

