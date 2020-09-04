// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./LnAccessControl.sol";
import "./LnAssetSystem.sol";

contract LnDebtSystem is LnAdmin {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAddressStorage private addressStorage;

    // -------------------------------------------------------
    struct DebtData {
        uint256 debtProportion;
        uint256 debtFactor;
    }
    mapping(address => DebtData) public userDebtState;

    //use mapping to store array data
    mapping (uint256=>uint256) public lastDebtFactors; // Note: 能直接记 factor 的记 factor, 不能记的就用index查
    uint256 public debtCurrentIndex; // length
    uint256 public maxDebtArraySize = 1000; // TODO: should base time? 一个周期内的记录 or 添加一个接口，close 一个周期时，把这个周期前不需要的delete

    // -------------------------------------------------------
    constructor(address _addrStorage) public LnAdmin(msg.sender) {
        addressStorage = LnAddressStorage(_addrStorage);
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateUserDebtLog(address addr, uint256 debtProportion, uint256 debtFactor);
    event PushDebtLog(uint256 index, uint256 newFactor);

    // ------------------ system config ----------------------
    function SetAddressStorage(address _address) public onlyAdmin {
        emit UpdateAddressStorage(address(addressStorage), _address);
        addressStorage = LnAddressStorage(_address);
    }
    
    function SetMaxDebtArraySize(uint256 _size) external onlyAdmin {
        // TODO need clear outof size data? never mind, keeping is no need more pay
        //if (_size < maxDebtArraySize) {
        //}
        require(_size > 0, "Must larger than zero");
        maxDebtArraySize = _size;
    }

    // -----------------------------------------------
    modifier OnlyDebtSystemRole(address _address) {
        LnAccessControl accessCtrl = LnAccessControl(addressStorage.getAddress("LnAccessControl"));
        require(accessCtrl.hasRole(accessCtrl.DEBT_SYSTEM(), _address), "Need debt system access role");
        _;
    }

    // ------------------ public ----------------------
    function PushDebtFactor(uint256 _factor) external OnlyDebtSystemRole(msg.sender) {
        if (debtCurrentIndex == 0) {
            lastDebtFactors[debtCurrentIndex] = SafeDecimalMath.preciseUnit();
        } else {
            lastDebtFactors[debtCurrentIndex] = lastDebtFactors[debtCurrentIndex-1].multiplyDecimalRoundPrecise(_factor);
        }
        emit PushDebtLog(debtCurrentIndex, lastDebtFactors[debtCurrentIndex]);

        debtCurrentIndex = debtCurrentIndex.add(1);

        // delete no need
        if (debtCurrentIndex > maxDebtArraySize) {
            delete lastDebtFactors[ debtCurrentIndex - maxDebtArraySize ];
        }
    }

    // need update lastDebtFactors first
    function UpdateUserDebt(address _user, uint256 _debtProportion) external OnlyDebtSystemRole(msg.sender) {
        userDebtState[_user].debtProportion = _debtProportion;
        userDebtState[_user].debtFactor = lastDebtFactors[debtCurrentIndex];
        emit UpdateUserDebtLog(_user, _debtProportion, userDebtState[_user].debtFactor);
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

    function GetUserDebtBalanceInUsd(address _user) external view returns (uint256) {
        LnAssetSystem assetSys = LnAssetSystem(addressStorage.getAddress("LnAssetSystem"));

        uint256 totalAssetSupplyInUsd = assetSys.totalAssetsInUsd();

        uint256 debtProportion = userDebtState[_user].debtProportion;
        uint256 debtFactor = userDebtState[_user].debtFactor;

        if (debtProportion == 0) {
            return 0;
        }

        uint256 currentUserDebtProportion = _lastSystemDebtFactor()
                .divideDecimalRoundPrecise(debtFactor)
                .multiplyDecimalRoundPrecise(debtProportion);
        uint256 debtBalance = totalAssetSupplyInUsd
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(currentUserDebtProportion)
                .preciseDecimalToDecimal();

        return debtBalance;
    }
}
