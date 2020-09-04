// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnDefaultPrices.sol";
import "./LnAddressCache.sol";
import "./LnAsset.sol";
import "./LnAssetSystem.sol";
import "./LnDebtSystem.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdmin, Pausable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAddressStorage private addressStorage;
    LnAsset private lUSDToken; // this contract need 
    uint256 public BuildRatio = 2e17; // build proportion base on SafeDecimalMath.unit(), default 0.2, and collater_ratio = 1/BuildRatio

    // -------------------------------------------------------
    constructor(address _addrStorage, address _lUSDTokenAddr) public LnAdmin(msg.sender) {
        addressStorage = LnAddressStorage(_addrStorage);
        lUSDToken = LnAsset(_lUSDTokenAddr);
    }

    // ------------------ system config ----------------------
    function SetAddressStorage(address _address) public onlyAdmin {
        emit UpdateAddressStorage(address(addressStorage), _address);
        addressStorage = LnAddressStorage(_address);
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = LnAsset(_address);
    }

    function SetBuildRadio(uint256 _ratio) external onlyAdmin returns (bool) {
        require(_ratio <= SafeDecimalMath.unit(), "ratio need small than 1 unit");
        BuildRatio = _ratio;
        emit UpdateBuildRadio(_ratio);
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateLusdToken(address oldAddr, address newAddr);
    event UpdateBuildRadio(uint256 newRatio);

/*

    function () {
                //
        uint256 tokenValueUSD = _collateral * priceGetter.getPrice(_currency); // TODO: becarefor calc unit
        borrowAmount = tokenValueUSD * tokenInfos[_currency].mortgageRatio / MORTGAGE_BASE;

        uint256 newTotalAssetSupply = totalAssetSupplyInUsd.add(borrowAmount);

        // loan : exchange collateral to loan
        IERC20(tokenInfos[_currency].tokenAddr).transferFrom(user, address(this), _collateral);
        lUSDToken.mint(user, borrowAmount);

        // update debt data
        uint256 borrowDebtProportion = borrowAmount.divideDecimalRoundPrecise(newTotalAssetSupply);// debtPercentage
        uint oldTotalProportion = SafeDecimalMath.preciseUnit().sub(borrowDebtProportion);// delta

        uint256 newDebtProportion = borrowDebtProportion;
        if (oldUserDebtBalance > 0) {
            newDebtProportion = oldUserDebtBalance.add(borrowAmount).divideDecimalRoundPrecise(newTotalAssetSupply);
        }

        debtSystem.PushDebtFactor(oldTotalProportion);
        debtSystem.UpdateUserDebt(user, newDebtProportion);

        return _addLoanRecord(user, _currency, collateral, borrowAmount);
    }

    // record loan data
    function _addLoanRecord(address user, bytes32 _currency, uint256 collateral, uint256 borrowAmount) private 
        returns (uint256 rloanId,
                 uint256 rcollateral,
                 uint256 rborrowAmount,
                 uint256 rloanTime) {
        CollateralData memory collateralData = CollateralData({
            collateral: collateral,
            borrowAmount: borrowAmount
        });

        userCollateralData[user][_currency].collateral += collateral;
        userCollateralData[user][_currency].borrowAmount += borrowAmount;

        uniqueId++;
        emit AddLoan(_currency, user, uniqueId, collateral, borrowAmount, block.timestamp);
        return (uniqueId, collateralData.collateral, collateralData.borrowAmount, block.timestamp);
    }
*/

}
