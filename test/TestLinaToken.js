const LinearFinance = artifacts.require("LinearFinance");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const testAddressCache = artifacts.require("testAddressCache");
const {CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const oneDay = 3600*24;
const oneWeek = oneDay*7;
const oneYear = oneDay*365;
const thirtyDay = oneDay*30;

function rpcCallback(a,b,c,d) {
    //console.log("rpcCallback",a,b,c,d);
}

const currentTime = async () => {
    const { timestamp } = await web3.eth.getBlock('latest', false, (a,b,c)=>{});
    return timestamp;
};

contract('test LinearFinance', async (accounts)=> {

    const admin = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];

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
        //await lina.mint(admin, mintAmount, { from: admin });
        
        await lina.mint(ac1, mintAmount, { from: admin });
        await lina.mint(ac2, mintAmount, { from: admin });
        await lina.mint(ac3, mintAmount, { from: admin });

        let blocktime = await currentTime();

        await lina.setStakingPeriod(blocktime-1, blocktime-1 + 8 * 3600*24*7);

        //---------------------------------------- week 0
        let balance1 = await lina.balanceOf(ac1);
        for (let i=0; i<50; i++) {
            await lina.staking( toUnit(1).toString(), {from:ac1} );
        }

        let v = await lina.stakingBalanceOf( ac1 );
        assert.equal(v, toUnit(50).toString());

        v = await lina.weeksTotal(0);
        assert.equal(v, toUnit(50).toString());

        v = await lina.balanceOf(ac1);
        assert.equal(v.toString(), balance1 - toUnit(50));
        balance1 = v;

        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneWeek+1]}, rpcCallback);

        //---------------------------------------- week 1
        await lina.cancelStaking(toUnit(10).toString(), {from:ac1});

        v = await lina.stakingBalanceOf( ac1 );
        assert.equal(v, toUnit(40).toString());

        v = await lina.weeksTotal(0);
        assert.equal(v, toUnit(40).toString());

        v = await lina.weeksTotal(1);
        assert.equal(v, toUnit(0).toString());

        await lina.staking( toUnit(60).toString(), {from:ac1} );
        v = await lina.stakingBalanceOf( ac1 );
        assert.equal(v, toUnit(100).toString());

        await lina.staking( toUnit(30).toString(), {from:ac2} );
        await lina.staking( toUnit(70).toString(), {from:ac2} );
        v = await lina.stakingBalanceOf( ac2 );
        assert.equal(v, toUnit(100).toString());

        v = await lina.weeksTotal(1);
        assert.equal(v, toUnit(160).toString());

        //---------------------------------------- week 3
        await web3.currentProvider.send({method: "evm_increaseTime", params: [2*oneWeek+1]}, rpcCallback);

        await lina.staking( toUnit(100).toString(), {from:ac3} );
        v = await lina.weeksTotal(2);
        assert.equal(v, toUnit(0).toString());
        v = await lina.weeksTotal(3);
        assert.equal(v, toUnit(100).toString());

        //---------------------------------------- week 5
        await web3.currentProvider.send({method: "evm_increaseTime", params: [2*oneWeek+1]}, rpcCallback);

        await lina.cancelStaking(toUnit(10).toString(), {from:ac3});
        await lina.staking( toUnit(100).toString(), {from:ac3} );
        v = await lina.stakingBalanceOf( ac3 );
        assert.equal(v, toUnit(190).toString());

        await lina.staking( toUnit(50).toString(), {from:ac2} );
        v = await lina.stakingBalanceOf( ac2 );
        assert.equal(v, toUnit(150).toString());

        v = await lina.weeksTotal(3);
        assert.equal(v, toUnit(90).toString());
        v = await lina.weeksTotal(4);
        assert.equal(v, toUnit(0).toString());
        v = await lina.weeksTotal(5);
        assert.equal(v, toUnit(150).toString());
        //---------------------------------------- week 7
        await web3.currentProvider.send({method: "evm_increaseTime", params: [2*oneWeek+1]}, rpcCallback);

        await lina.staking( toUnit(100).toString(), {from:ac1} );

        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneWeek+1]}, rpcCallback);

        await lina.claim({from:ac1});
        await lina.claim({from:ac2});
        await lina.claim({from:ac3});

        v = await lina.stakingBalanceOf( ac1 );
        assert.equal(v, toUnit(0).toString());
        v = await lina.stakingBalanceOf( ac2 );
        assert.equal(v, toUnit(0).toString());
        v = await lina.stakingBalanceOf( ac3 );
        assert.equal(v, toUnit(0).toString());

        arrayTotal = await lina.weekTotalStaking();
        //console.log(arrayTotal);
        assert.equal(arrayTotal[0], toUnit(40).toString());
        assert.equal(arrayTotal[1], toUnit(200).toString());
        assert.equal(arrayTotal[2], toUnit(200).toString());
        assert.equal(arrayTotal[3], toUnit(290).toString());
        assert.equal(arrayTotal[4], toUnit(290).toString());
        assert.equal(arrayTotal[5], toUnit(440).toString());
        assert.equal(arrayTotal[6], toUnit(440).toString());
        assert.equal(arrayTotal[7], toUnit(540).toString());

        v = await lina.balanceOf(ac1);
        console.log("ac1 balance", v.toString());
        v = await lina.balanceOf(ac2);
        console.log("ac2 balance", v.toString());
        v = await lina.balanceOf(ac3);
        console.log("ac3 balance", v.toString());
    });
});

