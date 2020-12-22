
const LnDefaultPrices = artifacts.require("LnDefaultPrices");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

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


contract('LnDefaultPrices', async (accounts)=> {

    const admin = accounts[0];
    const oracle = accounts[1];

    describe('constructor', () => {
        it('init prices', async ()=> {
            // new instance of LnDefaultPrices
            await LnDefaultPrices.link(SafeDecimalMath);
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );
        });

    }); 
    
    describe('updateAll', () => {
        it('update prices', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
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
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let timeSent = await currentTime();

            // should ignore updates not from oracle
            await assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: admin} ) );
        });
        it('not lusd', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);

            let timeSent = await currentTime();

            await assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("lUSD")], [ 3,4 ], timeSent, { from: oracle} ) );
        });
        it('not 0', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);

            let timeSent = await currentTime();

            await assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,0 ], timeSent, { from: oracle} ) );
        });

        it('get price and update time', async () => {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
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
    //getCurrentRoundId
    describe('Round Id', () => {
        it('first round', async ()=> {
            // new instance of LnDefaultPrices
            let defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let roundLina = await defaultPrices.getCurrentRoundId(toBytes32("LINA") );
            //console.log( roundLina);
            assert.equal( roundLina.valueOf(), 1 );

            let roundLusd = await defaultPrices.getCurrentRoundId(toBytes32("lUSD") );
            //console.log( roundLusd );
            assert.equal( roundLusd.valueOf(), 1 );
        });

        it('add round', async ()=> {
            // new instance of LnDefaultPrices
            let defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let roundLina = await defaultPrices.getCurrentRoundId(toBytes32("LINA") );
            assert.equal( roundLina.valueOf(), 1 );

            let roundLusd = await defaultPrices.getCurrentRoundId(toBytes32("lUSD") );
            assert.equal( roundLusd.valueOf(), 1 );

            // should update all prices normally
            let timeSent = await currentTime();
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle} );
            roundLina = await defaultPrices.getCurrentRoundId(toBytes32("LINA") );
            assert.equal( roundLina.valueOf(), 2 );

            roundLusd = await defaultPrices.getCurrentRoundId(toBytes32("lUSD") );
            assert.equal( roundLusd.valueOf(), 1 );
            
        });


    });
    describe('exchange', () => {
        it('exchange', async ()=> {
            // new instance of LnDefaultPrices
            const sourceAmount = toUnit('100.0');
            let defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY"),toBytes32("USD")], ['1.0', '0.125', '1.0'].map(toUnit));
            let amount = await defaultPrices.exchange(  toBytes32("USD"), sourceAmount, toBytes32("CNY") );  
            //console.log( fromUnit(amount) );
            let destAmount =  toUnit('800.0');
            //console.log( fromUnit(destAmount) );
            assertBNEqual( destAmount, amount );
        });

        it('exchange and price', async ()=> {
            let defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, ["LINA", "CNY", "USD"].map(toBytes32), ['1.0', '0.125', '1.0'].map(toUnit));
            const sourceAmount = toUnit('100.0');
            let result = await defaultPrices.exchangeAndPrices(  toBytes32("USD"), sourceAmount, toBytes32("CNY") );  
            //console.log( fromUnit(amount) );
            let destAmount =  toUnit('800.0');
            //console.log( fromUnit(destAmount) );
            assertBNEqual( destAmount, result.value );
            assertBNEqual( result.sourcePrice, toUnit("1.0"));
            assertBNEqual( result.destPrice, toUnit("0.125"));
        });


    });
    describe('stale', () => {
        it('isStale', async ()=> {
            
            // new instance of LnDefaultPrices
            let defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);

            let timeSent = await currentTime();
            
            // should update all prices normally
            await defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: oracle} );
            
            // is stale
            let isStale = await defaultPrices.isStale(toBytes32("LINA"));
            assert.equal( isStale.valueOf(), false );

            // 
            await defaultPrices.setStalePeriod(1 , { from: admin} );

            // wait for blocks
            let block1 = await web3.eth.getBlockNumber();
            while( true ){
                await new Promise(resolve => setTimeout(resolve, 400));
                let block2 = await web3.eth.getBlockNumber();
                // add new transaction
                // add new transaction in case of test enviroment, add transaction will make ganache generate new block.
                await defaultPrices.setOracle( admin, {from:admin});
                if( block2 - block1 > 2 )
                {
                    break;
                }
            }

            let timeSent2 = await currentTime();
            //console.log(timeSent, timeSent2 );
            assert.notEqual( timeSent2, timeSent );
            isStale = await defaultPrices.isStale(toBytes32("LINA"));
            assert.equal( isStale.valueOf(), true );
        });
    });   

    describe('deletePrice', () => {
        it('deletePrice', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            let linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 1 );

            // delete price
            await defaultPrices.deletePrice( toBytes32("LINA"),{ from:oracle} );    

            // should be 0
            linaPrice = await defaultPrices.getPrice( toBytes32("LINA") );    
            assert.equal( linaPrice.valueOf(), 0 );

            // only oracle
            await assertRevert( defaultPrices.deletePrice( toBytes32("CNY"),{ from:admin} ) );
            let cnyPrice = await defaultPrices.getPrice( toBytes32("CNY") );    
            assert.equal( cnyPrice.valueOf(), 2 );
        });

    });

    describe('setOracle', () => {
        it('setOracle', async ()=> {
            // new instance of LnDefaultPrices
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);

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
            const defaultPrices = await LnDefaultPrices.new();
            await defaultPrices.__LnDefaultPrices_init(admin, oracle, [toBytes32("LINA"), toBytes32("CNY")], [1, 2]);
            // should revert, wrong admin
            await assertRevert( defaultPrices.setOracle( admin, {from:oracle}) );

            // shuld revert, wrong oracle
            let timeSent = await currentTime();
            await assertRevert( defaultPrices.updateAll( [toBytes32("LINA"), toBytes32("CNY")], [ 3,4 ], timeSent, { from: admin } ) );
        });


    });


});

