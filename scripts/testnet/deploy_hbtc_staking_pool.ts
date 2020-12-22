import { ethers } from "hardhat";
import { DateTime, Duration } from "luxon";
import { expandTo18Decimals } from "../utilities";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const HbtcStakingPool = await ethers.getContractFactory("HbtcStakingPool");

  const startTime: DateTime = DateTime.fromISO("2020-12-22T04:20:00Z");
  const duration: Duration = Duration.fromObject({ hours: 8 });

  const mockHbtc = await MockERC20.deploy(
    "Huobi BTC", // _name
    "HBTC" // _symbol
  );
  console.log("Mock HBTC deployed to:", mockHbtc.address);

  const hbtcStakingPool = await HbtcStakingPool.deploy(
    mockHbtc.address, // _poolToken
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
