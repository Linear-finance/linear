const LnCollateralSystem = artifacts.require("LnCollateralSystem");
const LinearFinance = artifacts.require("LinearFinance");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const {InitComment, CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");
const { ethers } = require('ethers');

contract('test LnCollateralSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];
    const ac4 = accounts[4];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    const linaBytes32 = toBytes32("lina");
    const ETHBytes32 = toBytes32("ETH");

    it('collateral and redeem', async ()=> {
        
        let InitContracts = await InitComment(ac0);
        //console.log("InitContracts", InitContracts);

        const [lina,linaproxy] = await CreateLina(ac0);

        let kLnCollateralSystem = InitContracts.kLnCollateralSystem;

        await kLnCollateralSystem.UpdateTokenInfo( linaBytes32, lina.address, toUnit(1), false);

        //let tokeninfo = await kLnCollateralSystem.tokenInfos( linaBytes32 );
        //console.log("tokeninfo", tokeninfo);

        let v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 0);

        // mint lina
        lina.mint(ac1, toUnit(1000) ); // ac1 mint lina

        // fail test
        await exceptionEqual(
            kLnCollateralSystem.Collateral( toBytes32("notExist"), toUnit(10) ),
            "Invalid token symbol");

        await exceptionEqual(
            kLnCollateralSystem.Collateral( linaBytes32, toUnit(0.1)),
            "Collateral amount too small");

        // collateral more than balance and approve balance
        await exceptionEqual(
            kLnCollateralSystem.Collateral( linaBytes32, toUnit(1001), {from:ac1}),
            "insufficient balance");

        // before 
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac1});
        await kLnCollateralSystem.Collateral( linaBytes32, toUnit(1000), {from:ac1});
        
        // setup price, chainlink price is price*10e8
        await InitContracts.kLnChainLinkPrices.updateAll([linaBytes32], [toUnit(1)], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 1000e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 1000e18);

        // setup price
        await InitContracts.kLnChainLinkPrices.updateAll([linaBytes32], [toUnit(2)], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 1000e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 2*1000e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 2*1000e18);

        // debt is 0
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v.valueOf(), 2*1000e18);

        //redeem
        await exceptionEqual(
            kLnCollateralSystem.Redeem( toBytes32("notExist"), toUnit(10) ),
            "Can not redeem more than collateral");

        await exceptionEqual(
            kLnCollateralSystem.Redeem( toBytes32("notExist"), 1 ),
            "Can not redeem more than collateral");

        await kLnCollateralSystem.Redeem( linaBytes32, toUnit(10), {from:ac1} );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 990e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 2*990e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 2*990e18);

        await kLnCollateralSystem.Redeem( linaBytes32, toUnit(990), {from:ac1} );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, linaBytes32);
        assert.equal(v.valueOf(), 0e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 2*0e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 2*0e18);

        await exceptionEqual(
            kLnCollateralSystem.Redeem( linaBytes32, 1, {from:ac1} ),
            "Can not redeem more than collateral");

        // ETH test, ETH collateral
        let ac1balance = await web3.eth.getBalance(ac1);
        await kLnCollateralSystem.CollateralEth({from:ac1, value:toUnit(1)});
        let ac1newbalance = await web3.eth.getBalance(ac1);
        assert.equal(ac1balance.valueOf() >= ac1newbalance.valueOf() + toUnit(1), true); // need fee

        v = await web3.eth.getBalance(kLnCollateralSystem.address);
        assert.equal(v.valueOf(), 1e18);

        await InitContracts.kLnChainLinkPrices.updateAll([ETHBytes32], [toUnit(200)], Math.floor(Date.now()/1000).toString() );

        v = await kLnCollateralSystem.GetUserCollateral(ac1, ETHBytes32);
        assert.equal(v.valueOf(), 1e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 200*1e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 200*1e18);

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v.valueOf(), 200*1e18);

        //ETH redeem
        // admin redeem
        await exceptionEqual(
            kLnCollateralSystem.RedeemETH(toUnit(1)),
            "Can not redeem more than collateral");

        await kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac1});
        
        v = await kLnCollateralSystem.GetUserCollateral(ac1, ETHBytes32);
        assert.equal(v.valueOf(), 0e18);
        v = await kLnCollateralSystem.GetUserTotalCollateralInUsd(ac1);
        assert.equal(v.valueOf(), 0*1e18);
        v = await kLnCollateralSystem.GetSystemTotalCollateralInUsd();
        assert.equal(v.valueOf(), 0*1e18);

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v.valueOf(), 0*1e18);

        // many people
        await lina.approve(kLnCollateralSystem.address, toUnit(1000), {from:ac1});
        await kLnCollateralSystem.Collateral( linaBytes32, toUnit(1000), {from:ac1});

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v.valueOf(), 2*1000e18);

        // ac2 join in with ETH
        await kLnCollateralSystem.CollateralEth({from:ac2, value:toUnit(1)});

        v = await kLnCollateralSystem.GetUserCollateral(ac1, ETHBytes32);
        assert.equal(v.valueOf(), 0);
        v = await kLnCollateralSystem.GetUserCollateral(ac2, ETHBytes32);
        assert.equal(v.valueOf(), toUnit(1).toString());

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac1);
        assert.equal(v.valueOf(), 2*1000e18);
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac2);
        assert.equal(v.valueOf(), 200*1e18);

        let preBalance = await web3.eth.getBalance(kLnCollateralSystem.address);
        let ac3Balance = await web3.eth.getBalance(ac3);
        let retSendTx = await kLnCollateralSystem.sendTransaction({from:ac3, value:toUnit(1)});
        //console.log(retSendTx);
        v = await web3.eth.getBalance(kLnCollateralSystem.address);
        assert.equal(v-preBalance, toUnit(1).toString());
        let goneamount = ac3Balance-(await web3.eth.getBalance(ac3)-retSendTx.receipt.gasUsed);
        console.log("goneamount", goneamount);
        assert.ok(goneamount >= 1e18); // ?? why bigger then 1 eth

        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v.cmp(toUnit(200)), 0);

        await kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac3});
        v = await kLnCollateralSystem.MaxRedeemableInUsd(ac3);
        assert.equal(v.cmp(toUnit(0)), 0);
        //revert
        //await kLnCollateralSystem.sendTransaction({from:ac3, value:toUnit(1), data:"0x1234567890"});
        
        //TODO: CollateralEth 重入测试，
    });

    it('Pausable', async function () {
        
        let kLnCollateralSystem = await LnCollateralSystem.new(ac0);
        await kLnCollateralSystem.setPaused(true);

        await exceptionEqual(
            kLnCollateralSystem.Collateral(linaBytes32, toUnit(1)),
            "Pausable: paused");

        await exceptionEqual(
            kLnCollateralSystem.Redeem(linaBytes32, toUnit(1)),
            "Pausable: paused");

        await exceptionEqual(
            kLnCollateralSystem.CollateralEth({from:ac1, value:toUnit(1)}),
            "Pausable: paused");

        await exceptionEqual(
            kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac1}),
            "Pausable: paused");

        await kLnCollateralSystem.setPaused(false);

        await exceptionNotEqual(
            kLnCollateralSystem.Collateral(linaBytes32, toUnit(1)),
            "Pausable: paused");

        await exceptionNotEqual(
            kLnCollateralSystem.Redeem(linaBytes32, toUnit(1)),
            "Pausable: paused");

        await exceptionNotEqual(
            kLnCollateralSystem.CollateralEth({from:ac1, value:toUnit(1)}),
            "Pausable: paused");

        await exceptionNotEqual(
            kLnCollateralSystem.sendTransaction({from:ac1, value:toUnit(1)}),
            "Pausable: paused");

        await exceptionNotEqual(
            kLnCollateralSystem.RedeemETH(toUnit(1), {from:ac1}),
            "Pausable: paused");
    });

    // RedeemETH contract call this function test
});

