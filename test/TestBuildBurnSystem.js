const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
//const toETHUnit = amount => ethers.utils.parseEther(amount.toString());

const {InitComment, newAssetToken, CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const PRECISE_UNIT = toUnit(1e9); // 1e27

let kLnBuildBurnSystem
let kLnDebtSystem
let kLnCollateralSystem
let kLnChainLinkPrices
let lUSD

async function checkPropDebtTotalRedeemLusd(_account, _proportion, _debtbalance, _totalAssetSupplyInUsd, _redeemable, _lusdBalance, _msg) {
    let v = await kLnDebtSystem.GetUserCurrentDebtProportion(_account);
    assert.equal(v, _proportion.toString(), _msg);

    let ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(_account);
    let debtbalance = ret[0];
    let totalAssetSupplyInUsd = ret[1];
    let redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(_account);
    assert.equal(debtbalance, _debtbalance.toString(), _msg);
    assert.equal(totalAssetSupplyInUsd, _totalAssetSupplyInUsd.toString(), _msg);
    assert.equal(redeemable,_redeemable.toString(), _msg);

    v = await lUSD.balanceOf(_account);
    assert.equal(v, _lusdBalance.toString(), _msg);
}

contract('test LnBuildBurnSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('BuildBurn test', async ()=> {
        const linaBytes32 = toBytes32("lina");
        const ETHBytes32 = toBytes32("ETH");
        const lusdBytes32 = toBytes32("lUSD");

        let InitContracts = await InitComment(ac0);

        kLnBuildBurnSystem = InitContracts.kLnBuildBurnSystem;
        kLnDebtSystem = InitContracts.kLnDebtSystem;
        kLnCollateralSystem = InitContracts.kLnCollateralSystem;
        kLnChainLinkPrices = InitContracts.kLnChainLinkPrices;
        lUSD = InitContracts.lUSD;

        const [lina,linaproxy] = await CreateLina(ac0);

        await kLnCollateralSystem.UpdateTokenInfo( linaBytes32, lina.address, toUnit(1), false);
        
        await exceptionEqual( 
            kLnBuildBurnSystem.BuildAsset( toUnit(10), {from:ac1} ), 
            "Build amount too big, you need more collateral");
        
        // set price
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32, lusdBytes32], [toUnit(1), toUnit(200), toUnit(1)], Math.floor(Date.now()/1000).toString() );
    
        // mint lina
        lina.mint(ac1, toUnit(1000) ); // ac1 mint lina
        lina.mint(ac2, toUnit(1000) );
        
        // ac1 collateral
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac1});
        await kLnCollateralSystem.Collateral( linaBytes32, toUnit(1000), {from:ac1});

        //BN compare: a.cmp(b) - compare numbers and return -1 (a < b), 0 (a == b), or 1 (a > b) depending on the comparison result (ucmp, cmpn)
        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v, toUnit(1000).toString());
        
        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac1);
        assert.equal(v, toUnit(200).toString()); // 0.2 build ratio
  
        // ac2 join in collateral
        await kLnCollateralSystem.CollateralEth( {from:ac2, value:toUnit(1)} );
        v = await kLnCollateralSystem.GetUserCollateral( ac2, ETHBytes32 );
        assert.equal(v, toUnit(1).toString());

        // ac1 ac2 MaxCanBuildAsset
        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac1);
        assert.equal(v, toUnit(200).toString(), "ac1 MaxCanBuildAsset should not change");
        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac2);
        assert.equal(v, toUnit(40).toString(), "");
        
        // update lina price, double
        await kLnChainLinkPrices.updateAll([linaBytes32], [toUnit(2)], Math.floor(Date.now()/1000).toString() );

        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac1);
        assert.equal(v, toUnit(400).toString());
        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac2);
        assert.equal(v, toUnit(40).toString(), "");

        // ac1 prepare to build asset
        v = await lUSD.balanceOf(ac1);
        assert.equal(v, 0);
        
        //-------------------ac1 build 100
        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac1});

        // debt data check.
        let ret = await kLnDebtSystem.GetUserDebtData(ac1);
        let debtProportion = ret[0];
        let debtFactor = ret[1];
        //console.log("debtProportion, debtFactor", debtProportion.toString(), debtFactor.toString());
        assert.equal(debtProportion, PRECISE_UNIT.toString());
        assert.equal(debtFactor, PRECISE_UNIT.toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        let debtbalance = ret[0];
        let totalAssetSupplyInUsd = ret[1];
        let redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac1); // check
        //console.log("debtbalance, totalAssetSupplyInUsd, redeemable", debtbalance.toString(), totalAssetSupplyInUsd.toString(), redeemable.toString());
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(100).toString());
        assert.equal(redeemable, toUnit(1500).toString()); // 2000 collateral - 100/0.2 debtBalance = 1500

        v = await lUSD.balanceOf(ac1);
        assert.equal(v, toUnit(100).toString());
        //-------------------

        v = await kLnBuildBurnSystem.MaxCanBuildAsset(ac1); //
        assert.equal(v, toUnit(300).toString());

        await exceptionEqual(
            kLnBuildBurnSystem.BuildAsset( toUnit(301), {from:ac1}, 
            "Build amount too big, you need more collateral"));

        //-------------------

        // ac2 build asset, debt fact change.
        v = await lUSD.balanceOf(ac2);
        assert.equal(v, 0);

        // before approve
        await exceptionEqual(
            kLnCollateralSystem.Collateral( linaBytes32, toUnit(900), {from:ac2}), 
            "insufficient allowance, need approve more amount");

        //-------------------ac2 build 100
        // 1 eth (200lusd) + 900 lina(1800lusd)
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac2});
        await kLnCollateralSystem.Collateral( linaBytes32, toUnit(900), {from:ac2});

        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac2});

        await checkPropDebtTotalRedeemLusd(ac1, toUnit(5e8), toUnit(100), toUnit(200), toUnit(1500), toUnit(100), "ac1 after ac2 build 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(5e8), toUnit(100), toUnit(200), toUnit(1500), toUnit(100), "ac2 after ac2 build 100");

        //-------------------ac1 build 200
        await kLnBuildBurnSystem.BuildAsset( toUnit(200), {from:ac1} );

        await checkPropDebtTotalRedeemLusd(ac1, toUnit(7.5e8), toUnit(300), toUnit(400), toUnit(500), toUnit(300), "ac1 after ac1 build 200");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(2.5e8), toUnit(100), toUnit(400), toUnit(1500),toUnit(100), "ac2 after ac1 build 200");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(0e8),   toUnit(0),   toUnit(400), toUnit(0),   toUnit(0),   "ac3 after ac1 build 200");

        //-------------------ac3 build 100
        await kLnCollateralSystem.CollateralEth( {from:ac3, value:toUnit(5)} );
        v = await kLnCollateralSystem.GetUserCollateral( ac3, ETHBytes32 );
        assert.equal(v, toUnit(5).toString());

        await kLnBuildBurnSystem.BuildAsset( toUnit(100), {from:ac3} );

        await checkPropDebtTotalRedeemLusd(ac1, toUnit(6e8), toUnit(300), toUnit(500), toUnit(500), toUnit(300), "ac1 after ac3 build 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(2e8), toUnit(100), toUnit(500), toUnit(1500),toUnit(100), "ac2 after ac3 build 100");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(2e8), toUnit(100), toUnit(500), toUnit(500), toUnit(100), "ac3 after ac3 build 100");

        // burn
        //-------------------ac1 burn 100
        await kLnBuildBurnSystem.BurnAsset(toUnit(100), {from:ac1});

        await checkPropDebtTotalRedeemLusd(ac1, toUnit(5e8),   toUnit(200), toUnit(400), toUnit(1000), toUnit(200), "ac1 after ac1 burn 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(2.5e8), toUnit(100), toUnit(400), toUnit(1500), toUnit(100), "ac2 after ac1 burn 100");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(2.5e8), toUnit(100), toUnit(400), toUnit(500),  toUnit(100), "ac3 after ac1 burn 100");

        //-------------------ac1 burn 200
        await kLnBuildBurnSystem.BurnAsset(toUnit(200), {from:ac1});

        await checkPropDebtTotalRedeemLusd(ac1, toUnit(0e8), toUnit(0),   toUnit(200), toUnit(2000), toUnit(0),   "ac1 after ac1 burn 200");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(5e8), toUnit(100), toUnit(200), toUnit(1500), toUnit(100), "ac2 after ac1 burn 200");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(5e8), toUnit(100), toUnit(200), toUnit(500),  toUnit(100), "ac3 after ac1 burn 200");

        //-------------------ac1 burn 1 fail
        await exceptionEqual(
            kLnBuildBurnSystem.BurnAsset(toUnit(1), {from:ac1}),
            "no debt, no burn");
        
        //-------------------ac2 burn 100
        await kLnBuildBurnSystem.BurnAsset(toUnit(100), {from:ac2});
        await checkPropDebtTotalRedeemLusd(ac1, toUnit(0e8), toUnit(0),   toUnit(100), toUnit(2000), toUnit(0),  "ac1 after ac2 burn 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(0e8), toUnit(0),   toUnit(100), toUnit(2000), toUnit(0),  "ac2 after ac2 burn 100");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(10e8), toUnit(100), toUnit(100), toUnit(500), toUnit(100),"ac3 after ac2 burn 100");

        //-------------------ac3 build 100
        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac3});
        await checkPropDebtTotalRedeemLusd(ac1, toUnit(0e8), toUnit(0),   toUnit(200), toUnit(2000), toUnit(0), "ac1 after ac3 build 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(0e8), toUnit(0),   toUnit(200), toUnit(2000), toUnit(0), "ac2 after ac3 build 100");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(10e8), toUnit(200), toUnit(200), toUnit(0), toUnit(200), "ac3 after ac3 build 100");

        //-------------------ac3 burn 100 , all user burn all asset, debt clear
        await kLnBuildBurnSystem.BurnAsset(toUnit(200), {from:ac3});
        await checkPropDebtTotalRedeemLusd(ac1, toUnit(0e8), toUnit(0), toUnit(0), toUnit(2000), toUnit(0), "ac1 after ac3 burn 100");
        await checkPropDebtTotalRedeemLusd(ac2, toUnit(0e8), toUnit(0), toUnit(0), toUnit(2000), toUnit(0), "ac2 after ac3 burn 100");
        await checkPropDebtTotalRedeemLusd(ac3, toUnit(0e8), toUnit(0), toUnit(0), toUnit(1000), toUnit(0), "ac3 after ac3 burn 100");

        // summary
        // ac1 collateral 1000 lina, value 2000 usd
        // ac2 collateral 1 eth + 900 lina, value 2000 usd
        // ac3 collateral 5 eth, value 1000 usd

        // rebuild test
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac1});
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac2});

        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac1});
        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac2});
        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac3});

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac1);
        assert.equal(v, "333333333333333333333333334"); // print log first, and get these values, as expect
        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac2);
        assert.equal(v, "333333333333333333333333334");
        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac3);
        assert.equal(v, "333333333333333333333333333");

        await checkPropDebtTotalRedeemLusd(ac1, "333333333333333333333333334", toUnit(100), toUnit(300), toUnit(1500), toUnit(100), "ac1 after rebuild 100");
        await checkPropDebtTotalRedeemLusd(ac2, "333333333333333333333333334", toUnit(100), toUnit(300), toUnit(1500), toUnit(100), "ac2 after rebuild 100");
        await checkPropDebtTotalRedeemLusd(ac3, "333333333333333333333333333", toUnit(100), toUnit(300), toUnit(500),  toUnit(100), "ac3 after rebuild 100");

        ret = await kLnCollateralSystem.GetUserCollaterals(ac2);
        //console.log("ac2 collaterals", ret[0].toString(), ret[1].toString());
        assert.equal(ret[0].toString(), "0x6c696e6100000000000000000000000000000000000000000000000000000000,0x4554480000000000000000000000000000000000000000000000000000000000");
        assert.equal(ret[1].toString(), "900000000000000000000,1000000000000000000");

        // -----------------------------
        // redeem test
        // ac1 redeem 250 lina = 500 usd
        await kLnCollateralSystem.Redeem(linaBytes32, toUnit(250), {from:ac1});

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(1000).toString());

        // ac2 redeem 1 eth = 200 usd
        await kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac2});

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(1300).toString());

        // price change, debt change, redeem change
        // collateral price down
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32, lusdBytes32], [toUnit(1), toUnit(100), toUnit(1)], Math.floor(Date.now()/1000).toString() );
        // ac1 collateral 750 lina, value 750 usd
        // ac2 collateral 900 lina, value 900 usd
        // ac3 collateral 5 eth, value 500 usd

        await checkPropDebtTotalRedeemLusd(ac1, "333333333333333333333333334", toUnit(100), toUnit(300), toUnit(250), toUnit(100), "ac1 after price down");
        await checkPropDebtTotalRedeemLusd(ac2, "333333333333333333333333334", toUnit(100), toUnit(300), toUnit(400), toUnit(100), "ac2 after price down");
        await checkPropDebtTotalRedeemLusd(ac3, "333333333333333333333333333", toUnit(100), toUnit(300), toUnit(0),  toUnit(100), "ac3 after price down");
        
        await exceptionEqual(
            kLnCollateralSystem.Redeem(linaBytes32, toUnit(250.00001), {from:ac1}),
            "Because lower collateral ratio, can not redeem too much");

        await kLnCollateralSystem.Redeem(linaBytes32, toUnit(250), {from:ac1});
        await kLnCollateralSystem.Redeem(linaBytes32, toUnit(400), {from:ac2});

        await exceptionEqual(
            kLnCollateralSystem.RedeemETH(toUnit(0.000001), {from:ac3}),
            "Because lower collateral ratio, can not redeem too much");
        
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v, toUnit(0).toString());

        // collateral price down down
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32, lusdBytes32], [toUnit(0.1), toUnit(10), toUnit(1)], Math.floor(Date.now()/1000).toString() );

        // ac1 collateral 500 lina, value 50 usd
        // ac2 collateral 500 lina, value 50 usd
        // ac3 collateral 5 eth, value 50 usd
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v, toUnit(0).toString());

        await exceptionEqual(
            kLnCollateralSystem.Redeem(linaBytes32, toUnit(0.00001), {from:ac1}),
            "Because lower collateral ratio, can not redeem too much");

        await exceptionEqual(
            kLnBuildBurnSystem.BuildAsset( toUnit(0.00001), {from:ac1} ),
            "Build amount too big, you need more collateral");

        await exceptionEqual(
            kLnBuildBurnSystem.BuildAsset(toUnit(0.00001), {from:ac2}),
            "Build amount too big, you need more collateral");

        await exceptionEqual(
            kLnBuildBurnSystem.BuildAsset(toUnit(0.00001), {from:ac3}), 
            "Build amount too big, you need more collateral");

        // collateral price up
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32, lusdBytes32], [toUnit(10), toUnit(1000), toUnit(1)], Math.floor(Date.now()/1000).toString() );

        // ac1 collateral 500 lina, value 5000 usd
        // ac2 collateral 500 lina, value 5000 usd
        // ac3 collateral 5 eth, value 5000 usd
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(4500).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(4500).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v, toUnit(4500).toString());

        // can build asset, can redeem again.
        await kLnBuildBurnSystem.BuildAsset( toUnit(100), {from:ac1} );
        await kLnBuildBurnSystem.BuildAsset( toUnit(100), {from:ac2} );
        await kLnBuildBurnSystem.BuildAsset( toUnit(100), {from:ac3} );

        // the 33333... has some change.
        await checkPropDebtTotalRedeemLusd(ac1, "333333333333333333333333333", toUnit(200), toUnit(600), toUnit(4000), toUnit(200), "ac1 after price down");
        await checkPropDebtTotalRedeemLusd(ac2, "333333333333333333333333332", toUnit(200), toUnit(600), toUnit(4000), toUnit(200), "ac2 after price down");
        await checkPropDebtTotalRedeemLusd(ac3, "333333333333333333333333333", toUnit(200), toUnit(600), toUnit(4000), toUnit(200), "ac3 after price down");

        await kLnCollateralSystem.Redeem(linaBytes32, toUnit(100), {from:ac1});
        await kLnCollateralSystem.Redeem(linaBytes32, toUnit(100), {from:ac2});
        await kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac3});

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(3000).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(3000).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v, toUnit(3000).toString());

        // price down
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32, lusdBytes32], [toUnit(0.1), toUnit(10), toUnit(1)], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v, toUnit(0).toString());
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v, toUnit(0).toString());
    });

    it('Pausable', async function () {
        let exception = "";
        let emptyAddr = "0x0000000000000000000000000000000000000000";
        await LnBuildBurnSystem.link(SafeDecimalMath);
        let kLnBuildBurnSystem = await LnBuildBurnSystem.new(ac0, emptyAddr);

        await kLnBuildBurnSystem.setPaused(true);

        await exceptionEqual(
            kLnBuildBurnSystem.BuildAsset(toUnit(1)), 
            "Pausable: paused");

        await exceptionEqual(
            kLnBuildBurnSystem.BurnAsset(toUnit(1)), 
            "Pausable: paused");

        await kLnBuildBurnSystem.setPaused(false);

        await exceptionNotEqual(
            kLnBuildBurnSystem.BuildAsset(toUnit(1)), 
            "Pausable: paused");

        await exceptionNotEqual(
            kLnBuildBurnSystem.BurnAsset(toUnit(1)),
            "Pausable: paused");
    });
});

