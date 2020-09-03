
const LnAssetSystem = artifacts.require("LnAssetSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAsset = artifacts.require("LnAsset");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnExchangeSystem = artifacts.require("LnExchangeSystem");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const TestOracle = artifacts.require("TestOracle");

const w3utils = require('web3-utils');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const assertBNEqual = (actualBN, expectedBN, context) => {
    assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
};

const convertToOraclePrice = (val) => {
    return web3.utils.toBN(Math.round(val * 1e8));
}

const currentTime = async () => {
    const { timestamp } = await web3.eth.getBlock('latest');
    return timestamp;
};

contract('LnExchangeSystem', async (accounts)=> {

    const admin = accounts[0];
    const op = accounts[1];
    const trader = accounts[2];


    describe('exchange', () => {

        it('exchange protottype', async ()=> {
            // add assets
            const assets = await LnAssetSystem.new( admin );
    
            const BtcData = await LnTokenStorage.new( admin, op );
            const BtcProxy = await LnProxyERC20.new( admin );
            const Btc = await LnAsset.new( toBytes32("BTC"), BtcProxy.address, BtcData.address, "BTC", "BTC SYMBOL", 0, 18, admin, assets.address );
            await BtcProxy.setTarget( Btc.address );    
            await BtcData.setOperator( Btc.address );
 
            await assets.addAsset( Btc.address );

            const cnyData = await LnTokenStorage.new( admin, op );
            const cnyProxy = await LnProxyERC20.new( admin );
            const cny = await LnAsset.new( toBytes32("CNY"), cnyProxy.address, cnyData.address, "CNY", "CNY SYMBOL", 0, 18, admin, assets.address );
            await cnyProxy.setTarget( cny.address );    
            await cnyData.setOperator( cny.address );

            await assets.addAsset( cny.address );
            
    
            // set prices 
            const clPrices = await LnChainLinkPrices.new( admin, op, ["BTC","CNY"].map(toBytes32), [ 10000, 0.125 ].map( toUnit) );
            let timeSent = await currentTime();

            const BTCOracle = await TestOracle.new();
            await BTCOracle.setLatestAnswer(  convertToOraclePrice("10000"), timeSent );
            await clPrices.addOracle( toBytes32("BTC"), BTCOracle.address );

            const CnyOracle = await TestOracle.new();
            await CnyOracle.setLatestAnswer(  convertToOraclePrice("0.125"), timeSent );
            await clPrices.addOracle( toBytes32("CNY"), CnyOracle.address );

            //access control
            const accessCtrl = await LnAccessControl.new();

            await assets.updateAll(["LnAssetSystem","LnPrices","LnAccessControl"].map(toBytes32),[ assets.address, clPrices.address, accessCtrl.address]);

            const exchangeSys = await LnExchangeSystem.new( admin, assets.address );

            await accessCtrl.SetBurnAssetRole( [admin, exchangeSys.address], [true,true]);
            await accessCtrl.SetIssueAssetRole( [admin, exchangeSys.address], [true,true]);

            // build
            await Btc.mint( trader, toUnit(10) );
            await cny.mint( trader, toUnit(10) );
            await Btc.burn( trader, toUnit(1));
            await cny.burn( trader, toUnit(1));

            // exchange 
            let txExchange = await exchangeSys.exchange( toBytes32("BTC"), toUnit(1), trader, toBytes32("CNY"), {from:trader});
            let cnyAmount = await cnyProxy.balanceOf( trader );
            let btcAmount = await BtcProxy.balanceOf( trader );
            assertBNEqual( cnyAmount, toUnit(80009));   // 80000+9 
            assertBNEqual( btcAmount, toUnit(8));    
        });

    }); 


});

