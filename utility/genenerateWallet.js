const ethers = require("ethers")

let randomWallet = ethers.Wallet.createRandom();
console.log("mnemonic:", randomWallet.mnemonic);
//m / purpose' / coin_type' / account' / change / address_index
//m/44'/60'/0'/0/0

for (let i=0; i < 1; i++) {
    let path = "m/44'/60'/0'/0/"+i;
    let wallet = ethers.Wallet.fromMnemonic(randomWallet.mnemonic.phrase, path);
    console.log(wallet.address.toLowerCase(), wallet.privateKey);
}


// The password to encrypt with
const password = "password123";

// WARNING: Doing this substantially reduces the security
//          of the wallet. This is highly NOT recommended.

// We override the default scrypt.N value, which is used
// to indicate the difficulty to crack this wallet.
async function encrytWallet() {
    const json = await randomWallet.encrypt(password, {
        scrypt: {
          // The number must be a power of 2 (default: 131072)
          N: 64
        }
      });
      
      console.log(json);
      
}
encrytWallet();
//https://docs.ethers.io/v5/api/signer
//ethers.Wallet.fromEncryptedJsonSync( json , password ) 
