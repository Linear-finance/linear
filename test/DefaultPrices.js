
const LnDefaultPrices = artifacts.require("LnDefaultPrices");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

const w3utils = require('web3-utils');
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

contract('LnDefaultPrices', async (accounts)=> {

    const admin = accounts[0];
    const oracle = accounts[1];

    describe('constructor', () => {
        it('init prices', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );

        });
    }); 
    
    describe('updateAll', () => {
        it('update prices', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );

            let timeSent = await currentTime();

            // should update all prices normally
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle} );
            linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 3 );

            cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 4 );

            // should ignore updates from error timing
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 5,6 ], timeSent-1, { from: oracle} );
            linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 3 );

            cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 4 );
        });

        it('only oracle', async () => {
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );
            let timeSent = await currentTime();

            // should ignore updates not from oracle
            assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: admin} ) );
        });
        
        it('get price and update time', async () => {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );
            let linaPrice = await defaultPrices.getPriceAndUpdatedTime( toBytes32("LINA") );    
            assert.equal( linaPrice.price, 1 );

            let cnyPrice = await defaultPrices.getPriceAndUpdatedTime( toBytes32("CNY") );    
            assert.equal( cnyPrice.price, 2 );

            let timeSent = await currentTime();

            // should update all prices normally
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle} );
            linaPrice = await defaultPrices.getPriceAndUpdatedTime( toBytes32("LINA") );    
            assert.equal( linaPrice.price, 3 );
            assert.equal( linaPrice.time, timeSent );

            cnyPrice = await defaultPrices.getPriceAndUpdatedTime( toBytes32("CNY") );    
            assert.equal( cnyPrice.price, 4 );
            assert.equal( cnyPrice.time, timeSent );

        });
    });    

    describe('deletePrice', () => {
        it('deletePrice', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            // delete price
            await defaultPrices.deletePrice( toBytes32("LINA"),{ from:oracle} );    

            // should be 0
            linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 0 );

            // only oracle
            assertRevert( defaultPrices.deletePrice( toBytes32("CNY"),{ from:admin} ) );
            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );
        });

    });

    describe('setOracle', () => {
        it('setOracle', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );

            let timeSent = await currentTime();
            
            // set oracle
            await defaultPrices.setOracle( admin, {from:admin});

            // should update all prices normally
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: admin} );
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 3 );

            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 4 );

        });
        it('only admin', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );

            // should revert, wrong admin
            assertRevert( defaultPrices.setOracle( admin, {from:oracle}) );

            // shuld revert, wrong oracle
            let timeSent = await currentTime();
            assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle } ) );
        });


    });

    describe('stale', () => {
        it('setStalePeriod', async ()=> {
            
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new( admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [ 1,2 ] );

            // let timeSent = await currentTime();
            
            // // should update all prices normally
            // await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle} );
            
            // // is stale
            // let isStale = await defaultPrices.isStale(toBytes32("LINA"));
            // assert.equal( isStale.valueOf(), false );

            // // 
            // await defaultPrices.setStalePeriod(1 , { from: admin} );

            // isStale = await defaultPrices.isStale(toBytes32("LINA"));
            // assert.equal( isStale.valueOf(), true );
        });
    });   

});

