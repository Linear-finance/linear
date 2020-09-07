
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://ropsten.infura.io/v3/" + process.env.INFURA_PROJECT_ID;

console.log(privatekey, providerURL)

const provider = new ethers.providers.JsonRpcProvider(providerURL);

const wallet = new ethers.Wallet(privatekey, provider)

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/contracts/" + tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiLina = getAbi("LinearFinance");

const contractLina = new ethers.Contract("0x3285Df5888634400fF8fcE864C1A6f55b2bC3338", abiLina, provider)

async function mint() {
    console.log("contract address " + contractLina.address)
    
    let testaddress = "0x27f12994A218B1649FE185D19aAC00310aB198C5"
    let balance = await contractLina.balanceOf(testaddress);
    console.log("balance " + balance);
    
    try {
        //let ret = await contractLina.connect(wallet).mint(testaddress, "1000000000000000000000");
        //console.log("mint ret :"+ ret)
    }
    catch(err) {
        console.log("mint err :"+ err)
    }
}

async function setTimePeriod() {
    try {
        //let ret = await contractLina.connect(wallet).set_StakingPeriod((1599468705).toString(), (1599468705+24*3600).toString());
        //console.log("set_StakingPeriod ret :"+ ret)
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
setTimePeriod();

