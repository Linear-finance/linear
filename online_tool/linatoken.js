
const ethers = require('ethers')
const fs = require('fs');
const path = require('path');
const assert = require('assert')
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const {getDeployedByName} = require("../utility/truffle-tool");
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

let gasPrice = process.env.ETH_GAS_PRICE == null ? 10000000000 : process.env.ETH_GAS_PRICE;
let network = process.env.NETWORK;
const privatekey = process.env.WALLET_PRIVATE_KEY;
let providerURL = "https://"+network+".infura.io/v3/" + process.env.INFURA_PROJECT_ID;

const provider = new ethers.providers.JsonRpcProvider(providerURL);

//const provider = ethers.getDefaultProvider(network, {etherscan: });

const wallet = new ethers.Wallet(privatekey, provider);
console.log("\n* wallet address:", wallet.address);
console.log("network", network);

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, '../', "build/"+network+"/" + tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath);
    
    var abi = JSON.parse(fileconten).abi;
    return abi;
}

var abiLina = getAbi("LinearFinance");
var abiProxy = getAbi("LnProxyERC20");
var abiLnLinearStaking = getAbi("LnLinearStaking");
var abiLnLinearStakingStorage = getAbi("LnLinearStakingStorage");
var abiLnSimpleStaking = getAbi("LnSimpleStaking"); 

async function mint() {
    const contractLina = new ethers.Contract("0x811D779Ab23446C508b20f46246EC9C88fC018Ae", abiLina, provider);
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
        let estimateGas = await contractStakingStorage.connect(wallet).estimateGas.setStakingPeriod( (1600329600).toString(), (1605168000).toString() );
        console.log("estimateGas", estimateGas.toString());
        let ret = await contractStakingStorage.connect(wallet).setStakingPeriod( (1600329600).toString(), (1605168000).toString(), {gasPrice:gasPrice, gasLimit:estimateGas});
        console.log("setStakingPeriod ret :")
        console.log(ret);
    }
    catch(err) {
        console.log("setStakingPeriod exception :");
        console.log(err);
        //let utf8decoder = new TextDecoder();
        //console.log(utf8decoder.decode(err.body));
    }
}

async function getPoolInfo() {
    let contract = new ethers.Contract("0x21e7A26b1eF76845DEa8b93b23501c54f1c6BBd4", abiLnSimpleStaking, provider);
    let v = await contract.amount();
    console.log("pool",v.toString());
    v = await contract.stakingBalanceOf("0x27f12994A218B1649FE185D19aAC00310aB198C5");
    console.log("balance",v.toString());
    v = await contract.rewardPerBlock();
    console.log("rewardPerBlock", v.toString());
    v = await contract.mEndBlock();
    console.log("mEndBlock", v.toString());
}

async function getTotalReward(blocknumber) {
    try {
        let contract = new ethers.Contract("0x21e7A26b1eF76845DEa8b93b23501c54f1c6BBd4", abiLnSimpleStaking, provider);
        let ret = await contract.getTotalReward(blocknumber, "0x27f12994A218B1649FE185D19aAC00310aB198C5");
        console.log(blocknumber, ret.toString());
    } catch(err) {
        console.log("exception :");
        console.log(err);
    }
}

async function getLiquidsInUsd(adddress) {
    let assetSysAddress = getDeployedByName("LnAssetSystem");
    let assetSystem = new ethers.Contract(assetSysAddress, getAbi("LnAssetSystem"), provider);
    
    let assetAddress = await assetSystem.getAssetAddresses();
    console.log(assetAddress);
    let total = toBN(0); // BigNumber
    for(let i=0; i<assetAddress.lenght; i++) {
        let asset = new ethers.Contract(assetAddress[i], getAbi("LnAsset"), provider);
        let balance = await asset.balanceOf(adddress);
        total = total == null ? balance : total.add(balance);
    }
    console.log("getLiquidsInUsd", adddress, total.toString());
    return total;
}

async function collaLina() {
    let collaAddress = getDeployedByName("LnCollateralSystem");
    let collaSystem = new ethers.Contract(collaAddress, getAbi("LnCollateralSystem"), provider);
    
    let linaProxyAddress = getDeployedByName("LnProxyERC20");
    let linaProxy = new ethers.Contract(linaProxyAddress, getAbi("LnProxyERC20"), provider);
    try {
        const amount = ethers.utils.parseEther("10.0");        ;
        let allowance = await linaProxy.allowance(wallet.address, collaAddress);
        console.log(allowance, amount, allowance.gte(amount));
        if (allowance.gte(amount) == false) {
            console.log("approve");
            let estimateGas = await linaProxy.connect(wallet).estimateGas.approve(collaAddress, amount);
            await linaProxy.connect(wallet).approve(collaAddress, amount, {gasLimit:estimateGas});    
        }
        
        console.log("Collateral start");
        const linaBytes32 = toBytes32("LINA");
        let estimateGas = await collaSystem.connect(wallet).estimateGas.Collateral(linaBytes32, amount);
        console.log("estimateGas",estimateGas);
        await collaSystem.connect(wallet).Collateral(linaBytes32, amount, {gasLimit:estimateGas});
    } catch(e) {
        console.log(e);
    }
}

async function revertWallet() {
    let tx = await wallet.sendTransaction({to:wallet.address, value:ethers.utils.parseEther("0.0")});
    console.log(tx);
}

async function calcDebt() {
    let debtAddress = getDeployedByName("LnDebtSystem");
    let debtSystem = new ethers.Contract(debtAddress, getAbi("LnDebtSystem"), provider);

    let xiaoqiang = "0xaaa2288d854Bc83ceB289ce3522443DC3A897084";
    let lastfactor = await debtSystem.LastSystemDebtFactor();
    let userCurDP = await debtSystem.GetUserCurrentDebtProportion(xiaoqiang);
    let debtstate = await debtSystem.userDebtState(xiaoqiang);
    let debtProportion = debtstate.debtProportion;
    let debtFactor = debtstate.debtFactor;
    console.log("LastSystemDebtFactor", lastfactor.toString());
    console.log("debtProportion", debtProportion.toString());
    console.log("debtFactor", debtFactor.toString());
    console.log("GetUserCurrentDebtProportion", userCurDP.toString());
    
    let calcv = lastfactor.div(debtFactor).mul(debtProportion);
    console.log("calcv", calcv.toString());
    let PUNIT =  ethers.utils.parseEther("1000000000"); 
    calcv = lastfactor.mul(PUNIT).div(debtFactor).mul(debtProportion).div(PUNIT);
    console.log("calcv2", calcv.toString());

    let ret = await debtSystem.GetUserDebtBalanceInUsd(xiaoqiang);
    let userDebtBalance = ret[0];
    let totalAssetSupplyInUsd = ret[1];
    console.log("userDebtBalance", userDebtBalance.toString());
    console.log("totalAssetSupplyInUsd", totalAssetSupplyInUsd.toString());

    let HALF = ethers.utils.parseEther("0.000000001")
    let calcdebtb = totalAssetSupplyInUsd.mul(HALF).mul(calcv).div(PUNIT).div(HALF);
    console.log("calcdebtb", calcdebtb.toString());
}

/**
LastSystemDebtFactor 5345809166518357898827
debtProportion 38506296160749946285504369
debtFactor 1315922156035616935069575
GetUserCurrentDebtProportion 156428182351567779699794
calcv 0
calcv2 156428182351567779699794
userDebtBalance 5559748528426227510
totalAssetSupplyInUsd 35541859816096659411749
calcdebtb 5559748528426227509
*/

//increment.then((value) => {
//    console.log(value);
//});


//getLiquidsInUsd("0x81de13D9749cEb529638353bD5086D6CBb942fDd");
//collaLina();
//revertWallet();

calcDebt();
