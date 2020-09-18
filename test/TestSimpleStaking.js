const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LnRewardCalculator = artifacts.require('LnRewardCalculator');

contract('LnRewardCalculator', ([alice, bob, carol, dev, minter]) => {

    it('reward calc test', async () => {
        // 100 per block farming rate starting at block 300 with bonus until block 1000
        let calculator = await LnRewardCalculator.new('1000', '300', { from: alice });
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


});
