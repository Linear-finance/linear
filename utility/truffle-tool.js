const assert = require('assert');
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

function getDeployedByName(name) {
    let file = getDeployedFileName();
    let deployed = readJson(file);
    if (deployed[name] != null)
        return deployed[name].address;
    return null;
}

// 1. get from parameter; 2. get from log file; 3. get from truffle out file
async function GetDeployed(contract, deployedAddress) {
    var deployed
    if (deployedAddress != null) {
        try {
            deployed = await contract.at(deployedAddress);
            console.log("GetDeployed", contract.contractName, "from param address", deployedAddress);
            return deployed;
        } catch (e) { 
        }
        return null;
    }// TODO: need to continu follow code?
    
    try {
        let deployedaddr = getDeployedAddress(contract);
        deployed = await contract.at(deployedaddr);
        console.log("GetDeployed", contract.contractName, "from logfile", deployedaddr);
        return deployed;
    }
    catch (e) {
        try{
            deployed = await contract.deployed();
            console.log("GetDeployed", contract.contractName, "from truffle", deployed.address);
            return deployed;
        } catch (e) { 
        }
    }
    return null
}

async function SaveContractAddress(contactObj, newContract, suffix) {
    let recordName = contactObj.contractName;
    if (suffix != null) {
        recordName = recordName + "_" + suffix;
    }
    if (recordName == "LnAssetUpgradeable") {
        let symbol = await newContract.symbol();
        recordName = recordName + "_" + symbol;
    }
    if (deployedContracts[recordName] != null) {
        let timestamp = Date.now();
        console.log("save contract address", contactObj.contractName, recordName);
        deployedContracts[recordName+"_"+timestamp] = {address: newContract.address}
    } else {
        deployedContracts[recordName] = {address: newContract.address}
        console.log("save contract address", contactObj.contractName, recordName);
    }
    let file = getDeployedFileName();
    fs.writeFileSync(file, JSON.stringify(deployedContracts, null, 2));
}

async function DeployWithEstimate(deployer, contactObj, ...manyMoreArgs) {
    let gaslimit = await contactObj.new.estimateGas(...manyMoreArgs);
    console.log("new gaslimit:", contactObj.contractName, gaslimit);
    let newContract = await deployer.deploy(contactObj, ...manyMoreArgs, {gas: gaslimit});
    await SaveContractAddress(contactObj, newContract);
    return newContract;
}

async function DeployWithEstimateSuffix(deployer, suffix, contactObj, ...manyMoreArgs) {
    let gaslimit = await contactObj.new.estimateGas(...manyMoreArgs);
    console.log("new gaslimit:", contactObj.contractName, gaslimit);
    let newContract = await deployer.deploy(contactObj, ...manyMoreArgs, {gas: gaslimit});
    await SaveContractAddress(contactObj, newContract, suffix);
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

//auto estimateGas for send call contract function
async function CallWithEstimateGas(contractFun, ...manyMoreArgs) {
  assert.ok(contractFun.estimateGas, "function without estimateGas member");
  let gaslimit = await contractFun.estimateGas(...manyMoreArgs);
  await contractFun(...manyMoreArgs, {gas: gaslimit});
  console.log("call gaslimit", gaslimit);
}

//console.log(toBytes32("ETH"));
//console.log(toBytes32("BTC"));

// get gas price online
// deploy contract: 1.estimateGas, 2.save deployed contract address.

exports.GetDeployed = GetDeployed
exports.DeployIfNotExist = DeployIfNotExist
exports.toBytes32 = toBytes32
exports.DeployWithEstimate = DeployWithEstimate
exports.DeployWithEstimateSuffix = DeployWithEstimateSuffix
exports.getDeployedAddress = getDeployedAddress
exports.getDeployedByName = getDeployedByName
exports.CallWithEstimateGas = CallWithEstimateGas

