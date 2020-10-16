const { provider, wallet, getAbi, newContract } = require("./common");
const ethers = require("ethers")
const UINT = ethers.utils.parseEther("1"); //parseUnits(value, "ether").
const ZERO_BN = ethers.utils.parseEther("0"); 

let gasPrice = process.env.ETH_GAS_PRICE == null ? 10000000000 : process.env.ETH_GAS_PRICE;

const feesystem = newContract("LnFeeSystemTest", "0x8657f180611Ba12F9D2620FC9066aD1E866e0460");
const linaProxy = newContract("LnProxyERC20", "0x908B56f016233E84c391eebe52Ee4d461fD8fb87");

let OnePeriodSecs = null;

const rewards = ethers.utils.parseEther("1000"); 
let lastRewardPeriodId;
let lastTransferId;

async function Update() {
    try {
        if (OnePeriodSecs == null) {
            OnePeriodSecs = (await feesystem.OnePeriodSecs()).toNumber();
            console.log("get OnePeriodSecs", OnePeriodSecs);
        }
        // check if next period? switch
        let curRewardPeriod = await feesystem.curRewardPeriod();
        let periodid = curRewardPeriod.id.toNumber();
        let startTime = curRewardPeriod.startTime.toNumber();
        let curtime = Date.now()/1000;
        let nextPeriodTime = startTime + OnePeriodSecs + 120;
        if (curtime > nextPeriodTime) {
            console.log("switchPeriod", curtime);
            let estimateGas = await feesystem.connect(wallet).estimateGas.switchPeriod();
            let options = { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+10000 }
            await feesystem.connect(wallet).switchPeriod( options );

            periodid = periodid+1;
        }

        
        if (lastRewardPeriodId != periodid) {
            if (periodid != curRewardPeriod.id.toNumber() || curRewardPeriod.rewardsToDistribute.eq( ZERO_BN )) {
                console.log("reward", curtime );
                let estimateGas = await feesystem.connect(wallet).estimateGas.addCollateralRewards(rewards); // onlyDistributer
                let options = { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+20000 }
                await feesystem.connect(wallet).addCollateralRewards( rewards, options );
                lastRewardPeriodId = periodid;
                console.log("reward id", lastRewardPeriodId );
            }
        }

        if (lastTransferId != lastRewardPeriodId) {
            // transfer lina
            console.log("transfer lina", curtime );
            let estimateGas = await linaProxy.connect(wallet).estimateGas.transfer(feesystem.address, rewards);
            let options = { gasPrice:gasPrice, gasLimit:estimateGas.toNumber()+10000 }
            await linaProxy.connect(wallet).transfer(feesystem.address, rewards, options);
            lastTransferId = lastRewardPeriodId;
            console.log("transfer id", lastTransferId );
        }
    } catch(e) {
        console.error("error:", e);
    }
}

Update();

setInterval(() => {
    Update();
}, 60000);
