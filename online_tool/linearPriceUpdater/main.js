const { abi : IUniswapV2Router02ABI } =  require('@uniswap/v2-periphery/build/IUniswapV2Router02.json');
const ethers = require('ethers');
const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const fs = require('fs');
const path = require('path');

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

const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const LINA_ADDRESS = "0x3E9BC21C9b189C09dF3eF1B824798658d5011937";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const addressLnChainLinkPricesRopsten = "0x508d2c2C3584E6e1e2AdFA0b7c0823846914BfFf";

const UINT = ethers.utils.parseEther("1"); //parseUnits(value, "ether").

// get price and set to ropsten price

let uniswap = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, IUniswapV2Router02ABI, providerMainnet);

function getAbi(tokenname) {
    var abiPath = path.join(__dirname, './', "abis/", tokenname + ".json");
    var fileconten = fs.readFileSync(abiPath)
    var abi = JSON.parse(fileconten).abi;
    return abi;
}
const abiLnChainLink = getAbi("LnChainLinkPrices");

let kLnChainLinkPricesRopsten = new ethers.Contract(addressLnChainLinkPricesRopsten, abiLnChainLink, providerRopsten);

async function getEstimatedUSDforLINA(amount) {
    let path = [];
    path.push( LINA_ADDRESS );
    path.push( USDT_ADDRESS );
    
    let ret = await uniswap.getAmountsOut(amount, path);
    console.log(ret[0].toString(), ret[1].toString());
    return ret
}
//getEstimatedUSDforLINA(UINT);

let lastPriceRopsten = ethers.utils.parseEther("0");
async function Update() {
    try {
        let ret = await getEstimatedUSDforLINA(UINT);//uniswap uint is e6
        let linaPriceInUSDT = ret[1].mul(1e12); // to LnChainLinkPrices unit
        console.log("lina price", ethers.utils.formatEther(linaPriceInUSDT));

        if (lastPriceRopsten.eq(linaPriceInUSDT) == false) {
            lastPriceRopsten = linaPriceInUSDT;
            let estimateGas = await kLnChainLinkPricesRopsten.connect(walletRopsten).estimateGas.updateAll(
                [linaBytes32], [linaPriceInUSDT], Math.floor(Date.now()/1000).toString());
            await kLnChainLinkPricesRopsten.connect(walletRopsten).updateAll(
                [linaBytes32], [linaPriceInUSDT], Math.floor(Date.now()/1000).toString(), { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+100 });
        } else {
            console.log("same");
        }
    } catch(e) {
        console.error("error:", e);
    }
}

setInterval(() => {
    Update();
}, 60000);
