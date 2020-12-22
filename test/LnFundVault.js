
const LnAssetSystem = artifacts.require("LnAssetSystem");
const SafeDecimalMath = artifacts.require("SafeDecimalMath");
const LnAssetUpgradeable = artifacts.require("LnAssetUpgradeable");
const LnTokenStorage = artifacts.require("LnTokenStorage");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnExchangeSystem = artifacts.require("LnExchangeSystem");
const LnAccessControl = artifacts.require("LnAccessControl");
const LnChainLinkPrices = artifacts.require("LnChainLinkPrices");
const TestOracle = artifacts.require("TestOracle");
const LnConfig = artifacts.require("LnConfig");
const LnFeeSystem = artifacts.require("LnFeeSystem");
const LnFundVault = artifacts.require("LnFundVault");


const w3utils = require('web3-utils');

const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');
const toBytes32 = key => w3utils.rightPad(w3utils.asciiToHex(key), 64);

const assertBNEqual = (actualBN, expectedBN, context) => {
    assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
};

const convertToOraclePrice = (val) => {
    return web3.utils.toBN(Math.round(val * 1e8));
}

const currentTime = async () => {
    const { timestamp } = await web3.eth.getBlock('latest');
    return timestamp;
};


const assertRevert = async (blockOrPromise, reason) => {
    let errorCaught = false;
    try {
        const result = typeof blockOrPromise === 'function' ? blockOrPromise() : blockOrPromise;
        await result;
    } catch (error) {
        assert.include(error.message, 'revert');
        if (reason) {
            assert.include(error.message, reason);
        }
        errorCaught = true;
    }

    assert.strictEqual(errorCaught, true, 'Operation did not revert as expected');
};


contract('LnFundVault', async (accounts)=> {

    const admin = accounts[0];
    const op1 = accounts[1];
    const op2 = accounts[2];
    const op3 = accounts[3];


    describe('Fund Vault', () => {

        it('set', async ()=> {
            // add assets
            let v = toUnit(1.2354);
            const vault = await LnFundVault.new( admin, 0, 0, op3  );
            await vault.SetInvestNumb( 2 );
            await vault.SetFundValue( v );

            // send 1
            var message = {from: admin, to:vault.address, value: v};
            await web3.eth.sendTransaction(message );

            let vaultBalance = await web3.eth.getBalance(vault.address);
            console.log( vaultBalance );
            assert.equal( vaultBalance, v );

            // send 1 again
            await assertRevert( web3.eth.sendTransaction(message ) );

            // send2
            message = {from: op1, to:vault.address, value: v};
            await web3.eth.sendTransaction(message );
            vaultBalance = await web3.eth.getBalance(vault.address);
            console.log( vaultBalance );
            assert.equal( vaultBalance, v*2 );

            // send2 again
            await assertRevert( web3.eth.sendTransaction(message ) );
          
            // send3
            message = {from: op2, to:vault.address, value: v};
            await assertRevert( web3.eth.sendTransaction(message ) );
             
            // claim
            vaultBalance = await web3.eth.getBalance(vault.address);
            let op3b = await web3.eth.getBalance(op3);
            console.log( vaultBalance );
            console.log( op3b );
            await vault.claim( vaultBalance );
            let op3b2 = await web3.eth.getBalance(op3);
            console.log( op3b2 );

            let op3b3 = toUnit(op3b).add( toUnit(vaultBalance));
            console.log( op3b3 );
            assertBNEqual( op3b3, toUnit(op3b2) );
            // console.log( toWei(op3b3) );
            // assert.equal( op3b2, toWei(op3b3) );
        });

        it('invest', async ()=> {
            // add assets
            let v = toUnit(1.2354);
            const vault = await LnFundVault.new( admin, v, 2, op3  );
            
            // send 1
            var message = {from: admin, to:vault.address, value: v};
            await web3.eth.sendTransaction(message );

            let vaultBalance = await web3.eth.getBalance(vault.address);
            console.log( vaultBalance );
            assert.equal( vaultBalance, v );

            // send 1 again
            await assertRevert( web3.eth.sendTransaction(message ) );

            // send2
            message = {from: op1, to:vault.address, value: v};
            await web3.eth.sendTransaction(message );
            vaultBalance = await web3.eth.getBalance(vault.address);
            console.log( vaultBalance );
            assert.equal( vaultBalance, v*2 );

            // send2 again
            await assertRevert( web3.eth.sendTransaction(message ) );
          
            // send3
            message = {from: op2, to:vault.address, value: v};
            await assertRevert( web3.eth.sendTransaction(message ) );
             
            // claim
            vaultBalance = await web3.eth.getBalance(vault.address);
            let op3b = await web3.eth.getBalance(op3);
            console.log( vaultBalance );
            console.log( op3b );
            await vault.claim( vaultBalance );
            let op3b2 = await web3.eth.getBalance(op3);
            console.log( op3b2 );

            let op3b3 = toUnit(op3b).add( toUnit(vaultBalance));
            console.log( op3b3 );
            assertBNEqual( op3b3, toUnit(op3b2) );
            // console.log( toWei(op3b3) );
            // assert.equal( op3b2, toWei(op3b3) );
        });
    });

});

