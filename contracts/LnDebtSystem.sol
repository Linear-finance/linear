// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/IDebtDistribution.sol";
import "./interfaces/ILnAccessControl.sol";
import "./interfaces/ILnAssetSystem.sol";

// Note to code reader by Tommy as of 2023-07-10:
//
// This contract has been mostly rewritten after it's been deployed in production to properly
// support multi-collateral, with backward compatibility as a hard requirement.
//
// The original codebase has a questionable design of storing the latest "debt factor" values in an
// array whereas the only thing that's actually needed would be the latest value. It's meant to
// have a mechanism for deleting old values but it never actually kicks in as the trigger condition
// is never satisfied. This has caused a significant waste of gas for end users.
//
// To eventually move away from the questionable design, the multi-collateral upgrade changes to
// _also_ persist the latest value to a single slot, but never to actually use it. Once we make
// sure the on-chain value of this new slot syncs with the array value, we can make another upgrade
// to stop writing to the array for good.
//
// As such, the will be seemingly weird implementations across the contract that might make you
// wonder why it's even coded that way. Most likely it's for backward compatibility with the
// previous implementation. For more details check Git history.
contract LnDebtSystem is LnAdminUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    event UpdateUserDebtLog(address addr, uint256 debtProportion, uint256 debtFactor, uint256 timestamp);
    event PushDebtLog(uint256 index, uint256 newFactor, uint256 timestamp);

    struct UserDebtData {
        uint256 debtProportion;
        uint256 debtFactor;
    }

    ILnAccessControl public accessCtrl;
    ILnAssetSystem public assetSys;

    mapping(address => UserDebtData) public userDebtState;

    // These two fields are the result of the original questionable design. See the rewrite note at
    // the top for more details.
    mapping(uint256 => uint256) public lastDebtFactors;
    uint256 public debtCurrentIndex;

    // There were originally two storage vars here: `lastCloseAt` and `lastDeletTo`, which were
    // supposed to power the old storage data pruning mechanism. However, it turned out to be
    // unused. We can safely remove them and repurpose the slots as they are and will stay zero.

    // The global debt factor for this collateral managed by this contract instance.
    //
    // To understand this field, imagine the owner of the first ever debt entry under this
    // collateral to have never performed any action after the initial mint.
    //
    // With this setup, this number represents the proportion of the that first ever debt with
    // regard to the current debt pool. Natually, this number shrinks over time as other users
    // would build up debt as well.
    //
    // Why is this useful? Well, at any point in time, when any user makes any changes to his/her
    // debt, the current "global debt factor" can be recorded. At a later time, we can compare this
    // previously marked down value with the actual lastest value to figure out how much the debt
    // proportion of this specific user have changed. We can then derive the latest proportion of
    // the user's debt with regard to the entire debt pool.
    //
    // This mechanism enables efficient tracking of everyone's debt in O(1).
    uint256 public collateralDebtFactor;

    IDebtDistribution public debtDistribution;

    modifier OnlyDebtSystemRole(address _address) {
        require(accessCtrl.hasRole(accessCtrl.DEBT_SYSTEM(), _address), "Need debt system access role");
        _;
    }

    /**
     * @return [0] the debt balance of user. [1] the debt balance for this collateral.
     */
    function GetUserDebtBalanceInUsd(address _user) external view returns (uint256, uint256) {
        return _getUserDebtBalanceInUsd(_user);
    }

    function __LnDebtSystem_init(
        address _admin,
        ILnAccessControl _accessCtrl,
        ILnAssetSystem _assetSys
    ) external initializer {
        __LnAdminUpgradeable_init(_admin);

        require(address(_accessCtrl) != address(0), "LnDebtSystem: zero address");
        require(address(_assetSys) != address(0), "LnDebtSystem: zero address");

        accessCtrl = _accessCtrl;
        assetSys = _assetSys;
    }

    function setDebtDistribution(IDebtDistribution _debtDistribution) external onlyAdmin {
        require(address(_debtDistribution) != address(0), "LnDebtSystem: zero address");
        debtDistribution = _debtDistribution;
    }

    function increaseDebt(address _user, uint256 _amount) external OnlyDebtSystemRole(msg.sender) {
        _increaseDebt(_user, _amount);
    }

    function decreaseDebt(address _user, uint256 _amount) external OnlyDebtSystemRole(msg.sender) {
        _decreaseDebt(_user, _amount);
    }

    function _lastSystemDebtFactor() private view returns (uint256) {
        if (debtCurrentIndex == 0) {
            return SafeDecimalMath.preciseUnit();
        } else {
            uint256 latestFactor = lastDebtFactors[debtCurrentIndex - 1];
            return latestFactor == 0 ? SafeDecimalMath.preciseUnit() : latestFactor;
        }
    }

    /**
     * @return [0] the debt balance of user. [1] the debt balance for this collateral.
     */
    function _getUserDebtBalanceInUsd(address _user) private view returns (uint256, uint256) {
        require(address(debtDistribution) != address(0), "LnDebtSystem: DebtDistribution not set");

        uint256 totalAssetSupplyInUsd = debtDistribution.getCollateralDebtBalanceByDebtSystemAddress(address(this));

        uint256 debtProportion = userDebtState[_user].debtProportion;
        uint256 debtFactor = userDebtState[_user].debtFactor;

        if (debtProportion == 0) {
            return (0, totalAssetSupplyInUsd);
        }

        uint256 currentUserDebtProportion =
            _lastSystemDebtFactor().divideDecimalRoundPrecise(debtFactor).multiplyDecimalRoundPrecise(debtProportion);
        uint256 userDebtBalance =
            totalAssetSupplyInUsd
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(currentUserDebtProportion)
                .preciseDecimalToDecimal();

        return (userDebtBalance, totalAssetSupplyInUsd);
    }

    function _increaseDebt(address _user, uint256 _amount) private {
        require(address(debtDistribution) != address(0), "LnDebtSystem: DebtDistribution not set");

        (uint256 oldUserDebtBalance, uint256 oldSystemDebtBalance) = _getUserDebtBalanceInUsd(_user);

        uint256 newUserDebtBalance = oldUserDebtBalance.add(_amount);
        uint256 newSystemDebtBalance = oldSystemDebtBalance.add(_amount);
        uint256 amountProportion = _amount.divideDecimalRoundPrecise(newSystemDebtBalance);

        uint256 newUserDebtProportion = newUserDebtBalance.divideDecimalRoundPrecise(newSystemDebtBalance);
        uint256 oldDebtProportion = SafeDecimalMath.preciseUnit().sub(amountProportion);

        _updateDebt(_user, newUserDebtProportion, oldDebtProportion);

        debtDistribution.increaseDebt(_amount);
    }

    function _decreaseDebt(address _user, uint256 _amount) private {
        require(address(debtDistribution) != address(0), "LnDebtSystem: DebtDistribution not set");

        (uint256 oldUserDebtBalance, uint256 oldSystemDebtBalance) = _getUserDebtBalanceInUsd(_user);

        uint256 newUserDebtBalance = oldUserDebtBalance.sub(_amount);
        uint256 newSystemDebtBalance = oldSystemDebtBalance.sub(_amount);

        uint256 newUserDebtProportion = newUserDebtBalance.divideDecimalRoundPrecise(newSystemDebtBalance);

        uint256 oldDebtProportion;
        if (newSystemDebtBalance > 0) {
            uint256 amountProportion = _amount.divideDecimalRoundPrecise(newSystemDebtBalance);
            oldDebtProportion = SafeDecimalMath.preciseUnit().add(amountProportion);
        } else {
            oldDebtProportion = 0;
        }

        _updateDebt(_user, newUserDebtProportion, oldDebtProportion);

        debtDistribution.decreaseDebt(_amount);
    }

    function _updateDebt(
        address _user,
        uint256 _debtProportion,
        uint256 _factor
    ) private {
        // This is the old questionable logic. We're keeping it here until the next upgrade
        {
            if (debtCurrentIndex == 0 || lastDebtFactors[debtCurrentIndex - 1] == 0) {
                // init or all debt has be cleared, new set value will be one unit
                lastDebtFactors[debtCurrentIndex] = SafeDecimalMath.preciseUnit();
            } else {
                lastDebtFactors[debtCurrentIndex] = lastDebtFactors[debtCurrentIndex - 1].multiplyDecimalRoundPrecise(
                    _factor
                );
            }
            emit PushDebtLog(debtCurrentIndex, lastDebtFactors[debtCurrentIndex], block.timestamp);

            debtCurrentIndex = debtCurrentIndex.add(1);
        }

        // This new storage slot is what enables use to get rid of the legacy logic above in the
        // next upgrade.
        collateralDebtFactor = lastDebtFactors[debtCurrentIndex - 1];

        userDebtState[_user].debtProportion = _debtProportion;
        userDebtState[_user].debtFactor = _lastSystemDebtFactor();
        emit UpdateUserDebtLog(_user, _debtProportion, userDebtState[_user].debtFactor, block.timestamp);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[42] private __gap;
}
