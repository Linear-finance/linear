const LinearFinance = artifacts.require("LinearFinance");
const LnAddressStorage = artifacts.require("LnAddressStorage");
const testAddressCache = artifacts.require("testAddressCache");

const w3utils = require('web3-utils');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

contract('test LinearFinance', async (accounts)=> {

    const admin = accounts[0];
    const ac1 = accounts[1];

    const mintAmount = "1000000000000000000000";
    const sendamount = "1000000000000000000";

  
    it('Address cache', async ()=> {
        const addrStorage = await LnAddressStorage.deployed();
        await addrStorage.update( toBytes32("a"), addrStorage.address );
        await addrStorage.update( toBytes32("b"), addrStorage.address );
        
        const testCache = await testAddressCache.deployed();
        await testCache.updateAddressCache( addrStorage.address );
    
        let addr1 = await testCache.addr1();
        let addr2 = await testCache.addr2();
        //console.log(addr1);
        //console.log(addr2);
        
        assert.equal( addr1.valueOf(), addrStorage.address );
        assert.equal( addr2.valueOf(), addrStorage.address );
    });
  
   
});

