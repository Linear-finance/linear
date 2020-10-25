# Linear
Linear smart contracts implementing with Solidity

![GitHub package.json version](https://img.shields.io/github/package-json/v/Linear-finance/linear) ![GitHub top language](https://img.shields.io/github/languages/top/Linear-finance/linear)

### A Decentralized Delta-One Asset Protocol
> Linear Finance is a cross-chain compatible, decentralized delta-one asset protocol to cost-effectively and instantly create, manage, and trade synthetic assets with unlimited liquidity

Linear Finance (“Linear”) is a non-custodial, cross-chain compatible, delta-one asset protocol. Linear’s long term DeFi vision is to increase inclusiveness and democratize access to investment assets (digital and traditional). Tremendous value exists in the ability for investors to easily and quickly invest, save fees, and secure assets at fair market value. Linear combines substantial technical experience from numerous crypto projects with extensive financial experience in exotic and structured assets from traditional global asset management firms to bring to market one of the first DeFi projects built upon Ethereum with cross-chain compatibility. Linear will allow users to build and manage spot or portfolio exposures with a slew of innovative digital and traditional financial products.

### Community

[![Discord](https://img.shields.io/discord/738363983031173151?label=discord&logo=discord&style=plastic)](https://discordapp.com/channels/738363983031173151/) [![Twitter Follow](https://img.shields.io/twitter/follow/LinearFinance?label=LinearFinance&style=social)](https://twitter.com/LinearFinance) [![Chat on Telegram](https://img.shields.io/badge/Telegram-brightgreen.svg?logo=telegram&color=%234b4e52)](https://t.me/joinchat/Tb3iAhuMZsyfspxhEWQLvw)  


# Getting Started
You are required to have baisc smart contract and solidity knowledge to run this project.

To start, clone the repo and run the following command inside the project directory to install node.js required packages. If you don't already have node.js installed, click [here][NODE] 
```sh
$ npm install
```
## Prerequesites
Intall [Truffle][TRUFFLE] and [OpenZeppelin][OZ] inside the project directory.

```sh
# Install Truffle
$ npm install truffle -g
$ yarn

#Install OpenZeppelin
$ npm install @openzeppelin/cli
$ npx openzeppelin init
```

## Deployment
You can deploy the smart contracts on currently supported networks
-- [Ganache][GAN] (for development purpose)
-- Ropsten - 
-- Kovan
-- Mainnet

### Variables
The followings are the variables required when deploy to the network.
```sh
$ export NETWORK=""  #development | ropsten | kovan | mainnet
$ export WALLET_PRIVATE_KEY="" #wallet private key
$ export BUILD_DIR="./build/$network" #build directory
$ export ETH_GAS_PRICE=650000000000 #change gas price accordingly
$ export MIGRATIONS_DIR="" #./migrations/linaToken | ./migrations/buildr
```

### Example
Deploying to Ganache, create a shell script as below and run:
```shell
#!/bin/bash
export NETWORK="development"

read -s -p "input private key:" privateKey
export WALLET_PRIVATE_KEY=$privateKey

export MIGRATIONS_DIR="./migrations/linaToken"
export BUILD_DIR="./build/$network"
export ETH_GAS_PRICE=650000000000

truffle migrate --network $network 
```
After successfully run, change the script `MIGRATIONS_DIR="./migrations/buildr"` and run the revised script.

### Deployed Addresses
you will find the created contract addresses in the log/[NETWORK]-deployed.json. In this case, log/development-deployed.json.

```json
{
  "LnTokenStorage": {
    "address": "0x0FCecff4bc941d8FCEfA34d63A1881647c4b9387"
  },
  "LnProxyERC20": {
    "address": "0xbbed423b067E4A7c6fe5F3dFbF8634a1A626D970"
  },
  "LinearFinance": {
    "address": "0x23189B2556dA47c8950C87034BB3150DA01b5342"
  },
  "SafeDecimalMath": {
    "address": "0x8e6E7795F0c32644f8b661aC89dfFef98B5F06a5"
  },
  "LnAssetSystem": {
    "address": "0x46694af06838b005ef23bb8f80D1107cdd7b93Db"
  },
  "LnConfig": {
    "address": "0x0e42BCF1e77eB2C73EC4d4d9c11CF0Fa3D3E8A6E"
  },
  "LnAccessControl": {
    "address": "0xB2039e5e8e252CD1960621AC8689A9e3693817e5"
  },
  "LnChainLinkPrices": {
    "address": "0xef8e7dfD4268D18B5beDE9F0b2A78539b26fdb95"
  },
  "LnDebtSystem": {
    "address": "0x38876674482774130c26DEeA07990B0AEb0ef83E"
  },
  "LnCollateralSystem": {
    "address": "0xC9DA8BaBfa60bc8CDd521C7CCe8Ccea2aB3F38BA"
  },
  "LnBuildBurnSystem": {
    "address": "0x31634Db5857D80e18489063A931b8dC4e88e8435"
  },
  "LnExchangeSystem": {
    "address": "0xF07E8eC6d6401Bb9f86d744603660cf7388Ab4Fa"
  },
  "LnRewardLocker": {
    "address": "0xAa306439a8D3c2A495B2D216ABe4efE3DE091f77"
  },
  "LnFeeSystem": {
    "address": "0x90B7e503fA2b0D2dFa74AFBC36B38b5321a6BbC3"
  },
  "LnProxyERC20_lUSD": {
    "address": "0x5411292d40e73E1D4B9b053c2bD172406b637007"
  },
  "LnTokenStorage_lUSD": {
    "address": "0xe22977584e8e42f639212465A41911fCC4753DF7"
  },
  "LnAsset_lUSD": {
    "address": "0xa18ef0860cCDBe36cA6A066C0702D171326a6f15"
  },
  "LnProxyERC20_lBTC": {
    "address": "0x846A82483Fc082E85E1b2f0C611D3FC23B5c35dd"
  },
  "LnTokenStorage_lBTC": {
    "address": "0xf56512F76c81601A7b979A14684baB8E6C6AaaB2"
  },
  "LnAsset_lBTC": {
    "address": "0x215B367C82b2BcC7B208b6E2a748bA5A442fCa67"
  },
  "LnProxyERC20_lETH": {
    "address": "0x77B9911963Bf68419CdD967e1173D9F017B2A3Ff"
  },
  "LnTokenStorage_lETH": {
    "address": "0xF6B53baB30CBBFa4FF82e9ee88449BAb9E15E15c"
  },
  "LnAsset_lETH": {
    "address": "0xa8d027ad015b6601b8A300b59E14219D7076f07F"
  },
  "SafeDecimalMath_1603423216172": {
    "address": "0xe7Dc8B89Dd2BBE69E29bAc97836248d941297d0D"
  },
  "SafeDecimalMath_1603423403903": {
    "address": "0xbCfaA86D9e60fa4EebE46507444908d9892Ce811"
  }
}
```

[NODE]: <https://nodejs.org>
[TRUFFLE]: <https://www.trufflesuite.com/truffle>
[OZ]: <https://openzeppelin.com>
[GAN]: <https://www.trufflesuite.com/ganache>
