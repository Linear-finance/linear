const fs = require('fs');
const path = require('path');

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

function readJson(filePath) {
    jsonObj = {};
    if(fs.existsSync(filePath)){
        try {
            //jsonObj = require(filePath); // the `require` method alway return the loaded obj
            jsonObj = JSON.parse(fs.readFileSync(filePath)); // reload from disk
        } catch (error) {
            console.error("readJson error:", error);
        }
    }
    return jsonObj;
}

exports.readJson = readJson

let deployedContracts;

function getDeployedFileName() {
    return path.join(__dirname, "../log", process.env.NETWORK + "-deployed.json");
}

// TODO : log many address, an array list
function LoadDeployedContractsData() {
    let file = getDeployedFileName();
    if (deployedContracts == null)
        deployedContracts = readJson(file);
    return deployedContracts;
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
    if (deployedContracts[contactObj.contractName] != null) {
        let timestamp = Date.now();
        console.log("contact has in deployed log file", timestamp);
        deployedContracts[contactObj.contractName+"-"+timestamp] = {address: newContract.address}
    } else {
        deployedContracts[contactObj.contractName] = {address: newContract.address}
    }
    let file = getDeployedFileName();
    fs.writeFileSync(file, JSON.stringify(deployedContracts, null, 2));
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

