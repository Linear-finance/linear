// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./LnAccessControl.sol";
import "./LnAssetSystem.sol";
import "./LnConfig.sol";

contract LnDebtSystem is LnAdmin, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAccessControl private accessCtrl;
    LnAssetSystem private assetSys;
    // -------------------------------------------------------
    struct DebtData {
        uint256 debtProportion;
        uint256 debtFactor;
    }
    mapping(address => DebtData) public userDebtState;

    //use mapping to store array data
    mapping (uint256=>uint256) public lastDebtFactors; // Note: 能直接记 factor 的记 factor, 不能记的就用index查
    uint256 public debtCurrentIndex; // length of array. this index of array no value
    // follow var use to manage array size.
    uint256 public lastCloseAt; // close at array index
    uint256 public lastDeletTo; // delete to array index, lastDeletTo < lastCloseAt
    uint256 public constant MAX_DEL_PER_TIME = 50;
    // 

    // -------------------------------------------------------
    constructor(address admin) public LnAdmin(admin) {
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateUserDebtLog(address addr, uint256 debtProportion, uint256 debtFactor);
    event PushDebtLog(uint256 index, uint256 newFactor);

    // ------------------ system config ----------------------
    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        accessCtrl = LnAccessControl(_addressStorage.getAddressWithRequire( "LnAccessControl", "LnAccessControl address not valid" ));
        assetSys =   LnAssetSystem(  _addressStorage.getAddressWithRequire( "LnAssetSystem",   "LnAssetSystem address not valid" ));

        emit updateCachedAddress( "LnAccessControl", address(accessCtrl) );
        emit updateCachedAddress( "LnAssetSystem",   address(assetSys) );
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

    function _pushDebtFactor(uint256 _factor) private {
        if (debtCurrentIndex == 0) {
            lastDebtFactors[debtCurrentIndex] = SafeDecimalMath.preciseUnit();
        } else {
            lastDebtFactors[debtCurrentIndex] = lastDebtFactors[debtCurrentIndex-1].multiplyDecimalRoundPrecise(_factor);
        }
        emit PushDebtLog(debtCurrentIndex, lastDebtFactors[debtCurrentIndex]);

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
        userDebtState[_user].debtFactor = lastDebtFactors[debtCurrentIndex];
        emit UpdateUserDebtLog(_user, _debtProportion, userDebtState[_user].debtFactor);
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
        return lastDebtFactors[debtCurrentIndex];
    }

    function LastSystemDebtFactor() external view returns (uint256) {
        return _lastSystemDebtFactor();
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
}
