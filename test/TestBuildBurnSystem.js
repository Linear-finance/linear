const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
//const toETHUnit = amount => ethers.utils.parseEther(amount.toString());

const {InitComment, newAssetToken, CreateLina} = require ("./common.js");

const PRECISE_UNIT = toUnit(1e9); // 1e27

contract('test LnBuildBurnSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('#BuildBurn test', async ()=> {
        const linaBytes32 = toBytes32("lina");
        const ETHBytes32 = toBytes32("ETH");
        const lusdBytes32 = toBytes32("lUSD");

        let InitContracts = await InitComment(ac0);

        let kLnBuildBurnSystem = InitContracts.kLnBuildBurnSystem;
        let kLnDebtSystem = InitContracts.kLnDebtSystem;
        let kLnCollateralSystem = InitContracts.kLnCollateralSystem;
        let kLnChainLinkPrices = InitContracts.kLnChainLinkPrices;
        let lUSD = InitContracts.lUSD;

        const lina = await CreateLina(ac0);

        await kLnCollateralSystem.UpdateTokenInfo( linaBytes32, lina.address, toUnit(1), false);

        let exception = "";
        try {
            await kLnBuildBurnSystem.BuildAsset( toUnit(10), {from:ac1} );
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "Build amount too big, you need more collateral"); exception = "";

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

        try {
            await kLnBuildBurnSystem.BuildAsset( toUnit(301), {from:ac1} );
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "Build amount too big, you need more collateral"); exception = "";

        //-------------------

        // ac2 build asset, debt fact change.
        v = await lUSD.balanceOf(ac2);
        assert.equal(v, 0);

        // before approve
        try {
            await kLnCollateralSystem.Collateral( linaBytes32, toUnit(900), {from:ac2});
        } catch (e) { exception = e.reason; }
        assert.equal(exception, "insufficient allowance, need approve more amount"); exception = "";

        //-------------------ac2 build 100
        // 1 eth (200lusd) + 900 lina(1800lusd)
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac2});
        await kLnCollateralSystem.Collateral( linaBytes32, toUnit(900), {from:ac2});

        await kLnBuildBurnSystem.BuildAsset(toUnit(100), {from:ac2});

        // ac1 debt data not change
        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac1); // check
        //console.log("debtbalance, totalAssetSupplyInUsd, redeemable", debtbalance.toString(), totalAssetSupplyInUsd.toString(), redeemable.toString());
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(200).toString()); // total plus 100
        assert.equal(redeemable, toUnit(1500).toString()); // 2000 collateral - 100/0.2 debtBalance = 1500

        // ac2 debt data
        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac2);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac2); // check
        //console.log("debtbalance, totalAssetSupplyInUsd, redeemable", debtbalance.toString(), totalAssetSupplyInUsd.toString(), redeemable.toString());
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(200).toString());
        assert.equal(redeemable, toUnit(1500).toString()); // 2000 collateral - 100/0.2 debtBalance = 1500

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac1);
        assert.equal(v, toUnit(5e8).toString()); // 0.5

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac2);
        assert.equal(v, toUnit(5e8).toString()); // 0.5

        v = await lUSD.balanceOf(ac2);
        assert.equal(v, toUnit(100).toString());
        //-------------------ac1 build 200

        await kLnBuildBurnSystem.BuildAsset( toUnit(200), {from:ac1} );

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac1);
        assert.equal(v, toUnit(7.5e8).toString());

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac2);
        assert.equal(v, toUnit(2.5e8).toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(debtbalance, toUnit(300).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(400).toString());
        assert.equal(redeemable, toUnit(500).toString());

        //
        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac2);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(400).toString());
        assert.equal(redeemable, toUnit(1500).toString());

        //-------------------ac3 build
        await kLnCollateralSystem.CollateralEth( {from:ac3, value:toUnit(5)} );
        v = await kLnCollateralSystem.GetUserCollateral( ac3, ETHBytes32 );
        assert.equal(v, toUnit(5).toString());

        await kLnBuildBurnSystem.BuildAsset( toUnit(100), {from:ac3} );

        // ac1 ac2 ac3 debt data
        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(debtbalance, toUnit(300).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(500).toString());
        assert.equal(redeemable, toUnit(500).toString());

        //
        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac2);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(500).toString());
        assert.equal(redeemable, toUnit(1500).toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac3);
        debtbalance = ret[0];
        totalAssetSupplyInUsd = ret[1];
        redeemable = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(debtbalance, toUnit(100).toString());
        assert.equal(totalAssetSupplyInUsd, toUnit(500).toString());
        assert.equal(redeemable, toUnit(500).toString());

        //
        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac1);
        assert.equal(v, toUnit(6e8).toString());

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac2);
        assert.equal(v, toUnit(2e8).toString());

        v = await kLnDebtSystem.GetUserCurrentDebtProportion(ac3);
        assert.equal(v, toUnit(2e8).toString());

        // price change

        // burn

    });

});

