
async function GetDeployed(contract) {
    try {
        var deployed = await contract.deployed();
        return deployed;
    }
    catch (e) {
    }
    return null
}

async function DeployIfNotExist(deployer, contract) {
    var deployed = await GetDeployed(contract);
    if (deployed == null) {
        deployed = await deployer.deploy(contract);
    }
    return deployed;
}

exports.GetDeployed = GetDeployed
exports.DeployIfNotExist = DeployIfNotExist
