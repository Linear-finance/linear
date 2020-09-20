const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LnRewardCalculator = artifacts.require('LnRewardCalculator');
const LnRewardCalculatorTest = artifacts.require('LnRewardCalculatorTest');
const LnSimpleStaking = artifacts.require('LnSimpleStaking');

const LinearFinance = artifacts.require("LinearFinance");
const LnLinearStakingStorage = artifacts.require("LnLinearStakingStorage");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnLinearStaking = artifacts.require("LnLinearStaking");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const HelperPushStakingData = artifacts.require("HelperPushStakingData");

const fs = require('fs');

const {CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

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

const curBlockNumber = async () => {
    const {number} = await web3.eth.getBlock('latest', false, (a,b,c)=>{});
    return number;
}

contract('LnRewardCalculator', ([alice, bob, carol, dev, minter]) => {

    it('reward calc test', async () => {
        // 100 per block farming rate starting at block 300 with bonus until block 1000
        let calculator = await LnRewardCalculatorTest.new('1000', '300', { from: alice });
        // Alice deposits 10 tokens at block 310
        await calculator.deposit( 310, alice, '10', { from: alice });
        // Bob deposits 20 tokens at block 314
        await calculator.deposit( 314, bob, '20', { from: bob });
        // Carol deposits 30 tokens at block 318
        await calculator.deposit( 318, carol, '30', { from: carol });
        // Alice deposits 10 more tokens at block 320. At this point:
        //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
        await calculator.deposit( 320, alice, '10', { from: alice });
        assert.equal((await calculator.rewardOf(alice)).valueOf(), '5666');
        assert.equal((await calculator.rewardOf(bob)).valueOf(), '0');
        assert.equal((await calculator.rewardOf(carol)).valueOf(), '0');
        assert.equal((await calculator.remainReward()).valueOf(), '4334');

        assert.equal((await calculator.amountOf(alice)).valueOf(), '20');
        assert.equal((await calculator.amountOf(bob)).valueOf(), '20');
        assert.equal((await calculator.amountOf(carol)).valueOf(), '30');

        // Bob withdraws 5 tokens at block 330. At this point:
        //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
        await calculator.withdraw( 330, bob, '5', { from: bob });
        assert.equal((await calculator.rewardOf(alice)).valueOf(), '5666');
        assert.equal((await calculator.rewardOf(bob)).valueOf(), '6190');
        assert.equal((await calculator.rewardOf(carol)).valueOf(), '0');
        assert.equal((await calculator.remainReward()).valueOf(), '8144');

        assert.equal((await calculator.amountOf(alice)).valueOf(), '20');
        assert.equal((await calculator.amountOf(bob)).valueOf(), '15');
        assert.equal((await calculator.amountOf(carol)).valueOf(), '30');

        // Alice withdraws 20 tokens at block 340.
        // Bob withdraws 15 tokens at block 350.
        // Carol withdraws 30 tokens at block 360.
        await calculator.withdraw( 340, alice, '20', { from: alice });
        await calculator.withdraw( 350, bob, '15', { from: bob });
        await calculator.withdraw( 360, carol, '30', { from: carol });
        //assert.equal((await calculator.amount()).valueOf(), '50000');
        // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
        assert.equal((await calculator.rewardOf(alice)).valueOf(), '11600');
        // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
        assert.equal((await calculator.rewardOf(bob)).valueOf(), '11831');
        // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
        assert.equal((await calculator.rewardOf(carol)).valueOf(), '26568');

        assert.equal((await calculator.amountOf(alice)).valueOf(), '0');
        assert.equal((await calculator.amountOf(bob)).valueOf(), '0');
        assert.equal((await calculator.amountOf(carol)).valueOf(), '0');
    });

    it('simple staking', async () => {
        let [ admin, ac1, ac2, ac3 ] = [alice,alice,bob,carol];
        const [lina,linaproxy] = await CreateLina(admin);
        const kLnAccessControl = await LnAccessControl.new(admin);
        const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
        const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();

        let cur_block = await time.latestBlock();
        const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, 1000, cur_block, cur_block.add(toBN(1000)));
        await kLnAccessControl.SetRoles( roleKey, [staking.address], [true] );

        let mintAmount = toBN(1000);
        await lina.mint(ac1, mintAmount, { from: admin });
        await lina.mint(ac2, mintAmount, { from: admin });
        await lina.mint(ac3, mintAmount, { from: admin });

        await linaproxy.approve(staking.address, mintAmount, {from: ac1});
        await linaproxy.approve(staking.address, mintAmount, {from: ac2});
        await linaproxy.approve(staking.address, mintAmount, {from: ac3});

        let blocktime = await currentTime();

        await kLnLinearStakingStorage.setStakingPeriod(blocktime-1, blocktime-1 + 8 * 3600*24*7);
        await staking.setMinStakingAmount( 0 );


        // 100 per block farming rate starting at block 300 with bonus until block 1000
        let start_block = await time.latestBlock();

        // Alice deposits 10 tokens at block 310
        await staking.staking( '10', { from: alice });
        // Bob deposits 20 tokens at block 314
        await time.advanceBlockTo( start_block.add(toBN(4)));

        await staking.staking(  '20', { from: bob });

        await time.advanceBlockTo( start_block.add(toBN(8)));
        // Carol deposits 30 tokens at block 318
        await staking.staking(  '30', { from: carol });
        // Alice deposits 10 more tokens at block 320. At this point:
        //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
        await time.advanceBlockTo(start_block.add(toBN(10)));
        await staking.staking( '10', { from: alice });
        assert.equal((await staking.rewardOf(alice)).valueOf(), '5666');
        assert.equal((await staking.rewardOf(bob)).valueOf(), '0');
        assert.equal((await staking.rewardOf(carol)).valueOf(), '0');
        assert.equal((await staking.remainReward()).valueOf(), '4334');

        assert.equal((await staking.calcReward( start_block.add(toBN(10)), alice)).valueOf(), '5666');
        assert.equal((await staking.calcReward( start_block.add(toBN(10)), bob)).valueOf(), '3333');
        assert.equal((await staking.calcReward( start_block.add(toBN(10)), carol)).valueOf(), '1000');

        assert.equal((await staking.amountOf(alice)).valueOf(), '20');
        assert.equal((await staking.amountOf(bob)).valueOf(), '20');
        assert.equal((await staking.amountOf(carol)).valueOf(), '30');

        // Bob withdraws 5 tokens at block 330. At this point:
        //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
        await time.advanceBlockTo(start_block.add(toBN(20)));
        await staking.cancelStaking( '5', { from: bob });
        assert.equal((await staking.rewardOf(alice)).valueOf(), '5666');
        assert.equal((await staking.rewardOf(bob)).valueOf(), '6190');
        assert.equal((await staking.rewardOf(carol)).valueOf(), '0');
        assert.equal((await staking.remainReward()).valueOf(), '8144');

        assert.equal((await staking.calcReward( start_block.add(toBN(20)), alice)).valueOf(), '8523');
        assert.equal((await staking.calcReward( start_block.add(toBN(20)), bob)).valueOf(), '6190');
        assert.equal((await staking.calcReward( start_block.add(toBN(20)), carol)).valueOf(), '5286');

        assert.equal((await staking.amountOf(alice)).valueOf(), '20');
        assert.equal((await staking.amountOf(bob)).valueOf(), '15');
        assert.equal((await staking.amountOf(carol)).valueOf(), '30');

        // Alice withdraws 20 tokens at block 340.
        // Bob withdraws 15 tokens at block 350.
        // Carol withdraws 30 tokens at block 360.
        await time.advanceBlockTo(start_block.add(toBN(30)));
        await staking.cancelStaking( '20', { from: alice });

        await time.advanceBlockTo(start_block.add(toBN(40)));
        await staking.cancelStaking( '15', { from: bob });

        await time.advanceBlockTo(start_block.add(toBN(50)));
        await staking.cancelStaking( '30', { from: carol });
        //assert.equal((await calculator.amount()).valueOf(), '50000');
        // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
        assert.equal((await staking.rewardOf(alice)).valueOf(), '11600');
        // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
        assert.equal((await staking.rewardOf(bob)).valueOf(), '11831');
        // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
        assert.equal((await staking.rewardOf(carol)).valueOf(), '26568');

        // alice = 8523 + 10*2/6.5*1000
        assert.equal((await staking.calcReward( start_block.add(toBN(50)), alice)).valueOf(), '11600');
        // bob = 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
        assert.equal((await staking.calcReward( start_block.add(toBN(50)), bob)).valueOf(), '11831');
        // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
        assert.equal((await staking.calcReward( start_block.add(toBN(50)), carol)).valueOf(), '26568');

        assert.equal((await staking.amountOf(alice)).valueOf(), '0');
        assert.equal((await staking.amountOf(bob)).valueOf(), '0');
        assert.equal((await staking.amountOf(carol)).valueOf(), '0');
    });

    it('simple staking with history data', async () => {
        let [ admin, ac1, ac2, ac3 ] = [alice,alice,bob,carol];
        const [lina,linaproxy] = await CreateLina(admin);
        const kLnAccessControl = await LnAccessControl.new(admin);
        const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
        const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();
        
        const kHelperPushStakingData = await HelperPushStakingData.new(admin);

        let cur_block = await time.latestBlock();
        const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, toUnit(100), cur_block, cur_block.add(toBN(100)));
        await kLnAccessControl.SetRoles( roleKey, [staking.address, kHelperPushStakingData.address], [true, true] );

        let mintAmount = toUnit(1000);
        await lina.mint(ac1, mintAmount, { from: admin });
        await lina.mint(ac2, mintAmount, { from: admin });
        await lina.mint(ac3, mintAmount, { from: admin });

        await linaproxy.approve(staking.address, mintAmount, {from: ac1});
        await linaproxy.approve(staking.address, mintAmount, {from: ac2});
        await linaproxy.approve(staking.address, mintAmount, {from: ac3});

        let oldStartTime = await kLnLinearStakingStorage.stakingStartTime(); //standard time
        let oldEndTime = await kLnLinearStakingStorage.stakingEndTime();
        let claimtime = await staking.claimRewardLockTime();
        let claimwaittime = oldEndTime - claimtime;

        let blocktime = await currentTime();
        let newStartTime = blocktime-1;// test time
        let newEndTime = blocktime-1 + 8 * oneWeek;
        let startclaimtime = newEndTime + claimwaittime;
        await kLnLinearStakingStorage.setStakingPeriod(newStartTime, newEndTime);
        await staking.setRewardLockTime(startclaimtime);
        
        console.log("set starttime, endtime", newStartTime, newEndTime);

        await staking.setMinStakingAmount( 0 );

        //load history data
        let users = [];
        let amounts = [];
        let stakingtime = [];
        
        let totalOld = new BN(0);
        function pushStakingData(_user, _amount, _stakingtime) {
            users.push(_user);
            amounts.push(_amount);
            stakingtime.push(_stakingtime-oldStartTime+newStartTime); // fix to new test time
            totalOld = totalOld.add(_amount);
        }

        let stakingbalance = {};
        let jsonObj = JSON.parse(fs.readFileSync("./test/stakingBlock.log"));
        let maxsize = jsonObj.length > 41 ? 41 : jsonObj.length;
        
        for (let i=0; i<maxsize; i++) {
            let item = jsonObj[i]
            if (item[0] == "Staking") {
                let [,_user, _amount, _stakingtime] = item;
                _amount = new BN(_amount);
                pushStakingData(_user, _amount, _stakingtime);
                
                if (stakingbalance[_user] == null) {
                    stakingbalance[_user] = _amount;
                } else {
                    stakingbalance[_user] = stakingbalance[_user].add(_amount);
                    //console.log(_user, _amount.toString());
                }
            }
        }

        //test data
        pushStakingData(ac1, toUnit(10), newStartTime + oneDay);
        pushStakingData(ac2, toUnit(20), newStartTime + oneDay);

        await lina.mint(staking.address, totalOld, { from: admin });
        
        while(users.length) {
            let u = users.splice(0,50);
            let a = amounts.splice(0,50);
            let t = stakingtime.splice(0,50);
            await kHelperPushStakingData.pushStakingData(kLnLinearStakingStorage.address, u, a, t);
        }
        
        let arrayTotal = await kLnLinearStakingStorage.weekTotalStaking();
        let blockNumber = await curBlockNumber();

        // LnLinearStaking.address, 
        await staking.migrationsOldStaking(kLnLinearStakingStorage.address, arrayTotal[7], blockNumber);
        
        let stakinger = Object.keys(stakingbalance);
        //...
        assert.equal(await staking.stakingBalanceOf(stakinger[2]), stakingbalance[stakinger[2]].toString());
        assert.equal(await staking.stakingBalanceOf(stakinger[7]), stakingbalance[stakinger[7]].toString());

        //console.log(stakingbalance["0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"].toString()); //6000000000000000000000000
        // address for log file.
        assert.equal(await staking.stakingBalanceOf("0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"), stakingbalance["0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"].toString());

        // staking and cancel staking test
        let v = await linaproxy.balanceOf(ac1);
        await staking.staking( toUnit(10), { from: ac1 });
        assert.equal(await linaproxy.balanceOf(ac1), v.sub(toUnit(10)).toString() );
        assert.equal(await staking.amountOf(ac1), toUnit(10).toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), toUnit(10).toString());
        assert.equal(await staking.stakingBalanceOf(ac1), toUnit(20).toString());
        
        v = await linaproxy.balanceOf(ac1);
        await staking.cancelStaking( toUnit(5), { from: ac1 } );
        assert.equal(await linaproxy.balanceOf(ac1), v.add(toUnit(5)).toString() );
        assert.equal(await staking.amountOf(ac1), toUnit(5).toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), toUnit(10).toString());
        assert.equal(await staking.stakingBalanceOf(ac1), toUnit(15).toString());

        await staking.cancelStaking( toUnit(15), { from: ac1 } );
        assert.equal(await staking.amountOf(ac1), toUnit(0).toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), toUnit(0).toString());
        assert.equal(await staking.stakingBalanceOf(ac1), toUnit(0).toString());
        // now: totalOld = totalOld - 10

        // reward test
        blocktime = await currentTime();
        console.log("curtime", blocktime, "end time", (await kLnLinearStakingStorage.stakingEndTime()).toString());
        
        let start_block = await time.latestBlock();

        await time.advanceBlockTo( start_block.add(toBN(30)));
        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
        await staking.staking( toUnit(20), { from: ac1 });

        await time.advanceBlockTo( start_block.add(toBN(60)));
        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
        await staking.staking( toUnit(20), { from: ac3 });

        //set time to end
        blocktime = await currentTime();

        await time.advanceBlockTo( start_block.add(toBN(100)));
        let stakingEndTime = await kLnLinearStakingStorage.stakingEndTime();
        if (blocktime < stakingEndTime) {
            await web3.currentProvider.send({method: "evm_increaseTime", params: [stakingEndTime-blocktime+1]}, rpcCallback);
        }

        // cancel on staking end, ac1
        let beforecsb = await linaproxy.balanceOf(ac1);
        await staking.cancelStaking( toUnit(30), { from: ac1 } );
        assert.equal( (await linaproxy.balanceOf(ac1)).sub(beforecsb), toUnit(20).toString() );

        let newclaimtime = await staking.claimRewardLockTime();
        if (blocktime <= newclaimtime) {
            await web3.currentProvider.send({method: "evm_increaseTime", params: [newclaimtime-blocktime+2]}, rpcCallback);
        }

        // before claim
        await lina.mint(staking.address, toUnit(10000), { from: admin });// TODO: calc total reward

        // cancel after claiming time ac2
        beforecsb = await linaproxy.balanceOf(ac2);
        await staking.cancelStaking( toUnit(30), { from: ac2 } );
        assert.equal( (await linaproxy.balanceOf(ac2)).sub(beforecsb).cmp(toUnit(20)), 0);

        let balance1 = await linaproxy.balanceOf(ac1);
        await staking.claim( {from: ac1} );
        let balance1AfterClaim1 = await linaproxy.balanceOf(ac1);
        let claim1 = balance1AfterClaim1.sub(balance1);
        assert.equal(claim1.cmp(0), 1);
        try {
            await staking.claim( {from: ac1} );// should not success??
        } catch(e) {}
        let balance1AfterClaim11 = await linaproxy.balanceOf(ac1);
        assert.equal(balance1AfterClaim1.cmp(balance1AfterClaim11), 0);

        let balance2 = await linaproxy.balanceOf(ac2);
        await staking.claim( {from: ac2} );
        let balance1AfterClaim2 = await linaproxy.balanceOf(ac2);
        let claim2 = balance1AfterClaim2.sub(balance2);
        assert.equal(claim2.cmp(0), 1);
        assert.equal(claim2.cmp(claim1), 1);
        
        let balance3 = await linaproxy.balanceOf(ac3);
        await staking.claim( {from: ac3} );
        let balance1AfterClaim3 = await linaproxy.balanceOf(ac3);
        let claim3 = balance1AfterClaim3.sub(balance3);
        assert.equal(claim3.cmp(0), 1);
        assert.equal(claim3.sub(toUnit(20)).cmp(claim1), -1);
        console.log([claim1,claim2, claim3].map(x=>x.toString()));
        console.log([balance1AfterClaim1,balance1AfterClaim2, balance1AfterClaim3].map(x=>x.toString()));

        //
        async function reclaim(ac) {
            let balance = await linaproxy.balanceOf(ac);
            await staking.claim( {from: ac} );
            await staking.cancelStaking( toUnit(30), {from: ac} );
            assert.equal( (await linaproxy.balanceOf(ac)).cmp(balance), 0 );
        }
        await reclaim(ac1);
        await reclaim(ac2);
        await reclaim(ac3);
        /**
[ '3431421014999999', '5452670740000000', '20001378835320000000' ]
[
  '1010003431421014999999',
  '1020005452670740000000',
  '1000001378835320000000'
]
         */
    });
});
