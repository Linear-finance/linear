const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LnRewardCalculator = artifacts.require('LnRewardCalculator');
const LnRewardCalculatorTest = artifacts.require('LnRewardCalculatorTest');
const LnSimpleStaking = artifacts.require('LnSimpleStaking');

const LinearFinance = artifacts.require("LinearFinance");
const LnLinearStakingStorage = artifacts.require("LnLinearStakingStorage");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnLinearStaking = artifacts.require("LnLinearStaking");
const LnAddressStorage = artifacts.require("LnAddressStorage");
//const testAddressCache = artifacts.require("testAddressCache");
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
        const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, 1000, cur_block, cur_block.add(toBN(1000)), 0 );
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

        assert.equal((await staking.amountOf(alice)).valueOf(), '0');
        assert.equal((await staking.amountOf(bob)).valueOf(), '0');
        assert.equal((await staking.amountOf(carol)).valueOf(), '0');
    });

});
