const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LnRewardCalculator = artifacts.require('LnRewardCalculator');
const LnRewardCalculatorTest = artifacts.require('LnRewardCalculatorTest');
const LnSimpleStaking = artifacts.require('LnSimpleStaking');
const LnSimpleStakingNew = artifacts.require('LnSimpleStakingNew');

const LinearFinance = artifacts.require("LinearFinance");
const LnLinearStakingStorage = artifacts.require("LnLinearStakingStorage");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnLinearStaking = artifacts.require("LnLinearStaking");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const HelperPushStakingData = artifacts.require("HelperPushStakingData");
const MultiSigForTransferFunds = artifacts.require("MultiSigForTransferFunds");

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

//     it('reward calc test', async () => {
//         // 100 per block farming rate starting at block 300 with bonus until block 1000
//         let calculator = await LnRewardCalculatorTest.new('1000', '300', { from: alice });
//         // Alice deposits 10 tokens at block 310
//         await calculator.deposit( 310, alice, '10', { from: alice });
//         // Bob deposits 20 tokens at block 314
//         await calculator.deposit( 314, bob, '20', { from: bob });
//         // Carol deposits 30 tokens at block 318
//         await calculator.deposit( 318, carol, '30', { from: carol });
//         // Alice deposits 10 more tokens at block 320. At this point:
//         //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
//         await calculator.deposit( 320, alice, '10', { from: alice });
//         assert.equal((await calculator.rewardOf(alice)).valueOf(), '5666');
//         assert.equal((await calculator.rewardOf(bob)).valueOf(), '0');
//         assert.equal((await calculator.rewardOf(carol)).valueOf(), '0');
//         assert.equal((await calculator.remainReward()).valueOf(), '4334');

//         assert.equal((await calculator.amountOf(alice)).valueOf(), '20');
//         assert.equal((await calculator.amountOf(bob)).valueOf(), '20');
//         assert.equal((await calculator.amountOf(carol)).valueOf(), '30');

//         // Bob withdraws 5 tokens at block 330. At this point:
//         //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
//         await calculator.withdraw( 330, bob, '5', { from: bob });
//         assert.equal((await calculator.rewardOf(alice)).valueOf(), '5666');
//         assert.equal((await calculator.rewardOf(bob)).valueOf(), '6190');
//         assert.equal((await calculator.rewardOf(carol)).valueOf(), '0');
//         assert.equal((await calculator.remainReward()).valueOf(), '8144');

//         assert.equal((await calculator.amountOf(alice)).valueOf(), '20');
//         assert.equal((await calculator.amountOf(bob)).valueOf(), '15');
//         assert.equal((await calculator.amountOf(carol)).valueOf(), '30');

//         // Alice withdraws 20 tokens at block 340.
//         // Bob withdraws 15 tokens at block 350.
//         // Carol withdraws 30 tokens at block 360.
//         await calculator.withdraw( 340, alice, '20', { from: alice });
//         await calculator.withdraw( 350, bob, '15', { from: bob });
//         await calculator.withdraw( 360, carol, '30', { from: carol });
//         //assert.equal((await calculator.amount()).valueOf(), '50000');
//         // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
//         assert.equal((await calculator.rewardOf(alice)).valueOf(), '11600');
//         // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
//         assert.equal((await calculator.rewardOf(bob)).valueOf(), '11831');
//         // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
//         assert.equal((await calculator.rewardOf(carol)).valueOf(), '26568');

//         assert.equal((await calculator.amountOf(alice)).valueOf(), '0');
//         assert.equal((await calculator.amountOf(bob)).valueOf(), '0');
//         assert.equal((await calculator.amountOf(carol)).valueOf(), '0');
//     });

//     it('simple staking', async () => {
//         let [ admin, ac1, ac2, ac3 ] = [alice,alice,bob,carol];
//         const [lina,linaproxy] = await CreateLina(admin);
//         const kLnAccessControl = await LnAccessControl.new(admin);
//         const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
//         const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();

//         let cur_block = await time.latestBlock();
//         const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, 1000, cur_block, cur_block.add(toBN(1000)));
//         await kLnAccessControl.SetRoles( roleKey, [staking.address], [true] );

//         let mintAmount = toBN(1000);
//         await lina.mint(ac1, mintAmount, { from: admin });
//         await lina.mint(ac2, mintAmount, { from: admin });
//         await lina.mint(ac3, mintAmount, { from: admin });

//         await linaproxy.approve(staking.address, mintAmount, {from: ac1});
//         await linaproxy.approve(staking.address, mintAmount, {from: ac2});
//         await linaproxy.approve(staking.address, mintAmount, {from: ac3});

//         let blocktime = await currentTime();

//         await kLnLinearStakingStorage.setStakingPeriod(blocktime-1, blocktime-1 + 8 * 3600*24*7);
//         await staking.setMinStakingAmount( 0 );


//         // 100 per block farming rate starting at block 300 with bonus until block 1000
//         let start_block = await time.latestBlock();

//         // Alice deposits 10 tokens at block 310
//         await staking.staking( '10', { from: alice });
//         // Bob deposits 20 tokens at block 314
//         await time.advanceBlockTo( start_block.add(toBN(4)));

//         await staking.staking(  '20', { from: bob });

//         await time.advanceBlockTo( start_block.add(toBN(8)));
//         // Carol deposits 30 tokens at block 318
//         await staking.staking(  '30', { from: carol });
//         // Alice deposits 10 more tokens at block 320. At this point:
//         //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
//         await time.advanceBlockTo(start_block.add(toBN(10)));
//         await staking.staking( '10', { from: alice });
//         assert.equal((await staking.rewardOf(alice)).valueOf(), '5666');
//         assert.equal((await staking.rewardOf(bob)).valueOf(), '0');
//         assert.equal((await staking.rewardOf(carol)).valueOf(), '0');
//         assert.equal((await staking.remainReward()).valueOf(), '4334');

//         assert.equal((await staking.calcReward( start_block.add(toBN(10)), alice)).valueOf(), '5666');
//         assert.equal((await staking.calcReward( start_block.add(toBN(10)), bob)).valueOf(), '3333');
//         assert.equal((await staking.calcReward( start_block.add(toBN(10)), carol)).valueOf(), '1000');

//         assert.equal((await staking.amountOf(alice)).valueOf(), '20');
//         assert.equal((await staking.amountOf(bob)).valueOf(), '20');
//         assert.equal((await staking.amountOf(carol)).valueOf(), '30');

//         // Bob withdraws 5 tokens at block 330. At this point:
//         //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
//         await time.advanceBlockTo(start_block.add(toBN(20)));
//         await staking.cancelStaking( '5', { from: bob });
//         assert.equal((await staking.rewardOf(alice)).valueOf(), '5666');
//         assert.equal((await staking.rewardOf(bob)).valueOf(), '6190');
//         assert.equal((await staking.rewardOf(carol)).valueOf(), '0');
//         assert.equal((await staking.remainReward()).valueOf(), '8144');

//         assert.equal((await staking.calcReward( start_block.add(toBN(20)), alice)).valueOf(), '8523');
//         assert.equal((await staking.calcReward( start_block.add(toBN(20)), bob)).valueOf(), '6190');
//         assert.equal((await staking.calcReward( start_block.add(toBN(20)), carol)).valueOf(), '5286');

//         assert.equal((await staking.amountOf(alice)).valueOf(), '20');
//         assert.equal((await staking.amountOf(bob)).valueOf(), '15');
//         assert.equal((await staking.amountOf(carol)).valueOf(), '30');

//         // Alice withdraws 20 tokens at block 340.
//         // Bob withdraws 15 tokens at block 350.
//         // Carol withdraws 30 tokens at block 360.
//         await time.advanceBlockTo(start_block.add(toBN(30)));
//         await staking.cancelStaking( '20', { from: alice });

//         await time.advanceBlockTo(start_block.add(toBN(40)));
//         await staking.cancelStaking( '15', { from: bob });

//         await time.advanceBlockTo(start_block.add(toBN(50)));
//         await staking.cancelStaking( '30', { from: carol });
//         //assert.equal((await calculator.amount()).valueOf(), '50000');
//         // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
//         assert.equal((await staking.rewardOf(alice)).valueOf(), '11600');
//         // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
//         assert.equal((await staking.rewardOf(bob)).valueOf(), '11831');
//         // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
//         assert.equal((await staking.rewardOf(carol)).valueOf(), '26568');

//         // alice = 8523 + 10*2/6.5*1000
//         assert.equal((await staking.calcReward( start_block.add(toBN(50)), alice)).valueOf(), '11600');
//         // bob = 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
//         assert.equal((await staking.calcReward( start_block.add(toBN(50)), bob)).valueOf(), '11831');
//         // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
//         assert.equal((await staking.calcReward( start_block.add(toBN(50)), carol)).valueOf(), '26568');

//         assert.equal((await staking.amountOf(alice)).valueOf(), '0');
//         assert.equal((await staking.amountOf(bob)).valueOf(), '0');
//         assert.equal((await staking.amountOf(carol)).valueOf(), '0');
//     });

//     it('simple staking with history data', async () => {
//         let [ admin, ac1, ac2, ac3 ] = [alice,alice,bob,carol];
//         const [lina,linaproxy] = await CreateLina(admin);
//         const kLnAccessControl = await LnAccessControl.new(admin);
//         const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
//         const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();
        
//         const kHelperPushStakingData = await HelperPushStakingData.new(admin);

//         let cur_block = await time.latestBlock();
//         const rewardPerBlock = toUnit(1000);
//         let startRewardBn = cur_block;
//         let endRewardBn = startRewardBn.add(toBN(100));
//         const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, rewardPerBlock, startRewardBn, endRewardBn);
//         await kLnAccessControl.SetRoles( roleKey, [staking.address, kHelperPushStakingData.address], [true, true] );

//         let mintAmount = toUnit(1000);
//         await lina.mint(ac1, mintAmount, { from: admin });
//         await lina.mint(ac2, mintAmount, { from: admin });
//         await lina.mint(ac3, mintAmount, { from: admin });

//         await linaproxy.approve(staking.address, mintAmount, {from: ac1});
//         await linaproxy.approve(staking.address, mintAmount, {from: ac2});
//         await linaproxy.approve(staking.address, mintAmount, {from: ac3});

//         let oldStartTime = await kLnLinearStakingStorage.stakingStartTime(); //standard time
//         let oldEndTime = await kLnLinearStakingStorage.stakingEndTime();
//         let claimtime = await staking.claimRewardLockTime();
//         let claimwaittime = oldEndTime - claimtime;

//         let blocktime = await currentTime();
//         let newStartTime = blocktime-1;// test time
//         let newEndTime = blocktime-1 + 8 * oneWeek;
//         let startclaimtime = newEndTime + claimwaittime;
//         await kLnLinearStakingStorage.setStakingPeriod(newStartTime, newEndTime);
//         await staking.setRewardLockTime(startclaimtime);
        
//         console.log("set starttime, endtime", newStartTime, newEndTime);
//         console.log("startRewardBn, endRewardBn", startRewardBn.toString(), endRewardBn.toString());

//         await staking.setMinStakingAmount( 0 );

//         //load history data
//         let users = [];
//         let amounts = [];
//         let stakingtime = [];
        
//         let totalOld = toBN(0);
//         function pushStakingData(_user, _amount, _stakingtime) {
//             users.push(_user);
//             amounts.push(_amount);
//             stakingtime.push(_stakingtime-oldStartTime+newStartTime); // fix to new test time
//             totalOld = totalOld.add(_amount);
//             //console.log("stakingtime", stakingtime[stakingtime.length-1].toString());
//         }

//         let stakingbalance = {};
//         let jsonObj = JSON.parse(fs.readFileSync("./test/stakingBlock.log"));
//         let maxsize = jsonObj.length > 41 ? 41 : jsonObj.length;
        
//         for (let i=0; i<maxsize; i++) {
//             let item = jsonObj[i]
//             if (item[0] == "Staking") {
//                 let [,_user, _amount, _stakingtime] = item;
//                 _amount = new BN(_amount);
//                 pushStakingData(_user, _amount, _stakingtime);
                
//                 if (stakingbalance[_user] == null) {
//                     stakingbalance[_user] = _amount;
//                 } else {
//                     stakingbalance[_user] = stakingbalance[_user].add(_amount);
//                 }
//             }
//         }

//         //test data
//         let ac1OldStaking = toUnit(10);
//         let ac2OldStaking = toUnit(20);
//         pushStakingData(ac1, ac1OldStaking, oldStartTime.add(toBN(oneDay+1)).toNumber() );
//         pushStakingData(ac2, ac2OldStaking, oldStartTime.add(toBN(oneDay+2)).toNumber() );

//         await lina.mint(staking.address, totalOld, { from: admin });
        
//         while(users.length) {
//             let u = users.splice(0,50);
//             let a = amounts.splice(0,50);
//             let t = stakingtime.splice(0,50);
//             await kHelperPushStakingData.pushStakingData(kLnLinearStakingStorage.address, u, a, t);
//         }
//         let stakinger = Object.keys(stakingbalance);
//         //... check push old staking data
//         assert.equal(await staking.stakingBalanceOf(stakinger[2]), stakingbalance[stakinger[2]].toString());
//         assert.equal(await staking.stakingBalanceOf(stakinger[7]), stakingbalance[stakinger[7]].toString());
//         // address for log file.
//         assert.equal(await staking.stakingBalanceOf("0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"), stakingbalance["0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"].toString());
        
//         // calc old staking reward
//         let arrayTotal = await kLnLinearStakingStorage.weekTotalStaking();
//         let oldStakingAddress = kLnLinearStakingStorage.address; // 用来记录旧staking方法的分配
//         let oldStakingAmount = arrayTotal[7];
//         let oldStakingBlockNumber = startRewardBn;
//         //console.log(totalOld.toString(), oldStakingAmount.toString()); 
//         assert.equal(totalOld.toString(), oldStakingAmount.toString());
//         await staking.migrationsOldStaking(oldStakingAddress, oldStakingAmount, oldStakingBlockNumber);

//         //
//         let rewardCalcHelper = {
//             stakingLine : []
//         }
//         rewardCalcHelper.RegStaking = function(user, amount, blockheight, staking) {
//             this.stakingLine.push({user:user, amount:amount, blockheight:blockheight, staking: staking});
//             let l = this.stakingLine.length;
//             assert.ok(blockheight >= this.stakingLine[l-1].blockheight, "test case error, blockheight");
//         }
//         let tonumber = oldStakingBlockNumber.toNumber();
//         rewardCalcHelper.RegStaking("others", oldStakingAmount.sub(ac1OldStaking).sub(ac2OldStaking), tonumber, true);
//         rewardCalcHelper.RegStaking(ac1, ac1OldStaking, tonumber, true);
//         rewardCalcHelper.RegStaking(ac2, ac2OldStaking, tonumber, true);

//         //
//         let blockNumber = await curBlockNumber();
//         let passBlock = blockNumber - oldStakingBlockNumber.toNumber();
//         let curOldReward = await staking.calcReward(blockNumber, oldStakingAddress);
//         //console.log("calcReward oldStakingAddress", (await staking.calcReward(blockNumber, oldStakingAddress)).toString(), "passBlock", passBlock );
//         //console.log("rewardPerBlock", rewardPerBlock.toString());
//         let calcOldReward = rewardPerBlock.mul(new BN(passBlock));
//         let delta = calcOldReward.sub( curOldReward );
//         assert.equal( delta.cmp(toUnit(0)), 1 );
//         console.log("total old reward delta.abs()", delta.abs().toString());
//         assert.equal( delta.abs().cmp(toUnit("0.000001")), -1);

//         // calc old reward.
//         let ac1Reward = await staking.getTotalReward(blockNumber, ac1);
//         let ac2Reward = await staking.getTotalReward(blockNumber, ac2);
//         //console.log( [ac1OldStaking, oldStakingAmount, calcOldReward].map( x=>x.toString()) );
//         let calcAc1Reward1 = ac1OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20)); // 提高精度
//         let calcAc2Reward1 = ac2OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20));
//         //console.log([ac1Reward, ac2Reward, calcAc1Reward1, calcAc2Reward1].map( x=>x.toString()));

//         assert.equal( ac1Reward.sub( calcAc1Reward1 ).abs().cmp(toUnit("0.000001")), -1 ); /// errr
//         assert.equal( ac2Reward.sub( calcAc2Reward1 ).abs().cmp(toUnit("0.000001")), -1 );

//         // staking and cancel staking test
//         let ac1NewStakingHeight1 = await curBlockNumber();
//         let ac1Staking1 = toUnit(10);
//         let v = await linaproxy.balanceOf(ac1);
//         await staking.staking( ac1Staking1, { from: ac1 });
//         rewardCalcHelper.RegStaking(ac1, ac1Staking1, ac1NewStakingHeight1, true);
//         assert.equal(await linaproxy.balanceOf(ac1), v.sub(ac1Staking1).toString() );
//         assert.equal(await staking.amountOf(ac1), ac1Staking1.toString());
//         assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1OldStaking.toString());
//         assert.equal(await staking.stakingBalanceOf(ac1), ac1Staking1.add(ac1OldStaking).toString());
        
//         // reward check.
        
//         v = await linaproxy.balanceOf(ac1);
//         let ac1CancelHeight1 = await curBlockNumber();
//         let ac1Cancel1 = toUnit(5);
//         await staking.cancelStaking( ac1Cancel1, { from: ac1 } );
//         rewardCalcHelper.RegStaking(ac1, ac1Cancel1, ac1CancelHeight1, false);
//         assert.equal(await linaproxy.balanceOf(ac1), v.add(ac1Cancel1).toString() );
//         assert.equal(await staking.amountOf(ac1), ac1Cancel1.toString());
//         assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1OldStaking.toString());
//         assert.equal(await staking.stakingBalanceOf(ac1), ac1Staking1.add(ac1OldStaking).sub(ac1Cancel1).toString());

//         // ac1 cancel reward 1
//         let rewardTotalstaking = totalOld.add(ac1Staking1); // percentage
//         let ac1CancelReward1 = ac1Cancel1.mul(toBN(1e20)).div(rewardTotalstaking).mul( toBN(ac1CancelHeight1-ac1NewStakingHeight1).mul(rewardPerBlock) ).div(toBN(1e20));

//         let ac1CancelHeight2 = await curBlockNumber();
//         let ac1Cancel2 = toUnit(15);
//         let ac1stakingbalance = ac1Staking1.add(ac1OldStaking).sub(ac1Cancel1).sub(ac1Cancel2);
//         if (ac1stakingbalance.cmp(toBN(0)) == -1)
//             ac1stakingbalance = toBN(0);
//         let ac1oldstakingbalance = ac1stakingbalance.cmp(ac1OldStaking) == 1? ac1OldStaking: ac1stakingbalance;
//         await staking.cancelStaking( ac1Cancel2, { from: ac1 } );
//         rewardCalcHelper.RegStaking(ac1, ac1Cancel2, ac1CancelHeight2, false);
//         assert.equal(await staking.amountOf(ac1), toUnit(0).toString());
//         assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1oldstakingbalance.toString());
//         assert.equal(await staking.stakingBalanceOf(ac1), ac1stakingbalance.toString());
        
//         // ac1 cancel reward 2
//         rewardTotalstaking = totalOld.add(ac1Staking1).sub(ac1Cancel1);
//         let ac1CancelReward2 = toUnit(5).mul(toBN(1e20)).div(rewardTotalstaking).mul( toBN(ac1CancelHeight2-ac1NewStakingHeight1).mul(rewardPerBlock) ).div(toBN(1e20));
//         let ac1CancelReward3 = toUnit(10).mul(toBN(1e20)).div(totalOld).mul( toBN(ac1CancelHeight2-oldStakingBlockNumber).mul(rewardPerBlock) ).div(toBN(1e20));

//         totalOld = totalOld.sub(toUnit(10));// sub ac1 cancel2

//         // reward test
//         blocktime = await currentTime();
//         console.log("curtime", blocktime, "end time", (await kLnLinearStakingStorage.stakingEndTime()).toString());
        
//         let start_block = await time.latestBlock();

//         await time.advanceBlockTo( start_block.add(toBN(30)));
//         await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
//         let ac1NewStakingHeight2 = await curBlockNumber();
//         await staking.staking( toUnit(20), { from: ac1 });
//         rewardCalcHelper.RegStaking(ac1, toUnit(20), ac1NewStakingHeight2, true);

//         await time.advanceBlockTo( start_block.add(toBN(60)));
//         await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
//         let ac3StakingHeight1 = await curBlockNumber();
//         await staking.staking( toUnit(20), { from: ac3 });
//         rewardCalcHelper.RegStaking(ac3, toUnit(20), ac3StakingHeight1, true);

//         //set time to end
//         blocktime = await currentTime();

//         await time.advanceBlockTo( start_block.add(toBN(100)));
//         let stakingEndTime = await kLnLinearStakingStorage.stakingEndTime();
//         if (blocktime < stakingEndTime) {
//             await web3.currentProvider.send({method: "evm_increaseTime", params: [stakingEndTime-blocktime+1]}, rpcCallback);
//         }

//         // cancel on staking end, ac1
//         let beforecsb = await linaproxy.balanceOf(ac1);
//         await staking.cancelStaking( toUnit(30), { from: ac1 } );
//         rewardCalcHelper.RegStaking(ac1, toUnit(20), endRewardBn.toNumber(), false);
//         assert.equal( (await linaproxy.balanceOf(ac1)).sub(beforecsb), toUnit(20).toString() );

//         let newclaimtime = await staking.claimRewardLockTime();
//         if (blocktime <= newclaimtime) {
//             await web3.currentProvider.send({method: "evm_increaseTime", params: [newclaimtime-blocktime+2]}, rpcCallback);
//         }

//         // before claim
//         await lina.mint(staking.address, toUnit(10000), { from: admin });// TODO: calc total reward

//         // cancel after claiming time ac2
//         beforecsb = await linaproxy.balanceOf(ac2);
//         await staking.cancelStaking( toUnit(30), { from: ac2 } );
//         assert.equal( (await linaproxy.balanceOf(ac2)).sub(beforecsb).cmp(toUnit(20)), 0);

//         // ac1 claim
//         let balance1 = await linaproxy.balanceOf(ac1);
//         await staking.claim( {from: ac1} );
//         let balance1AfterClaim1 = await linaproxy.balanceOf(ac1);
//         let claim1 = balance1AfterClaim1.sub(balance1);
//         assert.equal(claim1.cmp(0), 1);
//         try {
//             await staking.claim( {from: ac1} );// should not success??
//         } catch(e) {}
//         let balance1AfterClaim11 = await linaproxy.balanceOf(ac1);
//         assert.equal(balance1AfterClaim1.cmp(balance1AfterClaim11), 0);

//         // ac2 claim
//         let balance2 = await linaproxy.balanceOf(ac2);
//         await staking.claim( {from: ac2} );
//         let balance1AfterClaim2 = await linaproxy.balanceOf(ac2);
//         let claim2 = balance1AfterClaim2.sub(balance2);
//         assert.equal(claim2.cmp(0), 1);
//         assert.equal(claim2.cmp(claim1), 1);
        
//         // ac3 claim
//         let balance3 = await linaproxy.balanceOf(ac3);
//         await staking.claim( {from: ac3} );
//         let balance1AfterClaim3 = await linaproxy.balanceOf(ac3);
//         let claim3 = balance1AfterClaim3.sub(balance3);
//         assert.equal(claim3.cmp(0), 1);
//         assert.equal(claim3.sub(toUnit(20)).cmp(claim1), -1);

//         console.log("claims", [claim1,claim2,claim3].map(x=>x.toString()));
//         console.log([balance1AfterClaim1,balance1AfterClaim2, balance1AfterClaim3].map(x=>x.toString()));
        
//         let ac1reward = claim1;
//         let ac2reward = claim2;
//         let ac3reward = claim3.sub(toUnit(20));

//         //
//         async function reclaim(ac) {
//             let balance = await linaproxy.balanceOf(ac);
//             await staking.claim( {from: ac} );
//             await staking.cancelStaking( toUnit(30), {from: ac} );
//             assert.equal( (await linaproxy.balanceOf(ac)).cmp(balance), 0 );
//         }
//         await reclaim(ac1);
//         await reclaim(ac2);
//         await reclaim(ac3);

//         //console.log("ac1CancelReward1,ac1CancelReward2,ac1CancelReward3"); // no use any more.
//         //console.log([ac1CancelReward1,ac1CancelReward2,ac1CancelReward3].map(x=>x.toString()));
//         //console.log("sum:",[ac1CancelReward1,ac1CancelReward2,ac1CancelReward3].reduce((a,x)=>a.add(x)).toString());

// //        console.log("rewardCalcHelper.stakingLine", rewardCalcHelper.stakingLine);
//         let stakingAmounts = {};
//         let rewards = {};
//         let lastTotal = toBN(0);
//         let lastHeight = 0;
//         for (let i=0; i < rewardCalcHelper.stakingLine.length; i++) {
//             let stakingItem = rewardCalcHelper.stakingLine[i];
//             let user = stakingItem.user;
//             if (stakingAmounts[user] == null) {
//                 stakingAmounts[user] = toBN(0);
//             }
//             if (i > 0 && stakingItem.blockheight > lastHeight) {
//                 let totalDeltaRewards = toBN(stakingItem.blockheight - lastHeight).mul(rewardPerBlock);
//                 let allUser = Object.keys(stakingAmounts);
//                 for (let j=0; j < allUser.length; j++) {
//                     let _user = allUser[j];
//                     if (rewards[_user] == null) {
//                         rewards[_user] = toBN(0);
//                     }
//                     let r = stakingAmounts[_user].mul(toBN(1e20)).div(lastTotal).mul(totalDeltaRewards).div(toBN(1e20));
//                     rewards[_user] = rewards[_user].add(r);
//                 }
//             }
            
//             let stakingAmount = stakingItem.amount;
//             lastTotal = stakingItem.staking ? lastTotal.add(stakingAmount) : lastTotal.sub(stakingAmount);
//             stakingAmounts[user] = stakingItem.staking ? stakingAmounts[user].add(stakingAmount) : stakingAmounts[user].sub(stakingAmount);
//             lastHeight = stakingItem.blockheight;

//             //console.log("+", user, stakingAmount.toString());
//         }

//         console.log("rewards others", rewards["others"].toString());
//         console.log("rewards ac1", rewards[ac1].toString());
//         console.log("rewards ac2", rewards[ac2].toString());
//         console.log("rewards ac3", rewards[ac3].toString());

//         console.log("reward delta");
//         let delta1 = rewards[ac1].sub(ac1reward);
//         let delta2 = rewards[ac2].sub(ac2reward);
//         let delta3 = rewards[ac3].sub(ac3reward);

//         console.log("delta1, delta2, delta3", [delta1, delta2, delta3].map(x=> x.toString()));
//         assert.equal(delta1.abs().cmp(toUnit("0.001")), -1);
//         assert.equal(delta2.abs().cmp(toUnit("0.001")), -1);
//         assert.equal(delta3.abs().cmp(toUnit("0.001")), -1);

//         // other test: setTransLock, transTokens
//         // let testaddress = "0x3904b0FA920F205969364329259906B07A7A9533"
//         // await exceptionEqual(
//         //     staking.setTransLock(testaddress, 1, {from:ac2}),
//         //     "Only the contract admin can perform this action"
//         // );
//         // await exceptionEqual(
//         //     staking.transTokens(1, {from:ac2}),
//         //     "Only the contract admin can perform this action"
//         // );
//         // let curTime = currentTime();
//         // let lockTime = curTime + 3*oneDay;
//         // await staking.setTransLock(testaddress, lockTime);
//         // await staking.transTokens(toUnit(1));
//         // let bt = await linaproxy.balanceOf(testaddress);
//         // assert.equal(bt.cmp(toUnit(1)), 0);

        
// // [ '38388045886220463', '62674378793915963', '20013788353245398250' ]
// // [
// //   '1010038388045886220463',
// //   '1020062674378793915963',
// //   '1000013788353245398250'
// // ]
// // rewards others 99999884209107964277200
// // rewards ac1    38701417256282660
// // rewards ac2    62674378204704320
// // rewards ac3    14415096574734440
         
//     });


    it('simple staking  new with simpleStaking data', async () => {
        let [ admin, ac1, ac2, ac3 ] = [alice,alice,bob,carol];
        const [lina,linaproxy] = await CreateLina(admin);
        const kLnAccessControl = await LnAccessControl.new(admin);
        const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
        const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();
        
        const kHelperPushStakingData = await HelperPushStakingData.new(admin);

        let cur_block = await time.latestBlock();
        const rewardPerBlock = toUnit(1000);
        let startRewardBn = cur_block;
        let endRewardBn = startRewardBn.add(toBN(100));
        let newEndRewardBn = endRewardBn.add(toBN(100));
        let newStartRewardBn = endRewardBn;
        const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, rewardPerBlock, startRewardBn, endRewardBn);
        const stakingNew = await LnSimpleStakingNew.new(admin, linaproxy.address, staking.address, rewardPerBlock, newStartRewardBn, newEndRewardBn);
        await kLnAccessControl.SetRoles( roleKey, [stakingNew.address, staking.address, kHelperPushStakingData.address], [true, true, true] );

        let mintAmount = toUnit(1000);
        await lina.mint(ac1, mintAmount, { from: admin });
        await lina.mint(ac2, mintAmount, { from: admin });
        await lina.mint(ac3, mintAmount, { from: admin });

        await linaproxy.approve(staking.address, mintAmount, {from: ac1});
        await linaproxy.approve(staking.address, mintAmount, {from: ac2});
        await linaproxy.approve(staking.address, mintAmount, {from: ac3});

        await linaproxy.approve(stakingNew.address, mintAmount, {from: ac1});
        await linaproxy.approve(stakingNew.address, mintAmount, {from: ac2});
        await linaproxy.approve(stakingNew.address, mintAmount, {from: ac3});

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
        console.log("startRewardBn, endRewardBn", startRewardBn.toString(), endRewardBn.toString());

        await staking.setMinStakingAmount( 0 );
        await stakingNew.setMinStakingAmount( 0 );


        //load history data
        let users = [];
        let amounts = [];
        let stakingtime = [];
        
        let totalOld = toBN(0);
        function pushStakingData(_user, _amount, _stakingtime) {
            users.push(_user);
            amounts.push(_amount);
            stakingtime.push(_stakingtime-oldStartTime+newStartTime); // fix to new test time
            totalOld = totalOld.add(_amount);
            //console.log("stakingtime", stakingtime[stakingtime.length-1].toString());
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
                }
            }
        }

        //test data
        let ac1OldStaking = toUnit(10);
        let ac2OldStaking = toUnit(20);
        pushStakingData(ac1, ac1OldStaking, oldStartTime.add(toBN(oneDay+1)).toNumber() );
        pushStakingData(ac2, ac2OldStaking, oldStartTime.add(toBN(oneDay+2)).toNumber() );

        await lina.mint(staking.address, totalOld, { from: admin });
        
        while(users.length) {
            let u = users.splice(0,50);
            let a = amounts.splice(0,50);
            let t = stakingtime.splice(0,50);
            await kHelperPushStakingData.pushStakingData(kLnLinearStakingStorage.address, u, a, t);
        }
        let stakinger = Object.keys(stakingbalance);
        //... check push old staking data
        assert.equal(await staking.stakingBalanceOf(stakinger[2]), stakingbalance[stakinger[2]].toString());
        assert.equal(await staking.stakingBalanceOf(stakinger[7]), stakingbalance[stakinger[7]].toString());
        // address for log file.
        assert.equal(await staking.stakingBalanceOf("0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"), stakingbalance["0x749bd6B114bA2e7A9092d4a293250e1f432Ebc8A"].toString());
        
        // calc old staking reward
        let arrayTotal = await kLnLinearStakingStorage.weekTotalStaking();
        let oldStakingAddress = kLnLinearStakingStorage.address; // 用来记录旧staking方法的分配
        let oldStakingAmount = arrayTotal[7];
        let oldStakingBlockNumber = startRewardBn;
        //console.log(totalOld.toString(), oldStakingAmount.toString()); 
        assert.equal(totalOld.toString(), oldStakingAmount.toString());
        await staking.migrationsOldStaking(oldStakingAddress, oldStakingAmount, oldStakingBlockNumber);

        //
        let rewardCalcHelper = {
            stakingLine : []
        }
        rewardCalcHelper.RegStaking = function(user, amount, blockheight, staking) {
            this.stakingLine.push({user:user, amount:amount, blockheight:blockheight, staking: staking});
            let l = this.stakingLine.length;
            assert.ok(blockheight >= this.stakingLine[l-1].blockheight, "test case error, blockheight");
        }
        let tonumber = oldStakingBlockNumber.toNumber();
        rewardCalcHelper.RegStaking("others", oldStakingAmount.sub(ac1OldStaking).sub(ac2OldStaking), tonumber, true);
        rewardCalcHelper.RegStaking(ac1, ac1OldStaking, tonumber, true);
        rewardCalcHelper.RegStaking(ac2, ac2OldStaking, tonumber, true);

        //
        let blockNumber = await curBlockNumber();
        let passBlock = blockNumber - oldStakingBlockNumber.toNumber();
        let curOldReward = await staking.calcReward(blockNumber, oldStakingAddress);
        //console.log("calcReward oldStakingAddress", (await staking.calcReward(blockNumber, oldStakingAddress)).toString(), "passBlock", passBlock );
        //console.log("rewardPerBlock", rewardPerBlock.toString());
        let calcOldReward = rewardPerBlock.mul(new BN(passBlock));
        let delta = calcOldReward.sub( curOldReward );
        assert.equal( delta.cmp(toUnit(0)), 1 );
        console.log("total old reward delta.abs()", delta.abs().toString());
        assert.equal( delta.abs().cmp(toUnit("0.000001")), -1);

        // calc old reward.
        let ac1Reward = await staking.getTotalReward(blockNumber, ac1);
        let ac2Reward = await staking.getTotalReward(blockNumber, ac2);
        console.log( [ac1OldStaking, oldStakingAmount, calcOldReward].map( x=>x.toString()) );
        let calcAc1Reward1 = ac1OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20)); // 提高精度
        let calcAc2Reward1 = ac2OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20));
        console.log([ac1Reward, ac2Reward, calcAc1Reward1, calcAc2Reward1].map( x=>x.toString()));

        assert.equal( ac1Reward.sub( calcAc1Reward1 ).abs().cmp(toUnit("0.000001")), -1 ); /// errr
        assert.equal( ac2Reward.sub( calcAc2Reward1 ).abs().cmp(toUnit("0.000001")), -1 );



        // staking and cancel staking test
        let ac1NewStakingHeight1 = await curBlockNumber();
        let ac1Staking1 = toUnit(10);
        let v = await linaproxy.balanceOf(ac1);
        await staking.staking( ac1Staking1, { from: ac1 });
        rewardCalcHelper.RegStaking(ac1, ac1Staking1, ac1NewStakingHeight1, true);
        assert.equal(await linaproxy.balanceOf(ac1), v.sub(ac1Staking1).toString() );
        assert.equal(await staking.amountOf(ac1), ac1Staking1.toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1OldStaking.toString());
        assert.equal(await staking.stakingBalanceOf(ac1), ac1Staking1.add(ac1OldStaking).toString());
        
        // reward check.
        
        v = await linaproxy.balanceOf(ac1);
        let ac1CancelHeight1 = await curBlockNumber();
        let ac1Cancel1 = toUnit(5);
        await staking.cancelStaking( ac1Cancel1, { from: ac1 } );
        rewardCalcHelper.RegStaking(ac1, ac1Cancel1, ac1CancelHeight1, false);
        assert.equal(await linaproxy.balanceOf(ac1), v.add(ac1Cancel1).toString() );
        assert.equal(await staking.amountOf(ac1), ac1Cancel1.toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1OldStaking.toString());
        assert.equal(await staking.stakingBalanceOf(ac1), ac1Staking1.add(ac1OldStaking).sub(ac1Cancel1).toString());

        // ac1 cancel reward 1
        let rewardTotalstaking = totalOld.add(ac1Staking1); // percentage
        let ac1CancelReward1 = ac1Cancel1.mul(toBN(1e20)).div(rewardTotalstaking).mul( toBN(ac1CancelHeight1-ac1NewStakingHeight1).mul(rewardPerBlock) ).div(toBN(1e20));

        let ac1CancelHeight2 = await curBlockNumber();
        let ac1Cancel2 = toUnit(15);
        let ac1stakingbalance = ac1Staking1.add(ac1OldStaking).sub(ac1Cancel1).sub(ac1Cancel2);
        if (ac1stakingbalance.cmp(toBN(0)) == -1)
            ac1stakingbalance = toBN(0);
        let ac1oldstakingbalance = ac1stakingbalance.cmp(ac1OldStaking) == 1? ac1OldStaking: ac1stakingbalance;
        await staking.cancelStaking( ac1Cancel2, { from: ac1 } );
        rewardCalcHelper.RegStaking(ac1, ac1Cancel2, ac1CancelHeight2, false);
        assert.equal(await staking.amountOf(ac1), toUnit(0).toString());
        assert.equal(await kLnLinearStakingStorage.stakingBalanceOf(ac1), ac1oldstakingbalance.toString());
        assert.equal(await staking.stakingBalanceOf(ac1), ac1stakingbalance.toString());
        
        // ac1 cancel reward 2
        rewardTotalstaking = totalOld.add(ac1Staking1).sub(ac1Cancel1);
        let ac1CancelReward2 = toUnit(5).mul(toBN(1e20)).div(rewardTotalstaking).mul( toBN(ac1CancelHeight2-ac1NewStakingHeight1).mul(rewardPerBlock) ).div(toBN(1e20));
        let ac1CancelReward3 = toUnit(10).mul(toBN(1e20)).div(totalOld).mul( toBN(ac1CancelHeight2-oldStakingBlockNumber).mul(rewardPerBlock) ).div(toBN(1e20));

        totalOld = totalOld.sub(toUnit(10));// sub ac1 cancel2

        // reward test
        blocktime = await currentTime();
        console.log("curtime", blocktime, "end time", (await kLnLinearStakingStorage.stakingEndTime()).toString());
        
        let start_block = await time.latestBlock();

        await time.advanceBlockTo( start_block.add(toBN(30)));
        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
        let ac1NewStakingHeight2 = await curBlockNumber();
        await staking.staking( toUnit(20), { from: ac1 });
        rewardCalcHelper.RegStaking(ac1, toUnit(20), ac1NewStakingHeight2, true);

        await time.advanceBlockTo( start_block.add(toBN(60)));
        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay]}, rpcCallback);
        let ac3StakingHeight1 = await curBlockNumber();
        await staking.staking( toUnit(20), { from: ac3 });
        rewardCalcHelper.RegStaking(ac3, toUnit(20), ac3StakingHeight1, true);

        //set time to end
        blocktime = await currentTime();

        await time.advanceBlockTo( start_block.add(toBN(100)));
        let stakingEndTime = await kLnLinearStakingStorage.stakingEndTime();
        if (blocktime < stakingEndTime) {
            await web3.currentProvider.send({method: "evm_increaseTime", params: [stakingEndTime-blocktime+1]}, rpcCallback);
        }

//         // cancel on staking end, ac1
//         let beforecsb = await linaproxy.balanceOf(ac1);
//         await staking.cancelStaking( toUnit(30), { from: ac1 } );
//         rewardCalcHelper.RegStaking(ac1, toUnit(20), endRewardBn.toNumber(), false);
//         assert.equal( (await linaproxy.balanceOf(ac1)).sub(beforecsb), toUnit(20).toString() );

//         let newclaimtime = await staking.claimRewardLockTime();
//         if (blocktime <= newclaimtime) {
//             await web3.currentProvider.send({method: "evm_increaseTime", params: [newclaimtime-blocktime+2]}, rpcCallback);
//         }

//         // before claim
//         await lina.mint(staking.address, toUnit(10000), { from: admin });// TODO: calc total reward

//         // cancel after claiming time ac2
//         beforecsb = await linaproxy.balanceOf(ac2);
//         await staking.cancelStaking( toUnit(30), { from: ac2 } );
//         assert.equal( (await linaproxy.balanceOf(ac2)).sub(beforecsb).cmp(toUnit(20)), 0);

//         // ac1 claim
//         let balance1 = await linaproxy.balanceOf(ac1);
//         await staking.claim( {from: ac1} );
//         let balance1AfterClaim1 = await linaproxy.balanceOf(ac1);
//         let claim1 = balance1AfterClaim1.sub(balance1);
//         assert.equal(claim1.cmp(0), 1);
//         try {
//             await staking.claim( {from: ac1} );// should not success??
//         } catch(e) {}
//         let balance1AfterClaim11 = await linaproxy.balanceOf(ac1);
//         assert.equal(balance1AfterClaim1.cmp(balance1AfterClaim11), 0);

//         // ac2 claim
//         let balance2 = await linaproxy.balanceOf(ac2);
//         await staking.claim( {from: ac2} );
//         let balance1AfterClaim2 = await linaproxy.balanceOf(ac2);
//         let claim2 = balance1AfterClaim2.sub(balance2);
//         assert.equal(claim2.cmp(0), 1);
//         assert.equal(claim2.cmp(claim1), 1);
        
//         // ac3 claim
//         let balance3 = await linaproxy.balanceOf(ac3);
//         await staking.claim( {from: ac3} );
//         let balance1AfterClaim3 = await linaproxy.balanceOf(ac3);
//         let claim3 = balance1AfterClaim3.sub(balance3);
//         assert.equal(claim3.cmp(0), 1);
//         assert.equal(claim3.sub(toUnit(20)).cmp(claim1), -1);

//         console.log("claims", [claim1,claim2,claim3].map(x=>x.toString()));
//         console.log([balance1AfterClaim1,balance1AfterClaim2, balance1AfterClaim3].map(x=>x.toString()));
        
//         let ac1reward = claim1;
//         let ac2reward = claim2;
//         let ac3reward = claim3.sub(toUnit(20));

//         //
//         async function reclaim(ac) {
//             let balance = await linaproxy.balanceOf(ac);
//             await staking.claim( {from: ac} );
//             await staking.cancelStaking( toUnit(30), {from: ac} );
//             assert.equal( (await linaproxy.balanceOf(ac)).cmp(balance), 0 );
//         }
//         await reclaim(ac1);
//         await reclaim(ac2);
//         await reclaim(ac3);

//         //console.log("ac1CancelReward1,ac1CancelReward2,ac1CancelReward3"); // no use any more.
//         //console.log([ac1CancelReward1,ac1CancelReward2,ac1CancelReward3].map(x=>x.toString()));
//         //console.log("sum:",[ac1CancelReward1,ac1CancelReward2,ac1CancelReward3].reduce((a,x)=>a.add(x)).toString());

// //        console.log("rewardCalcHelper.stakingLine", rewardCalcHelper.stakingLine);
//         let stakingAmounts = {};
//         let rewards = {};
//         let lastTotal = toBN(0);
//         let lastHeight = 0;
//         for (let i=0; i < rewardCalcHelper.stakingLine.length; i++) {
//             let stakingItem = rewardCalcHelper.stakingLine[i];
//             let user = stakingItem.user;
//             if (stakingAmounts[user] == null) {
//                 stakingAmounts[user] = toBN(0);
//             }
//             if (i > 0 && stakingItem.blockheight > lastHeight) {
//                 let totalDeltaRewards = toBN(stakingItem.blockheight - lastHeight).mul(rewardPerBlock);
//                 let allUser = Object.keys(stakingAmounts);
//                 for (let j=0; j < allUser.length; j++) {
//                     let _user = allUser[j];
//                     if (rewards[_user] == null) {
//                         rewards[_user] = toBN(0);
//                     }
//                     let r = stakingAmounts[_user].mul(toBN(1e20)).div(lastTotal).mul(totalDeltaRewards).div(toBN(1e20));
//                     rewards[_user] = rewards[_user].add(r);
//                 }
//             }
            
//             let stakingAmount = stakingItem.amount;
//             lastTotal = stakingItem.staking ? lastTotal.add(stakingAmount) : lastTotal.sub(stakingAmount);
//             stakingAmounts[user] = stakingItem.staking ? stakingAmounts[user].add(stakingAmount) : stakingAmounts[user].sub(stakingAmount);
//             lastHeight = stakingItem.blockheight;

//             //console.log("+", user, stakingAmount.toString());
//         }

//         console.log("rewards others", rewards["others"].toString());
//         console.log("rewards ac1", rewards[ac1].toString());
//         console.log("rewards ac2", rewards[ac2].toString());
//         console.log("rewards ac3", rewards[ac3].toString());

//         console.log("reward delta");
//         let delta1 = rewards[ac1].sub(ac1reward);
//         let delta2 = rewards[ac2].sub(ac2reward);
//         let delta3 = rewards[ac3].sub(ac3reward);

//         console.log("delta1, delta2, delta3", [delta1, delta2, delta3].map(x=> x.toString()));
//         assert.equal(delta1.abs().cmp(toUnit("0.001")), -1);
//         assert.equal(delta2.abs().cmp(toUnit("0.001")), -1);
//         assert.equal(delta3.abs().cmp(toUnit("0.001")), -1);


// test simple staking new

        // // calc old reward.
        // let ac1Reward = await stakingNew.getTotalReward(blockNumber, ac1);
        // let ac2Reward = await stakingNew.getTotalReward(blockNumber, ac2);
        // let ac1SimpleStaking = staking.g
        // console.log( [ac1OldStaking, oldStakingAmount, calcOldReward].map( x=>x.toString()) );
        // let calcAc1Reward1 = ac1OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20)); // 提高精度
        // let calcAc2Reward1 = ac2OldStaking.mul(toBN(1e20)).div(oldStakingAmount).mul(calcOldReward).div(toBN(1e20));
        // console.log([ac1Reward, ac2Reward, calcAc1Reward1, calcAc2Reward1].map( x=>x.toString()));

        // assert.equal( ac1Reward.sub( calcAc1Reward1 ).abs().cmp(toUnit("0.000001")), -1 ); /// errr
        // assert.equal( ac2Reward.sub( calcAc2Reward1 ).abs().cmp(toUnit("0.000001")), -1 );

      // migrationsOldStaking
        let simpleStakingAmount = await staking.amount();
        await stakingNew.migrationsOldStaking(staking.address, simpleStakingAmount, newStartRewardBn);

      // staking and cancel staking test

        //test simpleStaking new
        let ac1RewardNew = await stakingNew.getTotalReward(blockNumber, ac1);

        console.log("rewards total reward in simpleStaking", ac1RewardNew.toString());

        let ac1SimpleStakingAmount = await staking.stakingBalanceOf(ac1);
        let ac1SimpleStakingNewAmount = await stakingNew.amountOf(ac1);
        console.log("ac1SimpleStakingAmount", ac1SimpleStakingAmount.toString());
        console.log("ac1SimpleStakingNewAmount", ac1SimpleStakingNewAmount.toString());
        

        let ac1NewStakingHeightN = await curBlockNumber();
        let ac1Staking1N = toUnit(10);
        let vN = await linaproxy.balanceOf(ac1);
        let ac1SimpleStaking = staking.amountOf(ac1);
        // await stakingNew.staking( ac1Staking1N, { from: ac1 });
        // rewardCalcHelper.RegStaking(ac1, ac1Staking1N, ac1NewStakingHeightN, true);
        // assert.equal(await linaproxy.balanceOf(ac1), vN.sub(ac1Staking1N).toString() );
        // assert.equal(await stakingNew.amountOf(ac1), ac1Staking1N.toString());
        // assert.equal(await stakingNew.stakingBalanceOf(ac1), ac1Staking1N.add(ac1SimpleStaking).toString());

        // assert.equal(await stakingNew.cancelStakingV2(ac1Staking1N.sub(1), { from: ac1}), 0);
        // assert.equal(await stakingNew.cancelStakingV2(2, { from: ac1}), 1);
        


        let mWidthdrawRewardFromOldStaking = await stakingNew.mWidthdrawRewardFromOldStaking();
        let rewardOfOldStaking = await stakingNew.rewardOf(staking.address);
        console.log("mWidthdrawRewardFromOldStaking", mWidthdrawRewardFromOldStaking.toString());
        console.log("reward Of oldStaking", rewardOfOldStaking.toString());

        await staking.cancelStaking(ac1SimpleStakingAmount);

        mWidthdrawRewardFromOldStaking = await stakingNew.mWidthdrawRewardFromOldStaking();
        rewardOfOldStaking = await stakingNew.rewardOf(staking.address);
        console.log("mWidthdrawRewardFromOldStaking", mWidthdrawRewardFromOldStaking.toString());
        console.log("reward Of oldStaking", rewardOfOldStaking.toString());




      


 


        // console.log("rewards others", rewards["others"].toString());
        // console.log("rewards ac1", rewards[ac1].toString());
        // console.log("rewards ac2", rewards[ac2].toString());
        // console.log("rewards ac3", rewards[ac3].toString());

        // console.log("reward delta");
        // delta1 = rewards[ac1].sub(ac1reward);
        // delta2 = rewards[ac2].sub(ac2reward);
        // delta3 = rewards[ac3].sub(ac3reward);

        // console.log("delta1, delta2, delta3", [delta1, delta2, delta3].map(x=> x.toString()));
        // assert.equal(delta1.abs().cmp(toUnit("0.001")), -1);
        // assert.equal(delta2.abs().cmp(toUnit("0.001")), -1);
        // assert.equal(delta3.abs().cmp(toUnit("0.001")), -1);

         
    });

    // MultiSigForTransferFunds
/*
    it('MultiSigForTransferFunds', async () => {
        let [ admin, ac1, ac2, ac3 ] = [alice,bob,carol,dev];
        const [lina,linaproxy] = await CreateLina(admin);
        const kLnAccessControl = await LnAccessControl.new(admin);
        const kLnLinearStakingStorage = await LnLinearStakingStorage.new(admin, kLnAccessControl.address);
        const roleKey = await kLnLinearStakingStorage.DATA_ACCESS_ROLE();

        let cur_block = await time.latestBlock();
        const rewardPerBlock = toUnit(1000);
        let startRewardBn = cur_block;
        let endRewardBn = startRewardBn.add(toBN(10));
        const staking = await LnSimpleStaking.new(admin, linaproxy.address, kLnLinearStakingStorage.address, rewardPerBlock, startRewardBn, endRewardBn);
        await kLnAccessControl.SetRoles( roleKey, [staking.address], [true] );

        await lina.mint(staking.address, toUnit(10000), { from: admin });

        let admins = [ac1,ac2,ac3];

        const kMultiSigForTransferFunds = await MultiSigForTransferFunds.new(admins, 3, staking.address);

        await staking.setCandidate(kMultiSigForTransferFunds.address);
        await kMultiSigForTransferFunds.becomeAdmin(staking.address);

        let blocktime = await currentTime();
        
        async function exceptionRevert(p) {
            try {
                await p;
            } catch(e) {
                assert.equal(e.toString().includes("VM Exception while processing transaction: revert"), true);
            }
        }

        // not in multi admin
        await exceptionRevert( kMultiSigForTransferFunds.setTransLock(admin, blocktime+3*oneDay, toBN(1)));

        await kMultiSigForTransferFunds.setTransLock(admin, blocktime+3*oneDay, toBN(1), {from:ac1});
        
        // ac1 need to wait 
        let transLockTime = blocktime+3*oneDay;
        await exceptionRevert(kMultiSigForTransferFunds.setTransLock(admin, transLockTime, toBN(1), {from:ac1}));
        await exceptionRevert(kMultiSigForTransferFunds.confirmTransfer({from:ac1}));

        await kMultiSigForTransferFunds.confirmTransfer({from:ac2});
        assert.equal((await kMultiSigForTransferFunds.mProposalNumb()).cmp(toBN(2)), 0);
        await exceptionRevert(kMultiSigForTransferFunds.confirmTransfer({from:ac2}));

        blocktime = await currentTime();
        if (blocktime < transLockTime) {
            console.log("not unlock time");
            await exceptionEqual(kMultiSigForTransferFunds.doTransfer(),
                "Pls wait to unlock time"
            );

            await web3.currentProvider.send({method: "evm_increaseTime", params: [transLockTime-blocktime+1]}, rpcCallback);
        }

        await exceptionEqual(
            kMultiSigForTransferFunds.doTransfer(),
            "need more confirm"
        );
        
        await (kMultiSigForTransferFunds.confirmTransfer({from:ac3}));

        await kMultiSigForTransferFunds.doTransfer();
        
        assert.equal( (await linaproxy.balanceOf(admin)).cmp(toBN(1)), 0 );

        blocktime = await currentTime();
        transLockTime = blocktime+3*oneDay;
        await exceptionEqual(
            kMultiSigForTransferFunds.setTransLock(admin, transLockTime, toBN(1), {from: admin}),
            "not in admin list or set state"
        );

        await kMultiSigForTransferFunds.setTransLock(admin, transLockTime, toBN(1), {from: ac3});
        await exceptionEqual(
            kMultiSigForTransferFunds.setTransLock(admin, transLockTime, toBN(1), {from: ac3}),
            "not in admin list or set state"
        );
        await kMultiSigForTransferFunds.confirmTransfer({from:ac1});
        await kMultiSigForTransferFunds.confirmTransfer({from:ac2});

        blocktime = await currentTime();
        if (blocktime < transLockTime) {
            await exceptionEqual(kMultiSigForTransferFunds.doTransfer(),
                "Pls wait to unlock time"
            );

            await web3.currentProvider.send({method: "evm_increaseTime", params: [transLockTime-blocktime+1]}, rpcCallback);
        }
        await kMultiSigForTransferFunds.doTransfer();
        assert.equal( (await linaproxy.balanceOf(admin)).cmp(toBN(2)), 0 );
    });
    */
});
