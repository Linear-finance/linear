
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const {MyJsonRpcProvider} = require("./MyJsonRpcProvider.js");

const privatekey = process.env.WALLET_PRIVATE_KEY;
const providerURL = "https://"+process.env.NETWORK+".infura.io/v3/" + process.env.INFURA_PROJECT_ID;

//const provider = new ethers.providers.JsonRpcProvider(providerURL);
const provider = new MyJsonRpcProvider(providerURL);
provider.pollingInterval = 15000;
provider.polling = false;

const wallet = new ethers.Wallet(privatekey, provider)

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/"+process.env.NETWORK+"/" + tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath);
    
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiLnLinearStaking = getAbi("LnLinearStaking");

const kLnLinearStaking = new ethers.Contract("0x410903Bff34f4d7DC510FbFd15E5Ba68C7218130", abiLnLinearStaking, provider);

let writeTo = "stakingBlock.log";

async function get_staking_logs() {
  try {
    kLnLinearStaking.on(
        "Staking", (who, value, staketime, event) => {
            let msg = '["Staking", "' + who.toString() + '", "' + value.toString() + '", "' + staketime.toString() + '", ' + event.blockNumber + '],\n';
            console.log(msg);
            const data = new Uint8Array(Buffer.from(msg));
            fs.appendFileSync(writeTo, data);
        }
    );
    kLnLinearStaking.on(
        "CancelStaking", (who, value, event) => {
            let msg = '["CancelStaking", "' + who.toString() + '", "' + value.toString() + '", ' + event.blockNumber + '],\n';
            console.log(msg);
            const data = new Uint8Array(Buffer.from(msg));
            fs.appendFileSync(writeTo, data);
        }
    );
    provider.polling = true; //open
    provider.resetEventsBlock(10877427);
  } catch (err) {
    console.log("err :"+ err)
  }
}

get_staking_logs();

setInterval(() => {
    //console.log('Infinite Loop Test interval n:', i++);
}, 10000)
