// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnCollateralSystem.sol";
import "./LnBuildBurnSystem.sol";
import "./LnAddressCache.sol";

contract LnColateralBuildBurnAPI is LnAdmin, Pausable, LnAddressCache{
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    LnCollateralSystem private collaterSys;
    LnBuildBurnSystem public buildBurnSystem;

    constructor(address admin) public LnAdmin(admin) {
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

        emit updateCachedAddress( "LnCollateralSystem", address(collaterSys) );
        emit updateCachedAddress( "LnBuildBurnSystem", address(buildBurnSystem) );

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
        address user = msg.sender;
        collaterSys.Collateral(user, _currency, _amount);
        uint256 canBuild = buildBurnSystem.calcBuildAmount(user, _amount);
        buildBurnSystem.BuildAsset(user, canBuild);
        return true;
    }

    function burnAndRedeemMax(bytes32 _currency) external whenNotPaused {
        address user = msg.sender;
        uint256 maxRedeem = maxRedeemable(user, _currency);
        buildBurnSystem.BurnAsset(user, maxRedeem);
        collaterSys.RedeemMax(user, _currency);
    }

    //input burn usd amount and redeem currency
    function burnAndRedeem(bytes32 _currency, uint256 _amount) public whenNotPaused returns (bool) {
        address user = msg.sender;
        buildBurnSystem.BurnAsset(user, _amount);
        uint256 redeemAble = buildBurnSystem.calcRedeemAmount(user, _amount);
        collaterSys.Redeem(user, _currency, redeemAble);
        return true;
    }

    receive() external whenNotPaused payable {
        address user = msg.sender;
        uint256 ethAmount = msg.value;
        collaterSys.CollateralEth(user, ethAmount);
    }

    // payable eth receive,
    function collateralEthAndBuild() external payable whenNotPaused returns (bool) {
        address user = msg.sender;
        uint256 ethAmount = msg.value;
        collaterSys.CollateralEth(user, ethAmount);
        uint256 macCanBuild = maxCanBuildAsset(user);
        buildBurnSystem.BuildAsset(user, macCanBuild);
        return true;
    }

    function burnAndRedeemETH( uint256 _amount) external whenNotPaused returns (bool) {
        address payable user = msg.sender;
        buildBurnSystem.BurnAsset(user, _amount);
        uint256 maxRedeem = maxRedeemable(user, "ETH");
        collaterSys.RedeemETH(user, maxRedeem);
        return true;
    }

    // burn to target ratio
    function burnAssetToTarget() external whenNotPaused returns(bool) {
        address user = msg.sender;
        return buildBurnSystem.BurnAssetToTarget(user);
    }

    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event CollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
}
