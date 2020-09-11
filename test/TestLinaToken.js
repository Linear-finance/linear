const LinearFinance = artifacts.require("LinearFinance");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const testAddressCache = artifacts.require("testAddressCache");
const {CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const oneDay = 3600*24;
const oneYear = oneDay*365;
const thirtyDay = oneDay*30;

function rpcCallback(a,b,c,d) {
    //console.log("rpcCallback",a,b,c,d);
}

contract('test LinearFinance', async (accounts)=> {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];

    const mintAmount = toUnit("1000").toString();
    const sendamount = toUnit("1").toString();

    it('mint and transfer', async ()=> {
        const [lina,linaproxy] = await CreateLina(admin);
        
        let balance = await lina.balanceOf(ac1);
        assert.equal(balance.valueOf(), 0);
        
        await lina.mint(ac1, mintAmount, { from: admin });
        balance = await lina.balanceOf(ac1);
        assert.equal(balance.valueOf(), mintAmount);

        let balance1 = await lina.balanceOf(ac2);
        assert.equal(balance1.valueOf(), 0);
        
        await lina.transfer(ac2, sendamount, { from: ac1 });

        balance = await lina.balanceOf(ac1);
        balance1 = await lina.balanceOf(ac2);
        assert.equal(balance.valueOf(), mintAmount - sendamount);
        assert.equal(balance1.valueOf(), sendamount);
        //console.log(balance.toString(), balance1.toString());

        await lina.setPaused(true, { from: admin });
        await exceptionEqual(
            lina.transfer(ac1, sendamount, { from: admin }),
            "ERC20Pausable: token transfer while paused");
        //lina.setPaused(false, { from: admin });
    });
   
    //test fail case
    it("mint fail by other account" , async ()=> {
        const [lina,linaproxy] = await CreateLina(admin);
 
        await exceptionEqual(lina.mint(admin, mintAmount, { from: ac1 }),
            "Only the contract admin can perform this action");
    });

    it('staking', async ()=> {
        const [lina,linaproxy] = await CreateLina(admin);
        await lina.mint(admin, mintAmount, { from: admin });
        
        let initbalance = await lina.balanceOf(admin);
        initbalance = initbalance.valueOf();

        //set time
        //let starttime = Math.floor(Date.now()/1000);
        const { timestamp } = await web3.eth.getBlock('latest', false, (a,b,c)=>{});

        await lina.set_StakingPeriod(timestamp + 10, timestamp + 5*oneDay+20 );
        //let stakingperiod = await lina.stakingPeriod();
        //console.log(stakingperiod);

        const stakingAmount = toUnit("1").toString();
        await lina.staking(stakingAmount, { from: admin });
        await lina.staking(stakingAmount, { from: admin });

        let balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf(), initbalance-stakingAmount*2);

        let stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, stakingAmount*2);
        
        let stakingb2 = await lina.stakingBalanceOf(ac1);
        assert.equal(stakingb2.valueOf(), 0);

        await lina.cancelStaking(stakingAmount);
        await lina.cancelStaking(stakingAmount);

        stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, 0);

        balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf(), initbalance.toString());

        await lina.staking(stakingAmount, { from: admin });

        stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, stakingAmount.toString());
        balance = await lina.balanceOf(admin);
        assert.equal(stakingbalance.add(balance), initbalance.toString());

        web3.currentProvider.send({method: "evm_increaseTime", params: [5*oneDay+22]}, rpcCallback);

        let rewardFactor = await lina.rewardFactor();
        const stakingRewardFactor = rewardFactor[0]
        const stakingRewardDenominator = rewardFactor[1]

        //console.log("stakingRewardFactor, stakingRewardDenominator", stakingRewardFactor, stakingRewardDenominator);
        await lina.claim();

        stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, 0);

        let reward = stakingAmount*5*stakingRewardFactor/stakingRewardDenominator;
        console.log("reward", reward);//500000000000000

        balance = await lina.balanceOf(admin);     
        console.log(balance.valueOf().toString()); // 500000000049152
        assert.equal(balance.sub(initbalance), reward.toString());
    });

});

