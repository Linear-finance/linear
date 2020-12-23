import { ethers } from "hardhat";
import { DateTime, Duration } from "luxon";
import { expandTo18Decimals } from "../utilities";

async function main() {
  const HbtcStakingPool = await ethers.getContractFactory("HbtcStakingPool");

  const startTime: DateTime = DateTime.fromISO("2020-12-23T08:00:00Z");
  const duration: Duration = Duration.fromObject({ weeks: 8 });

  const hbtcTokenAddress: string = "0x0316EB71485b0Ab14103307bf65a021042c6d380";

  const hbtcStakingPool = await HbtcStakingPool.deploy(
    hbtcTokenAddress, // _poolToken
    startTime.toSeconds(), // _startTime
    startTime.plus(duration).toSeconds(), // _endTime
    expandTo18Decimals(200), // _maxStakeAmount
    expandTo18Decimals(20_000_000) // _totalRewardAmount
  );
  console.log("HbtcStakingPool deployed to:", hbtcStakingPool.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
