
const LnAssetSystem = artifacts.require("LnAssetSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAsset = artifacts.require("LnAsset");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnProxyERC20 = artifacts.require("LnProxyERC20");


const w3utils = require('web3-utils');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);


contract('LnAssetSystem', async (accounts)=> {

    const admin = accounts[0];
    const op = accounts[1];

    describe('constructor', () => {
        it('constructor', async ()=> {
            const assets = await LnAssetSystem.new( admin );
        });

    }); 
    describe('add assets', () => {
        it('add assets', async ()=> {
            const assets = await LnAssetSystem.new( admin );
            const linaData = await LnTokenStorage.new( admin, op );
            const linaProxy = await LnProxyERC20.new( admin );
            const lina = await LnAsset.new( toBytes32("LINA"), linaProxy.address, linaData.address, "LINA", "LINA SYMBOL", 0, 10, admin );
            assets.addAsset( lina );
        });

    }); 
    




});

