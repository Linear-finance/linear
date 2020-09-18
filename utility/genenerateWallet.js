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
