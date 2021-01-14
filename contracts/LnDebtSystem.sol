// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./interfaces/ILnAccessControl.sol";
import "./interfaces/ILnAssetSystem.sol";

contract LnDebtSystem is LnAdminUpgradeable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // -------------------------------------------------------
    // need set before system running value.
    ILnAccessControl private accessCtrl;
    ILnAssetSystem private assetSys;
    // -------------------------------------------------------
    struct DebtData {
        uint256 debtProportion;
        uint256 debtFactor; // PRECISE_UNIT
    }
    mapping(address => DebtData) public userDebtState;

    //use mapping to store array data
    mapping (uint256=>uint256) public lastDebtFactors; // PRECISE_UNIT Note: 能直接记 factor 的记 factor, 不能记的就用index查
    uint256 public debtCurrentIndex; // length of array. this index of array no value
    // follow var use to manage array size.
    uint256 public lastCloseAt; // close at array index
    uint256 public lastDeletTo; // delete to array index, lastDeletTo < lastCloseAt
    uint256 public constant MAX_DEL_PER_TIME = 50;
    // 

    // -------------------------------------------------------
    function __LnDebtSystem_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateUserDebtLog(address addr, uint256 debtProportion, uint256 debtFactor, uint256 timestamp);
    event PushDebtLog(uint256 index, uint256 newFactor, uint256 timestamp);

    // ------------------ system config ----------------------
    function updateAddressCache( ILnAddressStorage _addressStorage ) onlyAdmin public override
    {
        accessCtrl = ILnAccessControl(_addressStorage.getAddressWithRequire( "LnAccessControl", "LnAccessControl address not valid" ));
        assetSys =   ILnAssetSystem(  _addressStorage.getAddressWithRequire( "LnAssetSystem",   "LnAssetSystem address not valid" ));

        emit CachedAddressUpdated( "LnAccessControl", address(accessCtrl) );
        emit CachedAddressUpdated( "LnAssetSystem",   address(assetSys) );
    }
    
    // -----------------------------------------------
    modifier OnlyDebtSystemRole(address _address) {
        require(accessCtrl.hasRole(accessCtrl.DEBT_SYSTEM(), _address), "Need debt system access role");
        _;
    }

    function SetLastCloseFeePeriodAt(uint256 index) external OnlyDebtSystemRole(msg.sender) {
        require(index >= lastCloseAt, "Close index can not return to pass");
        require(index <= debtCurrentIndex, "Can not close at future index");
        lastCloseAt = index;
    }

    /**
     * @dev A temporary method for migrating debt records from Ethereum to Binance Smart Chain.
     */
    function importDebtData(
        address[] calldata users,
        uint256[] calldata debtProportions,
        uint256[] calldata debtFactors,
        uint256[] calldata timestamps
    ) external onlyAdmin {
        require(
            users.length == debtProportions.length &&
                debtProportions.length == debtFactors.length &&
                debtFactors.length == timestamps.length,
            "Length mismatch"
        );

        for (uint256 ind = 0; ind < users.length; ind++) {
            address user = users[ind];
            uint256 debtProportion = debtProportions[ind];
            uint256 debtFactor = debtFactors[ind];
            uint256 timestamp = timestamps[ind];

            uint256 currentIndex = debtCurrentIndex + ind;

            lastDebtFactors[currentIndex] = debtFactor;
            userDebtState[user] = DebtData({debtProportion: debtProportion, debtFactor: debtFactor});

            emit PushDebtLog(currentIndex, debtFactor, timestamp);
            emit UpdateUserDebtLog(user, debtProportion, debtFactor, timestamp);
        }

        debtCurrentIndex = debtCurrentIndex + users.length;
    }

    function _pushDebtFactor(uint256 _factor) private {
        if (debtCurrentIndex == 0 || lastDebtFactors[debtCurrentIndex-1] == 0) { // init or all debt has be cleared, new set value will be one unit
            lastDebtFactors[debtCurrentIndex] = SafeDecimalMath.preciseUnit();
        } else {
            lastDebtFactors[debtCurrentIndex] = lastDebtFactors[debtCurrentIndex-1].multiplyDecimalRoundPrecise(_factor);
        }
        emit PushDebtLog(debtCurrentIndex, lastDebtFactors[debtCurrentIndex], block.timestamp);

        debtCurrentIndex = debtCurrentIndex.add(1);

        // delete out of date data
        if (lastDeletTo < lastCloseAt) { // safe check 
            uint256 delNum = lastCloseAt - lastDeletTo;
            delNum = (delNum > MAX_DEL_PER_TIME) ? MAX_DEL_PER_TIME : delNum; // not delete all in one call, for saving someone fee.
            for (uint256 i=lastDeletTo; i<delNum; i++) {
                delete lastDebtFactors[i];
            }
            lastDeletTo = lastDeletTo.add(delNum);
        }
    }

    function PushDebtFactor(uint256 _factor) external OnlyDebtSystemRole(msg.sender) {
        _pushDebtFactor(_factor);
    }

    function _updateUserDebt(address _user, uint256 _debtProportion) private {
        userDebtState[_user].debtProportion = _debtProportion;
        userDebtState[_user].debtFactor = _lastSystemDebtFactor();
        emit UpdateUserDebtLog(_user, _debtProportion, userDebtState[_user].debtFactor, block.timestamp);
    }

    // need update lastDebtFactors first
    function UpdateUserDebt(address _user, uint256 _debtProportion) external OnlyDebtSystemRole(msg.sender) {
        _updateUserDebt(_user, _debtProportion);
    }

    function UpdateDebt(address _user, uint256 _debtProportion, uint256 _factor) external OnlyDebtSystemRole(msg.sender) {
        _pushDebtFactor(_factor);
        _updateUserDebt(_user, _debtProportion);
    }

    function GetUserDebtData(address _user) external view returns (uint256 debtProportion, uint256 debtFactor) {
        debtProportion = userDebtState[_user].debtProportion;
        debtFactor = userDebtState[_user].debtFactor;
    }

    function _lastSystemDebtFactor() private view returns (uint256) {
        if (debtCurrentIndex == 0) {
            return SafeDecimalMath.preciseUnit();
        }
        return lastDebtFactors[debtCurrentIndex-1];
    }

    function LastSystemDebtFactor() external view returns (uint256) {
        return _lastSystemDebtFactor();
    }

    function GetUserCurrentDebtProportion(address _user) public view returns(uint256) {
        uint256 debtProportion = userDebtState[_user].debtProportion;
        uint256 debtFactor = userDebtState[_user].debtFactor;

        if (debtProportion == 0) {
            return 0;
        }

        uint256 currentUserDebtProportion = _lastSystemDebtFactor()
                .divideDecimalRoundPrecise(debtFactor)
                .multiplyDecimalRoundPrecise(debtProportion);
        return currentUserDebtProportion;
    }

    /**
     *
     *@return [0] the debt balance of user. [1] system total asset in usd.
     */
    function GetUserDebtBalanceInUsd(address _user) external view returns (uint256, uint256) {
        uint256 totalAssetSupplyInUsd = assetSys.totalAssetsInUsd();

        uint256 debtProportion = userDebtState[_user].debtProportion;
        uint256 debtFactor = userDebtState[_user].debtFactor;

        if (debtProportion == 0) {
            return (0, totalAssetSupplyInUsd);
        }

        uint256 currentUserDebtProportion = _lastSystemDebtFactor()
                .divideDecimalRoundPrecise(debtFactor)
                .multiplyDecimalRoundPrecise(debtProportion);
        uint256 userDebtBalance = totalAssetSupplyInUsd
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(currentUserDebtProportion)
                .preciseDecimalToDecimal();

        return (userDebtBalance, totalAssetSupplyInUsd);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[42] private __gap;
}
