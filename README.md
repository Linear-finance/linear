# Linear Finance

![GitHub package.json version](https://img.shields.io/github/package-json/v/Linear-finance/linear) ![GitHub top language](https://img.shields.io/github/languages/top/Linear-finance/linear) [![Test with Hardhat](https://github.com/Linear-finance/linear/actions/workflows/hardhat-test.yml/badge.svg)](https://github.com/Linear-finance/linear/actions/workflows/hardhat-test.yml)

Smart contracts implemented in Solidity for Linear Finance.

## Introduction

Linear Finance is a cross-chain compatible, decentralized delta-one asset protocol to cost-effectively and instantly create, manage, and trade synthetic assets with unlimited liquidity.

Linear Finance ("Linear") is a non-custodial, cross-chain compatible, delta-one asset protocol. Linear's long term DeFi vision is to increase inclusiveness and democratize access to investment assets (digital and traditional). Tremendous value exists in the ability for investors to easily and quickly invest, save fees, and secure assets at fair market value. Linear combines substantial technical experience from numerous crypto projects with extensive financial experience in exotic and structured assets from traditional global asset management firms to bring to market one of the first DeFi projects built upon Ethereum with cross-chain compatibility. Linear will allow users to build and manage spot or portfolio exposures with a slew of innovative digital and traditional financial products.

## Prerequisite

A recent version of [Node.js](https://nodejs.org/) and [Yarn](https://yarnpkg.com/) are required to compile the contracts and run tests.

## Compiling

Build the smart contracts using [Hardhat](https://hardhat.org/) with the following command:

```sh
$ yarn install
$ yarn compile
```

You can find compiled contracts in the `./artifacts` folder upon successful compilation.

## Testing

Run test cases with [Hardhat](https://hardhat.org/):

```sh
$ yarn test
```

## Community

[![Discord](https://img.shields.io/discord/738363983031173151?label=discord&logo=discord&style=plastic)](https://discordapp.com/channels/738363983031173151/) [![Twitter Follow](https://img.shields.io/twitter/follow/LinearFinance?label=LinearFinance&style=social)](https://twitter.com/LinearFinance) [![Chat on Telegram](https://img.shields.io/badge/Telegram-brightgreen.svg?logo=telegram&color=%234b4e52)](https://t.me/joinchat/Tb3iAhuMZsyfspxhEWQLvw)

## Contract Addresses

| Contract | Address | Chain |
| LinearFinance | 0x762539b45A1dCcE3D36d080F74d1AED37844b878 | BSC |
| LnAccessControl | 0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708 | BSC |
| LnAddressCache | - Inherited by LnAssetUpgradeable - | BSC |
| LnAddressStorage | - Inherited by LnAssetSystem - | BSC |
| LnAssetSystem | 0x1B220E982e5b4615715870533e968dff823BBED6 | BSC |
| LnAssetUpgradeable | - Liquid addresses are discoverable through the asset system - | BSC |
| LnBuildBurnSystem | 0x4B1356cf2068030924dBD8FcA1144AFBe847Af5F | BSC |
| LnCollateralSystem | 0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E | BSC |
| LnConfig | 0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455 | BSC |
| LnDebtSystem | 0xd5C594FB9055E34926CdB46b32D427c09146e96A | BSC |
| LnErc20Bridge | 0xF6a9bAfBc505a4Bc25888dc6aeAc57184eb2685B | BSC |
| LnExchangeSystem | 0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f | BSC |
| LnLiquidation | 0x4f6b688Ad01777Db42Ef65e64BB392D3b24a77A8 | BSC |
| LnOracleRouter | 0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB | BSC |
| LnPerpetual | - Liquid addresses are discoverable through the asset system - | BSC |
| LnPerpExchange | 0x22B822b0d0F1f282d28018aC3e319E3CB0c3F0ff | BSC |
| LnPerpPositionToken | -- | BSC |
| LnRewardLocker | 0x66D60EDc3876b8aFefD324d4edf105fd5c4aBeDc | BSC |
| LnRewardSystem | 0x9C86c4764E59A336C108A6F85be48F8a9a7FaD85 | BSC |
| LnVaultDynamicInterestPool | -- | BSC |
| LnVaultFixedRewardPool | 0xbd7281b64E5D7C22fd75710F577aD3Ef98164246  | BSC |
| SafeDecimalMath | 0xC065a00fbf75366D8D228f856D470C3A7c4D928c | BSC |
| TokenEscrow | -- | BSC |


## License

All code in this repository is licensed under [MIT](./LICENSE).
