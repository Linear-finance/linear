

安装nodejs （代码可运行在的版本： v10.19.0， 其它版本应该也没大问题，如果有再更新版本）

安装truffle

```bash
npm install -g truffle
```

安装依赖库

```
yarn
```

安装 ganache 作为本地测试结点



**如果上面找不到truffle command, 用**

npx truffle xxxx



# openzeppelin

它的文档：

https://docs.openzeppelin.com/cli/2.8/getting-started



# Deploy

## environment variable:

**NETWORK** : setup truffle network.

**WALLET_PRIVATE_KEY**: deploy ETH private key.

**MIGRATIONS_DIR**: migrations directory.

**INFURA_PROJECT_ID**: Infura project ID.

**BUILD_DIR**: contract output directory.

**ETH_GAS_PRICE**: gas price.

## Deploy shell script

run in root directory.

```shell
#!/bin/bash
network="mainnet"
echo "network is $network"

export NETWORK=$network

read -s -p "input private key:" privateKey

export WALLET_PRIVATE_KEY=$privateKey

export MIGRATIONS_DIR="./migrations/linaToken"

#set your infura id
export INFURA_PROJECT_ID="";

export BUILD_DIR="./build/$network"

export ETH_GAS_PRICE=650000000000

# you can use `-f number` to force run spec step.
# as : truffle migrate --network $network -f 5
truffle migrate --network $network 
```

## 部署

### 1、部署LINA token

修改部署shell脚本

```
export MIGRATIONS_DIR="./migrations/linaToken"
```

./migrations/linaToken 里面的step已经全部在主网运行，如果的新的环境中部署，只要完成前面两个step就好了。测试环境跑完也没问题。

### 2、部署buildr

修改部署shell脚本

```
export MIGRATIONS_DIR="./migrations/buildr"
```

在 3_deploy_common.js 里面包含buildr所需的合约

## 运营脚本

### 1、定期更新价格

目录 online_tool/linearPriceUpdater 里的脚本需要后台跑起来，定期从uniswap上读取价格并更新到合约LnChainLinkPrices里。安装该目录下的package.json后，可以用下面的bash运行。

```bash
#!/bin/bash

#cd ./price_updater

network="ropsten"
echo "network is $network"

export NETWORK=$network

read -s -p "input private key:" privateKey

echo ""

export WALLET_PRIVATE_KEY=$privateKey

# TODO: set up infura id
export INFURA_PROJECT_ID="";

export ETH_GAS_PRICE=10000000000

#node main.js
nohup node main.js > output.log &
```



### 2、定期开启feeSystem奖励周期

见 online_tool/ropsten_feesystem.js . 可以通过下面bash跑起来，需要设置INFURA_PROJECT_ID

```bash
#!/bin/bash

network="ropsten"
echo "network is $network"

export NETWORK=$network

read -s -p "input private key:" privateKey

export WALLET_PRIVATE_KEY=$privateKey

export BUILD_DIR="./build/$network"

export MIGRATIONS_DIR="./migrations/$network"

# TODO: set up infura id
export INFURA_PROJECT_ID="";

export ETH_GAS_PRICE=1000000000

nohup node online_tool/ropsten_feesystem.js > feesystem.log &
```





# 文件说明：

| build                  | 部署合约时，abi文件输出目录                                  |
| ---------------------- | ------------------------------------------------------------ |
| contracts              | 合约代码目录                                                 |
| log                    | 记录部署合约地址。truffle也会记录合约地址到abi文件，当migrations中某step失败就没记录下来 |
| migrations             | 部署合约脚本。下面的子目录： buildr 主要部署buildr相关合约，测试网用到了； fundVault 没用到；linaToken 主网部署lina一系列操作；tokenLocker 没有用到。 |
| online_tool            | 合约调用，查询脚本．**ropsten_feesystem.js** 用定时开启feesystem的下一阶段。**linearPriceUpdater** 定时更新lina价格。 |
| test                   | 合约测试代码，本地可以配置 ganache 结点，然后用命令 truffle test 跑测试 |
| utility                | 辅组部署合约脚本                                             |
| migrations/linaToken   | 里面的部署脚本已经在主网运行。                               |
| migrations/buildr      | 里面的部署脚本还没在主网运行，只在ropsten已经部署。          |
| LinearFinanceToken.sol | LINA token主合约 LinearFinance                               |
| LnAccessControl.sol    | 合约权限控制                                                 |
| LnAssetSystem.sol      | 合成资产管理合约。同时继承LnAddressStorage，记录系统中需要交互的合约地址，以方便通过名称获取合约地址。 |
| LnCollateralSystem.sol | 抵押系统，在生成合成资产前需要做抵押。                       |
| LnBuildBurnSystem.sol  | 生成和销毁合成资产系统。生成和销毁lUSD                       |
| LnChainLinkPrices.sol  | 价格查询系统                                                 |
| LnFeeSystem.sol        | exchange的手续费奖励和通胀奖励发放                           |
| LnExchangeSystem.sol   | 合成资产交易系统                                             |
| LnRewardLocker.sol     | LnFeeSystem 里的锁定的通胀奖励                               |
|                        |                                                              |
|                        |                                                              |
|                        |                                                              |


# 债务占比数据

在LnDebtSystem.sol里，用户的债务数据 userDebtState，数据结构

```
    struct DebtData {
        uint256 debtProportion;// 因个人主动操作引起债务变化时，债务占比
        uint256 debtFactor; //单位 PRECISE_UNIT， 全局因子
    }
```

全局债务因子 lastDebtFactors

计算用户当前债务占比

```
    function GetUserCurrentDebtProportion(address _user) public view returns(uint256) {
        uint256 debtProportion = userDebtState[_user].debtProportion;
        uint256 debtFactor = userDebtState[_user].debtFactor;

        if (debtProportion == 0) {
            return 0;
        }

        uint256 currentUserDebtProportion = _lastSystemDebtFactor()
                .divideDecimalRoundPrecise(debtFactor)
                .multiplyDecimalRoundPrecise(debtProportion);
        return currentUserDebtProportion;
    }
```



