import { Duration } from "luxon";
import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const bandProtocolAddress = "0xA4e2866745E115F4467923603fFDe0f73732B849";

  const LnBandProtocol = await ethers.getContractFactory("LnBandProtocol", {
    signer: deployer,
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  await upgrades.upgradeProxy(bandProtocolAddress, LnBandProtocol, {
    unsafeAllowLinkedLibraries: true,
  });

  const lnBandProtocol = LnBandProtocol.attach(bandProtocolAddress);

  await lnBandProtocol.connect(admin).setStalePeriod(
    Duration.fromObject({
      minutes: 10,
    }).as("seconds") // _time
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
