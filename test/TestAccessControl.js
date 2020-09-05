const LnAccessControl = artifacts.require("LnAccessControl");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

contract('test LnAccessControl', async (accounts)=> {

    const ac0 = accounts[0];
    const ac1 = accounts[1];
    const ac2 = accounts[1];

    it('access roles', async ()=> {
        let accessControl = await LnAccessControl.new(ac0);
        let debtsystemkey = await accessControl.DEBT_SYSTEM();
        let issueassetkey = await accessControl.ISSUE_ASSET_ROLE();

        let v = await accessControl.IsAdmin(ac0);
        assert.equal(v, true);
        v = await accessControl.IsAdmin(ac1);
        assert.equal(v, false);
        
        //fail
        try {
            await accessControl.SetAdmin(ac1, {from:ac2});
        } catch (e) {
            assert.equal(e.reason, "Only admin");
        }

        let addrs = [ac1, ac2];
        let setTo = [true, true];
        
        try {
            await accessControl.SetDebtSystemRole(addrs, setTo, {from:ac2});
        } catch (e) {
            assert.equal(e.reason, "AccessControl: sender must be an admin to grant");
        }

        // debt system role
        // default
        v = await accessControl.hasRole(debtsystemkey,ac1);
        assert.equal(v, false);
        v = await accessControl.hasRole(debtsystemkey,ac2);
        assert.equal(v, false);
        v = await accessControl.hasRole(issueassetkey,ac2);
        assert.equal(v, false);

        // set to 
        await accessControl.SetDebtSystemRole(addrs, setTo);
        v = await accessControl.hasRole(debtsystemkey,ac1);
        assert.equal(v, true);
        v = await accessControl.hasRole(debtsystemkey,ac2);
        assert.equal(v, true);
        v = await accessControl.hasRole(issueassetkey,ac2);
        assert.equal(v, false);

        // reset
        setTo = [false, false];
        await accessControl.SetDebtSystemRole(addrs, setTo);
        v = await accessControl.hasRole(debtsystemkey,ac1);
        assert.equal(v, false);
        v = await accessControl.hasRole(debtsystemkey,ac2);
        assert.equal(v, false);
        v = await accessControl.hasRole(issueassetkey,ac2);
        assert.equal(v, false);

        v = await accessControl.hasRole(debtsystemkey,ac0);
        assert.equal(v, false);

        // run end check
        //assert.equal(true, false);
    });
});

