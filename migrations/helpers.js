const {DeployWithEstimate, CallWithEstimateGas, DeployWithEstimateSuffix} = require("../utility/truffle-tool");

const LnAssetUpgradeable = artifacts.require("LnAssetUpgradeable");
const LnProxyERC20 = artifacts.require("LnProxyERC20");
const LnTokenStorage = artifacts.require("LnTokenStorage");

async function newAssetToken(deployer, keyname, name, symbol, admin, kLnAssetSystem) {
  let kAsset = await DeployWithEstimateSuffix(deployer, name, LnAssetUpgradeable);

  await CallWithEstimateGas(kAsset.__LnAssetUpgradeable_init, keyname, name, symbol, admin);
  await CallWithEstimateGas(kAsset.updateAddressCache, kLnAssetSystem.address);

  await CallWithEstimateGas(kLnAssetSystem.addAsset, kAsset.address);

  //record kAsset.address by sp name
  return kAsset;
}

exports.newAssetToken = newAssetToken