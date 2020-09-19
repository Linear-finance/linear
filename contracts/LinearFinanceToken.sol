// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "./LnTokenStorage.sol";
import "./LnErc20Handler.sol";
import "./LnOperatorModifier.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract LinearFinance is LnErc20Handler {
    
    string public constant TOKEN_NAME = "Linear Token";
    string public constant TOKEN_SYMBOL = "LINA";
    uint8 public constant DECIMALS = 18;

    constructor(
        address payable _proxy,
        LnTokenStorage _tokenStorage,
        address _admin,
        uint _totalSupply
    )
        public
        LnErc20Handler(_proxy, _tokenStorage, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _admin)
    {
    }
    
    //
    function _mint(address account, uint256 amount) private  {
        require(account != address(0), "ERC20: mint to the zero address");
        _beforeTokenTransfer(address(0), account, amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);

        emitTransfer(address(0), account, amount);
    }

    function mint(address account, uint256 amount) external onlyAdmin {
        _mint(account, amount);
    }

   function _burn(address account, uint256 amount) private {
        require(account != address(0), "ERC20: burn from the zero address");
        _beforeTokenTransfer(account, address(0), amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emitTransfer(account, address(0), amount);
    }

    function burn(address account, uint256 amount) external onlyAdmin {
       _burn(account, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        require(!paused, "ERC20Pausable: token transfer while paused");
    }

    ////////////////////////////////////////////////////// paused
    bool public paused = false;
    modifier notPaused {
        require(!paused, "This action cannot be performed while the contract is paused");
        _;
    }
    function setPaused(bool _paused) external onlyAdmin {
        if (_paused == paused) {
            return;
        }
        paused = _paused;
        emit PauseChanged(paused);
    }

    //////////////////////////////////////////////////////
    event PauseChanged(bool isPaused);
}
