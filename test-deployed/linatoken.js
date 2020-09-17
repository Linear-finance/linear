
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://"+process.env.NETWORK+".infura.io/v3/" + process.env.INFURA_PROJECT_ID;

const provider = new ethers.providers.JsonRpcProvider(providerURL);

const wallet = new ethers.Wallet(privatekey, provider)

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/"+process.env.NETWORK+"/" + tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath);
    
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiLina = getAbi("LinearFinance");
var abiProxy = getAbi("LnProxyERC20");
var abiLnLinearStaking = getAbi("LnLinearStaking");
var abiLnLinearStakingStorage = getAbi("LnLinearStakingStorage");

const contractLina = new ethers.Contract("0x811D779Ab23446C508b20f46246EC9C88fC018Ae", abiLina, provider);

async function mint() {
    console.log("contract address " + contractLina.address)
    
    // zhao 0x27f12994A218B1649FE185D19aAC00310aB198C5
    const proxyAddress = await contractLina.proxy();
    console.log("proxyAddress", proxyAddress);
    //const contractErc20Proxy = new ethers.Contract(proxyAddress, abiProxy, provider);

    let testaddress = "0x863d962EC30D87D330496A4EE8e565d4EF5d45c2"
    //let balance = await contractErc20Proxy.balanceOf(testaddress);
    //console.log("balance " + balance);
    
    try {
        //let estimateGas = await contractLina.connect(wallet).estimateGas.mint(testaddress, toUnit(10000).toString());
        //console.log("estimateGas", estimateGas.toNumber());
        //let ret = await contractLina.connect(wallet).mint(testaddress, toUnit(10000).toString(), {gasLimit:estimateGas});
        //console.log("mint ret :"+ ret)
    }
    catch(err) {
        console.log("mint err :"+ err)
    }
}

async function setTimePeriod() {
    try {
        let contractStakingStorage = new ethers.Contract("0xe30127628c7c5356E8bF47866e3a8035c73E2aF9", abiLnLinearStakingStorage, provider);

        let ret = await contractStakingStorage.connect(wallet).setStakingPeriod((1600315275).toString(), (1600315275 +2*24*3600).toString());
        console.log("setStakingPeriod ret :"+ ret)
    }
    catch(err) {
        console.log("setStakingPeriod err :"+ err)
    }
}


//increment.then((value) => {
//    console.log(value);
//});

// run only one async func 

mint();
//setTimePeriod();

