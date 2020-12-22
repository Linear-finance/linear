const LnCollateralBuildBurnAPI = artifacts.require("LnCollateralBuildBurnAPI");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnBuildBurnSystem = artifacts.require("LnBuildBurnSystem");

const { assert } = require('chai');
const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
//const toETHUnit = amount => ethers.utils.parseEther(amount.toString());

const {InitComment, CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const PRECISE_UNIT = toUnit(1e9); // 1e27

let kLnBuildBurnSystem
let kLnCollateralBuildBurnAPI
let kLnDebtSystem
let kLnCollateralSystem
let kLnChainLinkPrices
let lUSD

contract('test LnCollateralBuildBurnAPI', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];
    
    // don't call any await async functions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('Stake/Build and Unstake/Burn test', async ()=> {
        const linaBytes32 = toBytes32("LINA");
        const ETHBytes32 = toBytes32("ETH");

        let InitContracts = await InitComment(ac0);

        kLnBuildBurnSystem = InitContracts.kLnBuildBurnSystem;
        kLnCollateralBuildBurnAPI = InitContracts.kLnCollateralBuildBurnAPI;
        kLnCollateralSystem = InitContracts.kLnCollateralSystem;
        kLnChainLinkPrices = InitContracts.kLnChainLinkPrices;
        kLnDebtSystem = InitContracts.kLnDebtSystem;
        lUSD = InitContracts.lUSD;

        const [lina,linaproxy] = await CreateLina(ac0);

        await kLnCollateralSystem.UpdateTokenInfo( linaBytes32, lina.address, toUnit(1), false);

        
        // set price
        await kLnChainLinkPrices.updateAll([linaBytes32, ETHBytes32], [toUnit(1), toUnit(200)], Math.floor(Date.now()/1000).toString() );
    
        // mint lina
        lina.mint(ac1, toUnit(3000) ); // ac1 mint lina
        
        // ac1 collateral and build
        await lina.approve(kLnCollateralSystem.address, toUnit(3000), {from:ac1});

        // ac1 prepare to build asset
        v = await lUSD.balanceOf(ac1);
        assert.equal(v, 0);
        await kLnCollateralSystem.Collateral(linaBytes32, toUnit(2000), {from:ac1});   

        console.log("After ac1 stake 2000 LINA:");

        v = await lina.balanceOf(ac1);
        console.log("LINA balance:", v.toString());
        assert.equal(v, toUnit(1000).toString());

        let ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        console.log("Debt balance: ", ret[0].toString());
        console.log("Total Asset Supply In Usd : ", ret[1].toString());


        //-------------------ac1 collateral and build 200
        v = await kLnBuildBurnSystem.calcBuildAmount(200, {from:ac1});
        console.log("ac1 can build:", v.toString());

        await kLnCollateralBuildBurnAPI.collateralAndBuild(linaBytes32, toUnit(200), {from:ac1});

        console.log("After stake 200 LINA and build:");

        v = await lUSD.balanceOf(ac1);
        assert.equal(v, toUnit(40).toString());// 0.2 build ratio
        console.log("lUSD balance:", v.toString());

        v = await lina.balanceOf(ac1);
        console.log("LINA balance:", v.toString());
        assert.equal(v, toUnit(800).toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        console.log("Debt balance: ", ret[0].toString());
        console.log("Total Asset Supply In Usd : ", ret[1].toString());

        //--------------------ac1 collateral and build 100 
        v = await kLnBuildBurnSystem.calcBuildAmount(100);
        console.log("ac1 can build:", v.toString());

        await kLnCollateralBuildBurnAPI.collateralAndBuild(linaBytes32, toUnit(100), {from:ac1});

        console.log("After stake 100 LINA and build:");

        v = await lUSD.balanceOf(ac1);
        console.log("lUSD balance:", v.toString());
        assert.equal(v, toUnit(40).toString());// 0.2 build ratio
        
        v = await lina.balanceOf(ac1);
        console.log("LINA balance:", v.toString());
        assert.equal(v, toUnit(700).toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        console.log("Debt balance: ", ret[0].toString());
        console.log("Total Asset Supply In Usd : ", ret[1].toString());

        //ac1 burn and redeem

        //ac1 prepare to burn asset
        v = await lUSD.balanceOf(ac1);
        console.log("Before burn lUSD balance:", v.toString());
        assert.equal(v, toUnit(40).toString());
    
        v = await lina.balanceOf(ac1);
        console.log("Before burn LINA balance:", v.toString());
        assert.equal(v, toUnit(700).toString());

        //-------------------ac1 burn and redeem 10
        
        await kLnCollateralBuildBurnAPI.burnAndRedeem( linaBytes32, toUnit(10), {from:ac1});

        console.log("After burn 10 lUSD and unstake:");

        v = await lUSD.balanceOf(ac1);
        assert.equal(v, toUnit(30).toString());
        console.log("lUSD balance:", v.toString());

        v = await lina.balanceOf(ac1);
        assert.equal(v, toUnit(710).toString());
        console.log("LINA balance:", v.toString());

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        console.log("Debt balance: ", ret[0].toString());
        console.log("Total Asset Supply In Usd : ", ret[1].toString());

        //-------------------ac1 burn and redeem 20
        await kLnCollateralBuildBurnAPI.burnAndRedeem( linaBytes32, toUnit(20), {from:ac1});

        console.log("After burn 20 lUSD and unstake:");

        v = await lUSD.balanceOf(ac1);
        console.log("lUSD balance:", v.toString());
        assert.equal(v, toUnit(10).toString());

        v = await lina.balanceOf(ac1);
        assert.equal(v, toUnit(730).toString());  
        console.log("LINA balance:", v.toString());  

        ret = await kLnDebtSystem.GetUserDebtBalanceInUsd(ac1);
        console.log("Debt balance: ", ret[0].toString());
        console.log("Total Asset Supply In Usd : ", ret[1].toString());
    });

});

