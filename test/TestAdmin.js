
const testAddressCache = artifacts.require("testAddressCache");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

contract('test Admin', async (accounts)=> {

    const admin = accounts[0];
    const ac1 = accounts[1];

    it('Admin', async ()=> {
        const testCache = await testAddressCache.deployed();
        await testCache.setCandidate( ac1 );
        await testCache.becomeAdmin( { from: ac1 } );
        let addr1 = await testCache.admin();
        let addr2 = await testCache.candidate();
        //await new Promise(resolve => setTimeout(resolve, 3*1000));

        //console.log(addr1);
        //console.log(addr2);
        
        assert.equal( addr1.valueOf(), ac1 );
        assert.equal( addr2.valueOf(), ac1 );
    });
});

