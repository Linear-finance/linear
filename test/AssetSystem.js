
const LnAssetSystem = artifacts.require("LnAssetSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAssetUpgradeable = artifacts.require("LnAssetUpgradeable");
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

            const lina = await LnAssetUpgradeable.new();
            await lina.__LnAssetUpgradeable_init(toBytes32("LINA"), "LINA", "LINA SYMBOL", admin);
            await assets.addAsset( lina.address );

            let count1 = await assets.assetNumber();
            //console.log( count1 );
            assert.equal( count1.valueOf(), 1 );

            const cny = await LnAssetUpgradeable.new();
            await cny.__LnAssetUpgradeable_init(toBytes32("CNY"), "CNY", "CNY SYMBOL", admin);
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

            const lina = await LnAssetUpgradeable.new();
            await lina.__LnAssetUpgradeable_init(toBytes32("LINA"), "LINA", "LINA SYMBOL", admin);
            await assets.addAsset( lina.address );

            let count1 = await assets.assetNumber();
            //console.log( count1 );
            assert.equal( count1.valueOf(), 1 );

            const cny = await LnAssetUpgradeable.new();
            await cny.__LnAssetUpgradeable_init(toBytes32("CNY"), "CNY", "CNY SYMBOL", admin);
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

