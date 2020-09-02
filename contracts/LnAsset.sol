// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnErc20Handler.sol";
import "./IAsset.sol";

contract LnAsset is LnErc20Handler, LnOperatorModifier, IAsset {
     bytes32  mKeyName;


    function keyName() override external view returns (bytes32)
    {
        return mKeyName;
    }


     constructor( bytes32 _key, address payable _proxy, LnTokenStorage _tokenStorage, string memory _name, string memory _symbol,
        uint _totalSupply, uint8 _decimals, address _admin ) public 
        LnErc20Handler(_proxy, _tokenStorage,_name,_symbol, _totalSupply, _decimals, _admin ) LnOperatorModifier(_admin) {
        
        mKeyName = _key;
        tokenStorage = _tokenStorage;
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        decimals = _decimals;
    }

     function _mint(address account, uint256 amount) private  {
        require(account != address(0), "ERC20: mint to the zero address");
        _beforeTokenTransfer(address(0), account, amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);

        emitTransfer(address(0), account, amount);
    }

    function mint(address account, uint256 amount) external onlyOperator {
        _mint(account, amount);
    }

    function burn(address account, uint amount) external  onlyOperator {
        _burn(account, amount);
    }


   function _burn(address account, uint256 amount) private {
        require(account != address(0), "ERC20: burn from the zero address");
        _beforeTokenTransfer(account, address(0), amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emitTransfer(account, address(0), amount);
    }

}

