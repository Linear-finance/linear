
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://mainnet.infura.io/v3/" + process.env.INFURA_PROJECT_ID;

console.log(privatekey, providerURL)

const provider = new ethers.providers.JsonRpcProvider(providerURL);

const wallet = new ethers.Wallet(privatekey, provider)

const contracts_build_directory = process.env.BUILD_DIR ? process.env.BUILD_DIR : "./build";

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', contracts_build_directory , tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiFundVa = getAbi("LnFundVault");

const contractFV = new ethers.Contract("0x736273F50d3Bd68de33Fc2Ed5e345a1bE2D175B9", abiFundVa, provider);

async function claim() {
    console.log("contract address " + contractFV.address);
    console.log("wallet address", wallet.address);
    
    try {
        let estimateGas = await contractFV.connect(wallet).estimateGas.claim(toUnit(0.01).toString());
        console.log("estimateGas", estimateGas);
        await contractFV.connect(wallet).claim(toUnit(0.01).toString(), { gasLimit: estimateGas.toNumber()+100 });
    }
    catch(err) {
        console.log("claim err :", err)
    }
}

claim();