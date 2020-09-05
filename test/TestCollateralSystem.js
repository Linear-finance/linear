const LnCollateralSystem = artifacts.require("LnCollateralSystem");
const LinearFinance = artifacts.require("LinearFinance");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const {InitComment, newAssetToken, CreateLina} = require ("./common.js");

contract('test LnCollateralSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[1];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('#collateral', async ()=> {
        
        let InitContracts = await InitComment(ac0);
        //console.log("InitContracts", InitContracts);

        const lina = await CreateLina(ac0);

        let kLnCollateralSystem = InitContracts.kLnCollateralSystem;

        const linaBytes32 = toBytes32("lina");

        await kLnCollateralSystem.UpdateTokenInfo( linaBytes32, lina.address, (1e18).toString(), false);

        //let tokeninfo = await kLnCollateralSystem.tokenInfos( linaBytes32 );
        //console.log("tokeninfo", tokeninfo);

        let v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 0);

        // mint lina
        lina.mint(ac1, (1000e18).toLocaleString('fullwide',{useGrouping:false}) ); // ac1 mint lina

        // fail test
        let exception = "";
        try {
            await kLnCollateralSystem.AddCollateral( toBytes32("notExist"), (10e18).toLocaleString('fullwide',{useGrouping:false}) );
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "Invalid token symbol"); exception = "";
        try  {
            await kLnCollateralSystem.AddCollateral( linaBytes32, (1e17).toLocaleString('fullwide',{useGrouping:false}));
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "Collateral amount too small"); exception = "";
        try { // collateral more than balance and approve balance
            await kLnCollateralSystem.AddCollateral( linaBytes32, (1001e18).toLocaleString('fullwide',{useGrouping:false}), {from:ac1});
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "SafeMath: subtraction overflow"); exception = "";

        // before 
        await lina.approve(kLnCollateralSystem.address, (1000e18).toLocaleString('fullwide',{useGrouping:false}), {from:ac1});
        await kLnCollateralSystem.AddCollateral( linaBytes32, (1000e18).toLocaleString('fullwide',{useGrouping:false}), {from:ac1});
        
        // setup price, chainlink price is price*10e8
        await InitContracts.kLnChainLinkPrices.updateAll([linaBytes32], [1], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 1000e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 1000e18);

        // setup price
        await InitContracts.kLnChainLinkPrices.updateAll([linaBytes32], [2], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 1000e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 2*1000e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 2*1000e18);

        // debt is 0
        try  {
        //    v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1); // TODO :
        //    assert.equal(v.valueOf(), 2*1000e18);
        } catch (e) { console.log(e); }

    });

    // describe('#redeem', function () {
    //     it('responds with matching records', async function () {
            
    //     });
    // });
});

