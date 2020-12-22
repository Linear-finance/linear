
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const TestOracle = artifacts.require("TestOracle");

const w3utils = require('web3-utils');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const currentTime = async () => {
    const { timestamp } = await web3.eth.getBlock('latest');
    return timestamp;
};



const assertRevert = async (blockOrPromise, reason) => {
    let errorCaught = false;
    try {
        const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
        await result;
    } catch (error) {
        assert.include(error.message, 'revert');
        if (reason) {
            assert.include(error.message, reason);
        }
        errorCaught = true;
    }

    assert.strictEqual(errorCaught, true, 'Operation did not revert as expected');
};


const assertBNEqual = (actualBN, expectedBN, context) => {
    assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
};


const convertToOraclePrice = (val) => {
    return web3.utils.toBN(Math.round(val * 1e8));
}


contract('LnChainLinkPrices', async (accounts)=> {

    const admin = accounts[0];
    const oracle = accounts[1];

    describe('constructor', () => {
        it('init prices', async ()=> {
            // new instance of LnclPrices
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let linaPrice = await clPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            let cnyPrice = await clPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );
        });

    }); 
    

    describe('AddOracle', () => {
        it('add Oracle', async ()=> {
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let timeSent = await currentTime();

            const LinaOracle = await TestOracle.new();
            await LinaOracle.setLatestAnswer(  convertToOraclePrice("123"), timeSent );
            await clPrices.addOracle( toBytes32("LINA"), LinaOracle.address );

            let linaPrice = await clPrices.getPrice( toBytes32("LINA") );    
            assertBNEqual( (linaPrice), toUnit("123"));
            let cnyPrice = await clPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );
        });

        it('add 2 Oracle', async ()=> {
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let timeSent = await currentTime();

            const LinaOracle = await TestOracle.new();
            await LinaOracle.setLatestAnswer(  convertToOraclePrice("123"), timeSent );
            await clPrices.addOracle( toBytes32("LINA"), LinaOracle.address );

            const LinaOracle2 = await TestOracle.new();
            await LinaOracle2.setLatestAnswer(  convertToOraclePrice("345"), timeSent );
            await clPrices.addOracle( toBytes32("LINA"), LinaOracle2.address );

            const UsdOracle = await TestOracle.new();
            await UsdOracle.setLatestAnswer(  convertToOraclePrice("567"), timeSent );
            await clPrices.addOracle( toBytes32("USD"), UsdOracle.address );

            let linaPrice = await clPrices.getPrice( toBytes32("LINA") );    
            assertBNEqual( (linaPrice), toUnit("345"));

            let usdPrice = await clPrices.getPrice( toBytes32("USD") );    
            assertBNEqual( (usdPrice), toUnit("567"));
        });

    }); 

    describe('RemoveOracle', () => {
        it('remove Oracle, use default', async ()=> {
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY"), toBytes32("USD")], [1, 2, 111].map(toUnit));
            let timeSent = await currentTime();

            const LinaOracle = await TestOracle.new();
            await LinaOracle.setLatestAnswer(  convertToOraclePrice("123"), timeSent );
            await clPrices.addOracle( toBytes32("LINA"), LinaOracle.address );

            const UsdOracle = await TestOracle.new();
            await UsdOracle.setLatestAnswer(  convertToOraclePrice("567"), timeSent );
            await clPrices.addOracle( toBytes32("USD"), UsdOracle.address );

            let linaPrice = await clPrices.getPrice( toBytes32("LINA") );    
            assertBNEqual( (linaPrice), toUnit("123"));

            let usdPrice = await clPrices.getPrice( toBytes32("USD") );    
            assertBNEqual( (usdPrice), toUnit("567"));

            await clPrices.removeOracle( toBytes32("LINA"));

            let linaPrice2 = await clPrices.getPrice( toBytes32("LINA") );    
            assertBNEqual( linaPrice2, toUnit("1"));

            await clPrices.removeOracle( toBytes32("USD"));
            let usdPrice2 = await clPrices.getPrice( toBytes32("USD") );    
            assertBNEqual( (usdPrice2), toUnit("111"));
        });

        it('remove Oracle, no default', async ()=> {
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2].map(toUnit));
            let timeSent = await currentTime();

            const LinaOracle = await TestOracle.new();
            await LinaOracle.setLatestAnswer(  convertToOraclePrice("123"), timeSent );
            await clPrices.addOracle( toBytes32("XLINA"), LinaOracle.address );

            const UsdOracle = await TestOracle.new();
            await UsdOracle.setLatestAnswer(  convertToOraclePrice("567"), timeSent );
            await clPrices.addOracle( toBytes32("USD"), UsdOracle.address );

            let linaPrice = await clPrices.getPrice( toBytes32("XLINA") );    
            assertBNEqual( (linaPrice), toUnit("123"));

            let usdPrice = await clPrices.getPrice( toBytes32("USD") );    
            assertBNEqual( (usdPrice), toUnit("567"));

            await clPrices.removeOracle( toBytes32("XLINA"));
            let linaPrice2 = await clPrices.getPrice( toBytes32("XLINA") );    
            assertBNEqual( linaPrice2, toUnit("0"));

            await clPrices.removeOracle( toBytes32("USD"));
            let usdPrice2 = await clPrices.getPrice( toBytes32("USD") );    
            assertBNEqual( (usdPrice2), toUnit("0"));

        });

    }); 


});

