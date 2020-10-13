
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
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

var abilocker = getAbi("LnTokenLocker");

const contractLocker = new ethers.Contract("0x31B62Dd1701B2b93f27F1aB7B37117fF43073f17", abilocker, provider);
let testaddress = "0x64e2412A4A5910f54aeb2b204e211594A180b12D"

async function locktoken() {
    console.log("contract address " + contractLocker.address);
    console.log("wallet address", wallet.address);
    
    try {
        let estimateGas = await contractLocker.connect(wallet).estimateGas.sendLockToken(testaddress, toUnit(5500).toString(), "360");
        //var options = { gasPrice: 1000000000, gasLimit: 85000, nonce: 45, value: 0 }
        console.log("estimateGas", estimateGas.toNumber());

        var options = { gasLimit: estimateGas.toNumber()+100 };
        let ret = await contractLocker.connect(wallet).sendLockToken(testaddress, toUnit(5500).toString(), "360", options);
        console.log("mint ret :", ret)
    }
    catch(err) {
        console.log("mint err :", err)
    }
}

async function getdata() {
    let data = await contractLocker.lockData(testaddress);
    console.log("data", data);
}

async function collateralSys() {
    let zhao = "0x27f12994A218B1649FE185D19aAC00310aB198C5";

    let cs = newContract("LnCollateralSystem");
    let db = newContract("LnDebtSystem");
    let fp = newContract("LnFeeSystem");

    let oldbbSys = newContract("LnBuildBurnSystem", "0xdf20db37f4422fc5920a5299d86ce76108639442");
    try {
        /*
        let b = await db.GetUserDebtBalanceInUsd(zhao);
        console.log("b", b.toString());//
        let v = await cs.GetUserTotalCollateralInUsd(zhao);
        console.log("v", v.toString());
        //await cs.IsSatisfyTargetRatio(zhao);
        v = await fp.feesAvailable(zhao);
        console.log(v[0].toString(), v[1].toString());
        */
        let v = await oldbbSys.MaxCanBuildAsset("0x71ceb4e97f21eff999e7943d0e2e296971ac793a");
        console.log("max can", v.toString());
    }
    catch(err) {
        console.log("exception :", err)
    }
}

//locktoken();
//getdata();
collateralSys();
