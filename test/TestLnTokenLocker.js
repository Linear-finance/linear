const LnTokenLocker = artifacts.require("LnTokenLocker");
const LnTokenCliffLocker = artifacts.require("LnTokenCliffLocker");

const {CreateLina, exceptionEqual, exceptionNotEqual} = require ("./common.js");

const w3utils = require('web3-utils');
const { BN, toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

function rpcCallback(a,b,c,d) {
    //console.log("rpcCallback",a,b,c,d);
}

const currentTime = async () => {
    const { timestamp } = await web3.eth.getBlock('latest', false, (a,b,c)=>{});
    return timestamp;
};

contract('test LnTokenLocker', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[2];
    const ac3 = accounts[3];

    const admin = ac0;

    const oneDay = 3600*24;
    const oneYear = oneDay*365;
    const thirtyDay = oneDay*30;

    it('sendLockToken', async ()=> {
        const [lina, linaProxy] = await CreateLina(admin);
        const tl = await LnTokenLocker.new(linaProxy.address, admin);

        await tl.sendLockToken(ac1, toUnit(360), 360);

        await exceptionEqual(
            tl.sendLockToken(ac1, toUnit(360), 360), "this address has locked"
        );

        await exceptionEqual(
            tl.sendLockToken(ac2, toUnit(360), 360, {from:ac2}), "Only the contract admin can perform this action"
        );

        await tl.sendLockToken(ac2, toUnit(360), 180);

        await exceptionEqual(
            tl.sendLockToken(ac2, toUnit(360), 360), "this address has locked"
        );

        await exceptionEqual(
            tl.sendLockToken(ac3, toUnit(0), 0), "amount can not zero"
        );

        await exceptionEqual(
            tl.sendLockToken(ac3, toUnit(1), 0), "lock days need more than zero"
        );
    });

    it('claimToken', async ()=> {
        const [lina, linaProxy] = await CreateLina(admin);
        const tl = await LnTokenLocker.new(linaProxy.address, admin);

        let v
        v = await tl.sendLockToken(ac1, toUnit(360), 360);
        console.log("sendLockToken gasUsed", v.receipt.gasUsed);
        await tl.sendLockToken(ac2, toUnit(360), 180);

        // before claim
        let mintAmount = toUnit(10000);
        await lina.mint(tl.address, mintAmount);

        await exceptionEqual(
            tl.claimToken(toUnit(0), {from:ac1}), "Invalid parameter amount"
        );

        await exceptionEqual(
            tl.claimToken(toUnit(10), {from:ac3}), "No lock token to claim"
        );
        
        await exceptionEqual(
            tl.claimToken(toUnit(10), {from:ac1}), "need wait for one day at least"
        );

        //-----------------------
        await web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay+1]}, rpcCallback);

        v = await tl.claimToken(toUnit(10000), {from: ac1});
        //console.log("claimToken", v.tx);

        v = await tl.lockData(ac1);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (360).toString());
        assert.equal(v.claimedAmount, toUnit(1).toString());
        
        v = await tl.claimToken(toUnit(10000), {from: ac2});
        //console.log("claimToken", v.tx);

        v = await tl.lockData(ac2);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (180).toString());
        assert.equal(v.claimedAmount, toUnit(2).toString());

        //-----------------------
        web3.currentProvider.send({method: "evm_increaseTime", params: [2*oneDay+1]}, rpcCallback);

        //---
        v = await tl.claimToken(toUnit(10000), {from: ac1});

        v = await tl.lockData(ac1);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (360).toString());
        assert.equal(v.claimedAmount, toUnit(3).toString());
        
        //---
        v = await tl.claimToken(toUnit(10000), {from: ac2});

        v = await tl.lockData(ac2);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (180).toString());
        assert.equal(v.claimedAmount, toUnit(6).toString());

        //-----------------------
        web3.currentProvider.send({method: "evm_increaseTime", params: [oneYear+1]}, rpcCallback);

        //---
        v = await tl.claimToken(toUnit(10000), {from: ac1});

        v = await tl.lockData(ac1);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (360).toString());
        assert.equal(v.claimedAmount, toUnit(360).toString());
        
        //---
        v = await tl.claimToken(toUnit(10000), {from: ac2});

        v = await tl.lockData(ac2);
        assert.equal(v.amount, toUnit(360).toString());
        assert.equal(v.lockDays, (180).toString());
        assert.equal(v.claimedAmount, toUnit(360).toString());

        await exceptionEqual(
            tl.claimToken(toUnit(10), {from:ac1}), "not available claim"
        );
        await exceptionEqual(
            tl.claimToken(toUnit(10), {from:ac2}), "not available claim"
        );
    });

    it('sendLockTokenMany', async ()=> {
        const [lina, linaProxy] = await CreateLina(admin);
        const tl = await LnTokenLocker.new(linaProxy.address, admin);

        let mintAmount = toUnit(10000);
        await lina.mint(tl.address, mintAmount);

        await exceptionEqual(
            tl.sendLockTokenMany([ac1,ac2,ac3], [100, 200, 300].map(toUnit), [100, 200, 300], {from:ac3}), "Only the contract admin can perform this action"
        );

        let v = await tl.sendLockTokenMany([ac1,ac2,ac3], [100, 200, 300].map(toUnit), [100, 200, 300]);
        console.log("sendLockTokenMany 3 gasUsed", v.receipt.gasUsed);

        v = await tl.lockData(ac1);
        assert.equal(v.amount, toUnit(100).toString());
        assert.equal(v.lockDays, (100).toString());
        assert.equal(v.claimedAmount, toUnit(0).toString());

        v = await tl.lockData(ac2);
        assert.equal(v.amount, toUnit(200).toString());
        assert.equal(v.lockDays, (200).toString());
        assert.equal(v.claimedAmount, toUnit(0).toString());

        v = await tl.lockData(ac3);
        assert.equal(v.amount, toUnit(300).toString());
        assert.equal(v.lockDays, (300).toString());
        assert.equal(v.claimedAmount, toUnit(0).toString());
    });

    it('LnTokenCliffLocker sendLockTokenMany', async ()=> {
        const [lina, linaProxy] = await CreateLina(admin);
        const tl = await LnTokenCliffLocker.new(linaProxy.address, admin);

        let mintAmount = toUnit(10000);
        await lina.mint(tl.address, mintAmount);

        let blocktime = await currentTime();

        await exceptionEqual(
            tl.sendLockToken(ac1, toUnit(100), blocktime + oneDay, {from:ac1}), "Only the contract admin can perform this action"
        );

        await exceptionEqual(
            tl.sendLockTokenMany([ac2,ac3], [200, 300].map(toUnit), [blocktime + 2*oneDay, blocktime + 3*oneDay], {from:ac3}), "Only the contract admin can perform this action"
        );

        await tl.sendLockToken(ac1, toUnit(100), blocktime + oneDay);
        await tl.sendLockTokenMany([ac2,ac3], [200, 300].map(toUnit), [blocktime + 2*oneDay, blocktime + 3*oneDay]);

        await exceptionEqual(
            tl.claimToken(toUnit(1)), "No lock token to claim"
        );

        await exceptionEqual(
            tl.claimToken(toUnit(100), {from:ac1}), "Not time to claim"
        );
        await exceptionEqual(
            tl.claimToken(toUnit(100), {from:ac2}), "Not time to claim"
        );
        await exceptionEqual(
            tl.claimToken(toUnit(100), {from:ac3}), "Not time to claim"
        );

        web3.currentProvider.send({method: "evm_increaseTime", params: [oneDay+1]}, rpcCallback);

        await tl.claimToken(toUnit(100), {from:ac1});
        let v = await linaProxy.balanceOf(ac1);
        assert.equal(v.cmp(toUnit(100)), 0);

        await exceptionEqual(
            tl.claimToken(toUnit(100), {from:ac2}), "Not time to claim"
        );
        await exceptionEqual(
            tl.claimToken(toUnit(100), {from:ac3}), "Not time to claim"
        );

        web3.currentProvider.send({method: "evm_increaseTime", params: [2*oneDay+1]}, rpcCallback);

        await tl.claimToken(toUnit(100), {from:ac2});
        await tl.claimToken(toUnit(100), {from:ac2});

        await tl.claimToken(toUnit(100), {from:ac3});
        await tl.claimToken(toUnit(100), {from:ac3});
        await tl.claimToken(toUnit(100), {from:ac3});

        await exceptionEqual(
            tl.claimToken(toUnit(1), {from:ac1}), "not available claim"
        );

        await exceptionEqual(
            tl.claimToken(toUnit(1), {from:ac2}), "not available claim"
        );

        await exceptionEqual(
            tl.claimToken(toUnit(1), {from:ac3}), "not available claim"
        );
    });
});

