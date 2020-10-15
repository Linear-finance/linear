
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');

const {getDeployedByName} = require("../utility/truffle-tool");

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://ropsten.infura.io/v3/" + process.env.INFURA_PROJECT_ID;

const provider = new ethers.providers.JsonRpcProvider(providerURL);
const wallet = new ethers.Wallet(privatekey, provider); 

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/", process.env.NETWORK, tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

function newContract(contractname, ataddress) {
    let abi = getAbi(contractname);
    let address = ataddress == null? getDeployedByName(contractname) : ataddress;
    
    let ct = new ethers.Contract(address, abi, provider);
    console.log("contract", contractname, "at", address);
    return ct
}

exports.provider = provider;
exports.wallet = wallet;
exports.getAbi = getAbi;
exports.newContract = newContract;