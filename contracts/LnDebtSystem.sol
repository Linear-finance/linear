// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./LnAccessControl.sol";

// TODO Pausable maybe useless
contract LnDebtSystem is LnAdmin, Pausable {
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
    mapping(address => DebtData) public debtDataState;

    //use mapping to store array data
    mapping (uint256=>uint256) public lastDebtFactors; // TODO: 能直接记 factor 的记 factor, 不能记的就用index查
    uint256 public debtCurrentIndex; // length
    uint256 public maxDebtArraySize = 1000; // TODO: should base time? 一个周期内的记录 or 添加一个接口，close 一个周期时，把这个周期前不需要的delete

    // -------------------------------------------------------
    constructor(address _addrStorage) public LnAdmin(msg.sender) {
        addressStorage = LnAddressStorage(_addrStorage);
    }

    // ------------------ system config ----------------------
    function SetAddressStorage(address _address) public onlyAdmin {
        emit UpdateAddressStorage(address(addressStorage), _address);
        addressStorage = LnAddressStorage(_address);
    }
    
    function SetPause(bool pause) external onlyAdmin {
        if (pause) {
            _pause();
        } else {
            _unpause();
        }
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
        require(accessCtrl.HasDebtSystemRole(_address), "Need debt system access role");
        _;
    }

    // ------------------ public ----------------------
    function PushDebtFactor(uint256 _factor) external OnlyDebtSystemRole(msg.sender) {
        if (debtCurrentIndex == 0) {
            lastDebtFactors[debtCurrentIndex] = SafeDecimalMath.preciseUnit();
        } else {
            lastDebtFactors[debtCurrentIndex] = lastDebtFactors[debtCurrentIndex-1].multiplyDecimalRoundPrecise(_factor);
        }

        debtCurrentIndex++;

        // delete no need
        if (debtCurrentIndex > maxDebtArraySize) {
            delete lastDebtFactors[ debtCurrentIndex - maxDebtArraySize ];
        }
    }

    // need update lastDebtFactors first
    function UpdateUserDebt(address _address, uint256 _debtProportion) external OnlyDebtSystemRole(msg.sender) {
        debtDataState[_address].debtProportion = _debtProportion;
        debtDataState[_address].debtFactor = lastDebtFactors[debtCurrentIndex];
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
}