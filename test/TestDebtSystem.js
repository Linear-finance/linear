const LnDebtSystem = artifacts.require("LnDebtSystem");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const {InitComment, newAssetToken, CreateLina} = require ("./common.js");

contract('test LnDebtSystem', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[1];
    
    // don't call any await async funtions here

    beforeEach(async function () {
        // before exec each test case
    });

    it('# debt 1', async ()=> {
        
        let InitContracts = await InitComment(ac0);
        //console.log("InitContracts", InitContracts);

        let kLnDebtSystem = InitContracts.kLnDebtSystem;
        await kLnDebtSystem.GetUserDebtBalanceInUsd(ac0);

    });

});

