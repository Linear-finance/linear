
const LnAssetSystem = artifacts.require("LnAssetSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAssetUpgradeable = artifacts.require("LnAssetUpgradeable");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnExchangeSystem = artifacts.require("LnExchangeSystem");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const TestOracle = artifacts.require("TestOracle");
const LnConfig = artifacts.require("LnConfig");
const LnFeeSystem = artifacts.require("LnFeeSystem");


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
    const { timestamp } = await web3.eth.getBlock('latest', false, (a,b,c)=>{});
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

            const Btc = await LnAssetUpgradeable.new();
            await Btc.__LnAssetUpgradeable_init(toBytes32("BTC"), "BTC", "BTC SYMBOL", admin);
    
            await assets.addAsset( Btc.address );

            const cny = await LnAssetUpgradeable.new();
            await cny.__LnAssetUpgradeable_init(toBytes32("CNY"), "CNY", "CNY SYMBOL", admin);

            await assets.addAsset( cny.address );

            const lusd = await LnAssetUpgradeable.new();
            await lusd.__LnAssetUpgradeable_init(toBytes32("lUSD"), "lUSD", "LUSD SYMBOL", admin);

            await assets.addAsset( lusd.address );

    
            // set prices 
            const clPrices = await LnChainLinkPrices.new();
            await clPrices.__LnDefaultPrices_init(admin, op, ["BTC", "CNY"].map(toBytes32), [10000, 0.125].map(toUnit));
            let timeSent = await currentTime();

            const BTCOracle = await TestOracle.new();
            await BTCOracle.setLatestAnswer(  convertToOraclePrice("10000"), timeSent );
            await clPrices.addOracle( toBytes32("BTC"), BTCOracle.address );

            const CnyOracle = await TestOracle.new();
            await CnyOracle.setLatestAnswer(  convertToOraclePrice("0.125"), timeSent );
            await clPrices.addOracle( toBytes32("CNY"), CnyOracle.address );

            // config 
            const config = await LnConfig.new( admin );
            await config.batchSet( ["BTC","CNY"].map(toBytes32), [0.01, 0.01].map(toUnit));

            
            //access control
            const accessCtrl = await LnAccessControl.new(admin);

            // fee system
            const feeSys = await LnFeeSystem.new();
            await feeSys.__LnFeeSystem_init(admin);

            await assets.updateAll(["LnAssetSystem","LnPrices","LnAccessControl","LnConfig","LnFeeSystem"].map(toBytes32),
                [ assets.address, clPrices.address, accessCtrl.address, config.address, feeSys.address ]);

            await LnExchangeSystem.link(SafeDecimalMath);
            const exchangeSys = await LnExchangeSystem.new( admin );

            let distributeAddres = admin;
            await feeSys.Init(exchangeSys.address, distributeAddres);

            await accessCtrl.SetBurnAssetRole( [admin, exchangeSys.address], [true,true]);
            await accessCtrl.SetIssueAssetRole( [admin, exchangeSys.address], [true,true]);

            await Btc.updateAddressCache(assets.address);
            await cny.updateAddressCache(assets.address);
            await lusd.updateAddressCache(assets.address);
            await exchangeSys.updateAddressCache(assets.address);

            // build
            await Btc.mint( trader, toUnit(10) );
            await cny.mint( trader, toUnit(10) );
            await Btc.burn( trader, toUnit(1));
            await cny.burn( trader, toUnit(1));

            // exchange 
            let txExchange = await exchangeSys.exchange( toBytes32("BTC"), toUnit(1), trader, toBytes32("CNY"), {from:trader});
            let cnyAmount = await cny.balanceOf( trader );
            let btcAmount = await Btc.balanceOf( trader );
            assertBNEqual( cnyAmount, toUnit(79209));   // 80000+9 -800(手续费)
            assertBNEqual( btcAmount, toUnit(8));    
        });

    }); 


});

