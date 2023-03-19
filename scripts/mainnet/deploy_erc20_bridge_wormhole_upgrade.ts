import { ethers, upgrades } from "hardhat";

async function main() {
  const bridgeAddress = "0x6546454a1C120A7D7a142C6FA9ba9Ef5E9B6185C";

  const [deployer] = await ethers.getSigners();

  const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

  await upgrades.upgradeProxy(bridgeAddress, LnErc20Bridge, {
    unsafeAllowCustomTypes: true,
  });

  const bridge = LnErc20Bridge.attach(bridgeAddress);

  await bridge.connect(deployer).setUpWormhole(
    "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B", // _coreContract
    1 // _consistencyLevel
  );

  await bridge.connect(deployer).setBridgeAddressForChain(
    56, // chainId
    "0xF6a9bAfBc505a4Bc25888dc6aeAc57184eb2685B" // bridgeAddress
  );

  await bridge.connect(deployer).setWormholeNetworkIdForChain(
    56, // chainId
    4 // wormholeNetworkId
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
