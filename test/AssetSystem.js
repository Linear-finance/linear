
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
            let count0 = await assets.assetNumber();
            assert.equal( count0.valueOf(), 0 );
            //console.log( count0 );

            const linaData = await LnTokenStorage.new( admin, op );
            const linaProxy = await LnProxyERC20.new( admin );
            const lina = await LnAsset.new( toBytes32("LINA"), linaProxy.address, linaData.address, "LINA", "LINA SYMBOL", 0, 10, admin );
            await assets.addAsset( lina.address );

            let count1 = await assets.assetNumber();
            //console.log( count1 );
            assert.equal( count1.valueOf(), 1 );

            const cnyData = await LnTokenStorage.new( admin, op );
            const cnyProxy = await LnProxyERC20.new( admin );
            const cny = await LnAsset.new( toBytes32("CNY"), cnyProxy.address, cnyData.address, "CNY", "CNY SYMBOL", 0, 10, admin );
            await assets.addAsset( cny.address );
            
            let count2 = await assets.assetNumber();
            //console.log( count2 );
            assert.equal( count2, 2 );
        });

    }); 
    
    describe('remove assets', () => {
        it('remove assets', async ()=> {
            const assets = await LnAssetSystem.new( admin );
            let count0 = await assets.assetNumber();
            assert.equal( count0.valueOf(), 0 );
            //console.log( count0 );

            const linaData = await LnTokenStorage.new( admin, op );
            const linaProxy = await LnProxyERC20.new( admin );
            const lina = await LnAsset.new( toBytes32("LINA"), linaProxy.address, linaData.address, "LINA", "LINA SYMBOL", 0, 10, admin );
            await assets.addAsset( lina.address );

            let count1 = await assets.assetNumber();
            //console.log( count1 );
            assert.equal( count1.valueOf(), 1 );

            const cnyData = await LnTokenStorage.new( admin, op );
            const cnyProxy = await LnProxyERC20.new( admin );
            const cny = await LnAsset.new( toBytes32("CNY"), cnyProxy.address, cnyData.address, "CNY", "CNY SYMBOL", 0, 10, admin );
            await assets.addAsset( cny.address );
            
            let count2 = await assets.assetNumber();
            //console.log( count2 );
            assert.equal( count2, 2 );

            await assets.removeAsset( toBytes32("CNY") );
            count = await assets.assetNumber();
            assert.equal( count, 1 );
        });

    }); 




});

