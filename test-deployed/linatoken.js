
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://ropsten.infura.io/v3/" + process.env.INFURA_PROJECT_ID;

console.log(privatekey, providerURL)

const provider = new ethers.providers.JsonRpcProvider(providerURL);

const wallet = new ethers.Wallet(privatekey, provider)

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/ropsten/" + tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiLina = getAbi("LinearFinance");
var abiProxy = getAbi("LnProxyERC20");

const contractLina = new ethers.Contract("0x3285Df5888634400fF8fcE864C1A6f55b2bC3338", abiLina, provider);
const contractErc20Proxy = new ethers.Contract("0xFB3Fd84CC952fFD44D91A04A1714301eCBD530C0", abiProxy, provider);

async function mint() {
    console.log("contract address " + contractLina.address)
    
    let testaddress = "0x224ae8C61f31a0473dFf4aFB3Da279aCdcA9a8Fa"
    let balance = await contractErc20Proxy.balanceOf(testaddress);
    console.log("balance " + balance);
    
    try {
        let estimateGas = await contractLina.connect(wallet).estimateGas.mint(testaddress, toUnit(1000).toString());
        //console.log("estimateGas", estimateGas.toNumber());
        let ret = await contractLina.connect(wallet).mint(testaddress, toUnit(1000).toString(), {gasLimit:estimateGas});
        console.log("mint ret :"+ ret)
    }
    catch(err) {
        console.log("mint err :"+ err)
    }
}

async function setTimePeriod() {
    try {
        let ret = await contractLina.connect(wallet).set_StakingPeriod((1600169645+24*3600 ).toString(), (1600169645+2*24*3600).toString());
        console.log("set_StakingPeriod ret :"+ ret)
    }
    catch(err) {
        console.log("set_StakingPeriod err :"+ err)
    }
    let timeperiod = await contractLina.stakingPeriod();
    console.log("timeperiod", timeperiod);
}


//increment.then((value) => {
//    console.log(value);
//});

// run only one async func 

mint();
//setTimePeriod();

