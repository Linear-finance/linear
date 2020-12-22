// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./SafeDecimalMath.sol";
import "./LnCollateralSystem.sol";
import "./LnBuildBurnSystem.sol";
import "./LnAddressCache.sol";

contract LnColateralBuildBurnAPI is LnAdminUpgradeable, PausableUpgradeable, LnAddressCache{
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    LnCollateralSystem private collaterSys;
    LnBuildBurnSystem public buildBurnSystem;

    function __LnCollateralBuildBurnAPI_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        address payable collateralAddress = payable(_addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ));
        collaterSys = LnCollateralSystem( collateralAddress );
        buildBurnSystem = LnBuildBurnSystem(_addressStorage.getAddressWithRequire( "LnBuildBurnSystem", "LnBuildBurnSystem address not valid" ));

        emit CachedAddressUpdated( "LnCollateralSystem", address(collaterSys) );
        emit CachedAddressUpdated( "LnBuildBurnSystem", address(buildBurnSystem) );

    }


    // ------------------------------------------------------------------------
    function getSystemTotalCollateralInUsd() public view returns (uint256) {
        return collaterSys.GetSystemTotalCollateralInUsd();
    }

    function getUserTotalCollateralInUsd(address _user) public view returns (uint256) {
        return collaterSys.GetUserTotalCollateralInUsd(_user);
    }

    function getUserCollateral(address _user, bytes32 _currency) external view returns (uint256) {
        return collaterSys.GetUserCollateral(_user, _currency);
    }

    function getUserCollaterals(address _user) external view returns (bytes32[] memory, uint256[] memory) {

        return collaterSys.GetUserCollaterals(_user);
    }

    function isSatisfyTargetRatio(address _user) public view returns(bool) {
        return collaterSys.IsSatisfyTargetRatio(_user);
    }

    function maxRedeemableInUsd(address _user) public view returns (uint256) {
        return collaterSys.MaxRedeemableInUsd(_user);
    }

    function maxRedeemable(address user, bytes32 _currency) public view returns(uint256) {
        return collaterSys.MaxRedeemable(user, _currency);
    }

    function maxCanBuildAsset(address user) public view returns(uint256) {
        return buildBurnSystem.MaxCanBuildAsset(user);
    }

    // need approve LnCollateralSystem.
    // input collateral currency and amount
    function collateralAndBuild(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        collaterSys.setMessageSender(msg.sender);
        buildBurnSystem.setMessageSender(msg.sender);
        collaterSys.Collateral(_currency, _amount);
        uint256 canBuild = buildBurnSystem.calcBuildAmount(_amount);
        buildBurnSystem.BuildAsset(canBuild);
        return true;
    }

    function burnAndRedeemMax(bytes32 _currency) external whenNotPaused {
        collaterSys.setMessageSender(msg.sender);
        buildBurnSystem.setMessageSender(msg.sender);
        uint256 maxRedeem = maxRedeemable(msg.sender, _currency);
        buildBurnSystem.BurnAsset(maxRedeem);
        collaterSys.RedeemMax(_currency);
    }

    //input burn usd amount and redeem currency
    function burnAndRedeem(bytes32 _currency, uint256 _amount) public whenNotPaused returns (bool) {
        collaterSys.setMessageSender(msg.sender);
        buildBurnSystem.setMessageSender(msg.sender);
        buildBurnSystem.BurnAsset(_amount);
        uint256 redeemAble = buildBurnSystem.calcRedeemAmount(_amount);
        collaterSys.Redeem(_currency, redeemAble);
        return true;
    }

    // // payable eth receive,
    // function collateralEthAndBuild() external payable whenNotPaused returns (bool) {
    //     collaterSys.setMessageSender(msg.sender);
    //     collaterSys.setMessageVaule(msg.value);
    //     buildBurnSystem.setMessageSender(msg.sender);
    //     collaterSys.CollateralEth();
    //     uint256 maxCanBuild = maxCanBuildAsset(msg.sender);
    //     buildBurnSystem.BuildAsset(maxCanBuild);
    //     return true;
    // }

    // function burnAndRedeemETH( uint256 _amount) external whenNotPaused returns (bool) {
    //     address payable user = msg.sender;
    //     buildBurnSystem.BurnAsset(user, _amount);
    //     uint256 maxRedeem = maxRedeemable(user, "ETH");
    //     collaterSys.RedeemETH(user, maxRedeem);
    //     return true;
    // }

    // burn to target ratio
    function burnAssetToTarget() external whenNotPaused returns(bool) {
        // address user = msg.sender;
        return buildBurnSystem.BurnAssetToTarget();
    }

    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event CollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
}
