import { DateTime } from "luxon";
import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const firstPeriodStartTime: DateTime = DateTime.fromISO(
    "2020-12-30T00:00:00Z"
  );
  const rewardSigner: string = "0xB2f619AfE7bB8283c82fDfF4b3E5Af02070493e0";
  const lusdAddress: string = "0xc3C6cf6Bbca7B759d23a2586e80F795C57A32beF";
  const collateralSystemAddress: string =
    "0xBb7cF9A1b0C2aF40B98a9018E3e9f756fE0aD3bb";

  const LnRewardLocker = await ethers.getContractFactory("LnRewardLocker");
  const LnRewardSystem = await ethers.getContractFactory("LnRewardSystem");

  const lnRewardLocker = LnRewardLocker.attach(
    "0x6707e1B78DE157Aac4115ce09dBC4b699d89E331"
  );

  const lnRewardSystem = await upgrades.deployProxy(
    LnRewardSystem,
    [
      firstPeriodStartTime.toSeconds(), // _firstPeriodStartTime,
      rewardSigner, // _rewardSigner,
      lusdAddress, // _lusdAddress,
      collateralSystemAddress, // _collateralSystemAddress,
      lnRewardLocker.address, // _rewardLockerAddress,
      admin.address, // _admin,
    ],
    {
      initializer: "__LnRewardSystem_init",
    }
  );
  console.log("LnRewardSystem proxy deployed to:", lnRewardSystem.address);

  // Allow LnRewardSystem to append rewards
  await lnRewardLocker.connect(admin).Init(lnRewardSystem.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
