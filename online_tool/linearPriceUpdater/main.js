const { abi : IUniswapV2Router02ABI } =  require('@uniswap/v2-periphery/build/IUniswapV2Router02.json');

const ethers = require('ethers');
const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const fs = require('fs');
const path = require('path');
const util = require('util');
const request = require('request');

const privatekey = process.env.WALLET_PRIVATE_KEY;
let gasPrice = process.env.ETH_GAS_PRICE == null ? 10000000000 : process.env.ETH_GAS_PRICE;

const providerURLmainnet = "https://mainnet.infura.io/v3/" + process.env.INFURA_PROJECT_ID; 
const providerURLropsten = "https://ropsten.infura.io/v3/" + process.env.INFURA_PROJECT_ID;

const providerMainnet = new ethers.providers.JsonRpcProvider(providerURLmainnet);
const providerRopsten = new ethers.providers.JsonRpcProvider(providerURLropsten);

const walletMainnet = new ethers.Wallet(privatekey, providerMainnet);
const walletRopsten = new ethers.Wallet(privatekey, providerRopsten);
console.log(walletMainnet.address, walletRopsten.address);

const linaBytes32 = toBytes32("LINA");
const ethBytes32 = toBytes32("lETH");
const btcBytes32 = toBytes32("lBTC");
const hb10Bytes32 = toBytes32("lHB10");

const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const LINA_ADDRESS = "0x3E9BC21C9b189C09dF3eF1B824798658d5011937";
const ETH_Wrapped = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const BTC_Wrapped = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const huobiURL = "https://api.huobi.pro/market/trade?symbol=hb10usdt";
const getPromise = util.promisify(request.get);

const EACAggregatorProxyBTC2USD = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";

const addressLnChainLinkPricesRopsten = "0x508d2c2C3584E6e1e2AdFA0b7c0823846914BfFf";

const UINT = ethers.utils.parseEther("1"); //parseUnits(value, "ether").

// get price and set to ropsten price

let uniswap = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, IUniswapV2Router02ABI, providerMainnet);

const aggregatorV3InterfaceABI = [{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"description","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint80","name":"_roundId","type":"uint80"}],"name":"getRoundData","outputs":[{"internalType":"uint80","name":"roundId","type":"uint80"},{"internalType":"int256","name":"answer","type":"int256"},{"internalType":"uint256","name":"startedAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint80","name":"answeredInRound","type":"uint80"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"latestRoundData","outputs":[{"internalType":"uint80","name":"roundId","type":"uint80"},{"internalType":"int256","name":"answer","type":"int256"},{"internalType":"uint256","name":"startedAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint80","name":"answeredInRound","type":"uint80"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"version","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
let chainlinkAggregatorProxyBTC2USD = new ethers.Contract(
    EACAggregatorProxyBTC2USD, aggregatorV3InterfaceABI, providerMainnet);

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, './', "abis/", tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}
const abiLnChainLink = getAbi("LnChainLinkPrices");

let kLnChainLinkPricesRopsten = new ethers.Contract(addressLnChainLinkPricesRopsten, abiLnChainLink, providerRopsten);

async function getEstimatedUSD(currencyAddress, amount) {
    let path = [];
    path.push( currencyAddress );
    path.push( USDT_ADDRESS );
    
    let ret = await uniswap.getAmountsOut(amount, path);
    console.log(ret[0].toString(), ret[1].toString());
    return ret;
}

async function getEstimatedHB10USDT() {
    try {
        let response = await getPromise(huobiURL);
        let body = response.body;
        let jsonBody = JSON.parse(body);
        let price = jsonBody.tick.data[0].price;
        let ret = ethers.utils.parseEther(price);
        // console.log("HB10 prices : " , price);
        return ret;
    } catch(e) {
        console.log("Call huobi API fails: " , e);
    }
}
//getEstimatedUSD(LINA_ADDRESS, UINT);

let lastPriceRopsten = ethers.utils.parseEther("0");
async function Update() {
    try {
        let ret = await getEstimatedUSD(LINA_ADDRESS, UINT);//uniswap uint is e6
        let linaPriceInUSDT = ret[1].mul(1e12); // to LnChainLinkPrices unit
        ret = await getEstimatedUSD(ETH_Wrapped, UINT);
        let ethInUSDT = ret[1].mul(1e12);
        let huobiAPIret = await getEstimatedHB10USDT();
        let hb10InUSDT = huobiAPIret;
        //ret = await getEstimatedUSD(BTC_Wrapped, UINT);
        //let btcInUSDT = ret[1].mul(1e12);

        let btc2usd = await chainlinkAggregatorProxyBTC2USD.latestRoundData();
        let btcInUSDT = btc2usd.answer.mul(1e10);

        /*
        if (lastPriceRopsten.eq(linaPriceInUSDT) == false) {
            lastPriceRopsten = linaPriceInUSDT;
            let estimateGas = await kLnChainLinkPricesRopsten.connect(walletRopsten).estimateGas.updateAll(
                [linaBytes32], [linaPriceInUSDT], Math.floor(Date.now()/1000).toString());
            await kLnChainLinkPricesRopsten.connect(walletRopsten).updateAll(
                [linaBytes32], [linaPriceInUSDT], Math.floor(Date.now()/1000).toString(), { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+100 });
        } else {
            console.log("same");
        }*/

        let keys = [linaBytes32, ethBytes32, btcBytes32, hb10Bytes32];
        let prices = [linaPriceInUSDT, ethInUSDT, btcInUSDT,hb10InUSDT];
        let updatetime = Math.floor(Date.now()/1000).toString();
        console.log(updatetime, linaPriceInUSDT.toString(), ethInUSDT.toString(), btcInUSDT.toString(), hb10InUSDT.toString());
        let estimateGas = await kLnChainLinkPricesRopsten.connect(walletRopsten).estimateGas.updateAll(
            keys,
            prices,
            updatetime);
        await kLnChainLinkPricesRopsten.connect(walletRopsten).updateAll(
            keys,
            prices,
            updatetime, { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+100 });

    } catch(e) {
        console.error("error:", e);
    }
}
//for test
async function getPrices(){
    let ret = await kLnChainLinkPricesRopsten.connect(walletRopsten).getPrice(hb10Bytes32);
    console.log(ret);
}

setInterval(() => {
    Update();
    JSON.parse
    // getPrices();
}, 60000);
