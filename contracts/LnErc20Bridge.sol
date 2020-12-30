// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./IERC20.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract LnErc20Bridge is LnAdminUpgradeable, PausableUpgradeable {
    using AddressUpgradeable for address;

    struct freezeTx {
        uint amount;
        uint timestamp;
        bool done;
    }

    struct usedTx {
        bool isUsed;
    }

    mapping(address => mapping(string => freezeTx)) public freezeTxLog;
    mapping(address => string[]) public pendingProcess;
    mapping(string => usedTx) private usedTX;

    IERC20 private erc20;
    address private frozenHolder;

    function __LnErc20Bridge_init(address _tokenAddr, address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
        erc20 = IERC20(_tokenAddr);
        frozenHolder = address(this);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    //cross chain frozen data sync
    //call from other chain
    function setFreezeTx(
        address _account,
        string memory _txId,
        uint _amount,
        uint _timestamp
    ) public onlyAdmin returns (bool) {
        require(_amount >= 0, "freeze amount can't zero");
        require(_account != address(0), "need user account");
        require(bytes(_txId).length != 0, "need txId");
        require(usedTX[_txId].isUsed == false, "txId already exist");

        freezeTx memory _freezeTx;
        _freezeTx.amount = _amount;
        _freezeTx.timestamp = _timestamp;
        _freezeTx.done = false;
        usedTX[_txId].isUsed = true;
        freezeTxLog[_account][_txId] = _freezeTx;
        pendingProcess[_account].push(_txId);

        emit SetFreezeTxLog(_account, _txId, _amount, _timestamp);
        return true;
    }

    // need approve
    // A chain swap to B chain.A chain call freeze,B chain call unfreeze.
    function freeze(uint256 _amount) external whenNotPaused returns (bool) {
        require(_amount > 0, "freeze amount can not zero");

        address user = msg.sender;

        require(erc20.balanceOf(user) >= _amount, "insufficient balance");
        require(erc20.allowance(user, address(this)) >= _amount, "insufficient allowance, need approve more amount");

        erc20.transferFrom(user, frozenHolder, _amount);

        emit FreezeLog(user, erc20.symbol(), _amount);
        return true;
    }

    // A chain swap to B chain.A chain call freeze,B chain call unfreeze.
    function unfreeze(string memory _txId) external whenNotPaused returns (bool) {
        address user = msg.sender;
        uint amount = freezeTxLog[user][_txId].amount;

        require(freezeTxLog[user][_txId].done == false, "this transaction already done");
        require(amount > 0, "unfreeze amount can not zero");

        erc20.transfer(user, amount);
        freezeTxLog[user][_txId].done = true;

        for (uint256 i = 0; i < pendingProcess[user].length; i++) {
            if (keccak256(bytes(pendingProcess[user][i])) == keccak256(bytes(_txId))) {
                delete pendingProcess[user][i];
            }
        }

        emit UnfreezeLog(user, erc20.symbol(), amount);
        return true;
    }

    function getTotalFrozenToken() public view returns (uint) {
        return erc20.balanceOf(address(this));
    }

    function getPendingProcess(address _account) public view returns (string[] memory) {
        return pendingProcess[_account];
    }

    event FreezeLog(address user, string _currency, uint256 _amount);
    event UnfreezeLog(address user, string _currency, uint256 _amount);
    event SetFreezeTxLog(address _account, string _txId, uint _amount, uint _timestamp);

    // Reserved storage space to allow for layout changes in the future.
    uint256[48] private __gap;
}
