const LnDebtSystem = artifacts.require("LnDebtSystem");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);
//ethers.utils.parseEther("0.1")

const {InitComment, newAssetToken, CreateLina} = require ("./common.js");

contract('test LnDebtSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[1];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('#delete array to close FeePeriod', async ()=> {
        
        let InitContracts = await InitComment(ac0);
        //console.log("InitContracts", InitContracts);

        let kLnDebtSystem = InitContracts.kLnDebtSystem;
        await kLnDebtSystem.GetUserDebtBalanceInUsd(ac0);

        let maxDeltetePerTime = await kLnDebtSystem.MAX_DEL_PER_TIME();
        
        let i = 0;
        for (;i < 101; i++) {
            await kLnDebtSystem.UpdateDebt(ac0, 1, 1);
        }

        let v = await kLnDebtSystem.debtCurrentIndex();
        assert.equal(v.valueOf(), i);

        v = await kLnDebtSystem.lastCloseAt();
        assert.equal(v.valueOf(), 0);
        
        v = await kLnDebtSystem.lastDeletTo();
        assert.equal(v.valueOf(), 0);

        await kLnDebtSystem.SetLastCloseFeePeriodAt(i);

        let deletTo = maxDeltetePerTime.toNumber();
        // delete
        await kLnDebtSystem.UpdateDebt(ac0, 1, 1); 
        v = await kLnDebtSystem.lastCloseAt();
        assert.equal(v.valueOf(), i);
        v = await kLnDebtSystem.lastDeletTo();
        assert.equal(v.valueOf().toString(), deletTo);

        // delete
        deletTo = 2*maxDeltetePerTime;
        await kLnDebtSystem.UpdateDebt(ac0, 1, 1); 
        v = await kLnDebtSystem.lastCloseAt();
        assert.equal(v.valueOf(), i);
        v = await kLnDebtSystem.lastDeletTo();
        assert.equal(v.valueOf(), deletTo);

        // delete
        deletTo += 1;
        await kLnDebtSystem.UpdateDebt(ac0, 1, 1); 
        v = await kLnDebtSystem.lastCloseAt();
        assert.equal(v.valueOf(), i);
        v = await kLnDebtSystem.lastDeletTo();
        assert.equal(v.valueOf(), deletTo);

    });

});

