yarn

truffle migrate --network ropsten

truffle migrate --network ropsten -f

use ganache network
truffle migrate --network development 



truffle test test/TestAccessControl.js  --network local



**如果上面找不到truffle command, 用**

npx truffle xxxx



openzeppelin是要用控制台交互的方式去deploy合约？它的文档是这样。

https://docs.openzeppelin.com/cli/2.8/getting-started

初始化项目，一个项目只需要执行一次

```bash
npm install @openzeppelin/cli --save-dev
npx openzeppelin init   or npx oz init
#具体要装哪个？
npm install @openzeppelin/upgrades --save #这个好像没什么用
npm install --save-dev @openzeppelin/contracts 
```

其它

yarn

npx oz --help

npx oz compile

可以为openzeppelin在根目录建network.js配置文件如下，但是它默认也可以用truffle-config.js的（即不用额外的配置）。我们用了truffle,network.js就不用了。

```
module.exports = { 
 networks: { 
 development: { 
 protocol: 'http', 
 host: 'localhost', 
 port: 8545, 
 gas: 5000000, 
 gasPrice: 5e9, 
 networkId: '*', 
 }, 
 test: { 
 protocol: 'http', 
 host: 'localhost', 
 port: 9555, 
 gas: 5000000, 
 gasPrice: 5e9, 
 networkId: '4447', 
 }, 
 }, 
 }; 

```



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

