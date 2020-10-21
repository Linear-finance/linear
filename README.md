安装truffle

```bash
npm install -g truffle
```

安装依赖库

```
yarn
```



**如果上面找不到truffle command, 用**

npx truffle xxxx



# openzeppelin

它的文档：

https://docs.openzeppelin.com/cli/2.8/getting-started

初始化项目，一个项目只需要执行一次

```bash
npm install @openzeppelin/cli --save-dev
npx openzeppelin init   or npx oz init
#具体要装哪个？
npm install @openzeppelin/upgrades --save #这个好像没什么用
npm install --save-dev @openzeppelin/contracts 
```

其它openzeppelin命令没用到。



# Deploy

## environment variable:

**NETWORK** : setup truffle network.

**WALLET_PRIVATE_KEY**: deploy ETH private key.

**MIGRATIONS_DIR**: migrations directory.

**INFURA_PROJECT_ID**: Infura project ID.

**BUILD_DIR**: contract output directory.

**ETH_GAS_PRICE**: gas price.

## Deploy script

run in root directory.

```shell
#!/bin/bash
network="mainnet"
echo "network is $network"

export NETWORK=$network

read -s -p "input private key:" privateKey

export WALLET_PRIVATE_KEY=$privateKey

export MIGRATIONS_DIR="./migrations"

#set your id
export INFURA_PROJECT_ID="";

export BUILD_DIR="./build/$network"

export ETH_GAS_PRICE=650000000000

truffle migrate --network $network 
```

# 文件说明：

| build       | 部署合约时，abi文件输出目录                                  |
| ----------- | ------------------------------------------------------------ |
| contracts   | 合约代码目录                                                 |
| log         | 记录部署合约地址。truffle也会记录合约地址到abi文件，当migrations中某step失败就没记录下来 |
| migrations  | 部署合约脚本。下面的子目录： buildr 主要部署buildr相关合约，测试网用到了； fundVault 没用到；linaToken 主网部署lina一系列操作；tokenLocker 没有用到。 |
| online_tool | 合约调用，查询脚本．**ropsten_feesystem.js** 用定时开启feesystem的下一阶段。**linearPriceUpdater** 定时更新lina价格。 |
| test        | 合约测试代码，本地可以配置 ganache 结点，然后用命令 truffle test 跑测试 |
| utility     | 辅组部署合约脚本                                             |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |
|             |                                                              |

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

