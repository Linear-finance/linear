
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://"+ process.env.NETWORK +".infura.io/v3/" + process.env.INFURA_PROJECT_ID;

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

let contractAddress;
if (process.env.NETWORK == "mainnet" ) {
    contractAddress = "0x736273F50d3Bd68de33Fc2Ed5e345a1bE2D175B9";
} else if (process.env.NETWORK == "ropsten" ) {
    contractAddress = "0xF02DD62c451042C571cE9153DC62a9461b1bd93F";
}

const contractFV = new ethers.Contract(contractAddress, abiFundVa, provider);

console.log("contract address " + contractFV.address);
console.log("wallet address", wallet.address);

async function claim() {    
    try {
        let estimateGas = await contractFV.connect(wallet).estimateGas.claim(toUnit(0.01).toString());
        console.log("estimateGas", estimateGas);
        let r = await contractFV.connect(wallet).claim(toUnit(0.01).toString(), { gasLimit: estimateGas.toNumber()+100 });
        console.log("claim", r);
    }
    catch(err) {
        console.log("run err :", err);
    }
}

async function SetFundValue(amount) {
    try {
        let estimateGas = await contractFV.connect(wallet).estimateGas.SetFundValue(amount.toString());
        console.log("estimateGas", estimateGas);
        console.log("SetFundValue", amount.toString());
        let r = await contractFV.connect(wallet).SetFundValue(amount.toString(), { gasLimit: estimateGas.toNumber()+100 });
        console.log("SetFundValue", r);
    }
    catch(err) {
        console.log("run err :", err);
    }
}

async function SetInvestNumb(number) {
    try {
        let estimateGas = await contractFV.connect(wallet).estimateGas.SetInvestNumb(number.toString());
        console.log("estimateGas", estimateGas);
        console.log("SetInvestNumb", number.toString());
        let r = await contractFV.connect(wallet).SetInvestNumb(number.toString(), { gasLimit: estimateGas.toNumber()+100 });
        console.log("SetInvestNumb", r);
    }
    catch(err) {
        console.log("run err :", err);
    }
}

//claim();
//SetFundValue( toUnit(1) );
//SetInvestNumb(1000);
