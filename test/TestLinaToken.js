const LinearFinance = artifacts.require("LinearFinance");

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }   

contract('test LinearFinance', async (accounts)=> {

    const admin = accounts[0];
    const ac1 = accounts[1];

    const mintAmount = "1000000000000000000000";
    const sendamount = "1000000000000000000";
    it('mint and transfer', async ()=> {
        const lina = await LinearFinance.deployed();
        let balance = await lina.balanceOf(admin);

        assert.equal(balance.valueOf(), 0);
        
        await lina.mint(admin, mintAmount, { from: admin });
        balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf(), mintAmount);

        let balance1 = await lina.balanceOf(ac1);
        assert.equal(balance1.valueOf(), 0);
        
        await lina.transfer(ac1, sendamount, { from: admin });

        balance = await lina.balanceOf(admin);
        balance1 = await lina.balanceOf(ac1);
        assert.equal(balance.valueOf(), mintAmount - sendamount);
        assert.equal(balance1.valueOf(), sendamount);
    });

    //todo: test fail case
    // it("mint fail by other account" , async ()=> {
    //     const lina = await LinearFinance.deployed();
 
    //     await lina.mint(admin, mintAmount, { from: ac1 });
    // });

    it('staking', async ()=> {
        const lina = await LinearFinance.deployed();
        let initbalance = await lina.balanceOf(admin);
        initbalance = initbalance.valueOf();

        //set time
        let starttime = Math.floor(Date.now()/1000) + 8*3600; // 8hours 
        await lina.set_StakingPeriod(starttime-10, starttime + 60);
        let stakingperiod = await lina.stakingPeriod();
        //console.log(stakingperiod);

        const stakingAmount = "2000000000000000000";
        let ret = await lina.staking(stakingAmount, { from: admin });
        //assert.equal(ret.valueOf(), true);

        let balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf(), initbalance-stakingAmount);

        let stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, stakingAmount);
        
        let stakingb2 = await lina.stakingBalanceOf(ac1);
        assert.equal(stakingb2.valueOf(), 0);

        ret = await lina.cancelStaking(stakingAmount);
        //assert.equal(ret.valueOf(), true);

        stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, 0);

        balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf()-initbalance, 0);

        ///
        await lina.staking(stakingAmount, { from: admin });
        //let _2days = 3600*24*2;
        //await lina.set_StakingPeriod(starttime - 10, starttime + 60-_2days);// 这样设置时间有问题
        await sleep(62000);
        await lina.claim();

        stakingbalance = await lina.stakingBalanceOf(admin);
        assert.equal(stakingbalance, 0);

        balance = await lina.balanceOf(admin);
        assert.equal(balance.valueOf()-initbalance, 0);

    });

    it('new token logic', async ()=> {

    });
});

