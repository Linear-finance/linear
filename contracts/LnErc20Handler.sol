// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

import "./LnAdmin.sol";
import "./LnProxyImpl.sol";
import "./LnTokenStorage.sol";

contract LnErc20Handler is IERC20, LnAdmin, LnProxyImpl {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    LnTokenStorage public tokenStorage;

    string public override name;
    string public override symbol;
    uint public override totalSupply;
    uint8 public override decimals;

    constructor( address payable _proxy, LnTokenStorage _tokenStorage, string memory _name, 
        string memory _symbol, uint _totalSupply, uint8 _decimals, address _admin ) 
        public LnAdmin(_admin) LnProxyImpl(_proxy) {
        
        tokenStorage = _tokenStorage;
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        decimals = _decimals;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint) {
        return tokenStorage.allowance(owner, spender);
    }

    function balanceOf(address account) external view override returns (uint) {
        return tokenStorage.balanceOf(account);
    }

    function setTokenStorage(LnTokenStorage _tokenStorage) external optionalProxy_onlyAdmin {
        tokenStorage = _tokenStorage;
        emitTokenStorageUpdated(address(tokenStorage));
    }

    function _internalTransfer( address from, address to, uint value ) internal returns (bool) {
        
        require(to != address(0) && to != address(this) && to != address(proxy), "Cannot transfer to this address");
        _beforeTokenTransfer(from, to, value);

        tokenStorage.setBalanceOf(from, tokenStorage.balanceOf(from).sub(value));
        tokenStorage.setBalanceOf(to, tokenStorage.balanceOf(to).add(value));

        emitTransfer(from, to, value);

        return true;
    }

    function _transferByProxy(
        address from,
        address to,
        uint value
    ) internal returns (bool) {
        return _internalTransfer(from, to, value);
    }

    function _transferFromByProxy(
        address sender,
        address from,
        address to,
        uint value
    ) internal returns (bool) {
        
        tokenStorage.setAllowance(from, sender, tokenStorage.allowance(from, sender).sub(value));
        return _internalTransfer(from, to, value);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual { }

    // default transfer
    function transfer(address to, uint value) external virtual override optionalProxy returns (bool) {
        _transferByProxy(messageSender, to, value);

        return true;
    }
    
    // default transferFrom
    function transferFrom(
        address from,
        address to,
        uint value
    ) external virtual override optionalProxy returns (bool) {
        return _transferFromByProxy(messageSender, from, to, value);
    }


    function approve(address spender, uint value) public virtual override optionalProxy returns (bool) {
        address sender = messageSender;

        tokenStorage.setAllowance(sender, spender, value);
        emitApproval(sender, spender, value);
        return true;
    }

    function addressToBytes32(address input) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(input)));
    }

    event Transfer(address indexed from, address indexed to, uint value);
    bytes32 internal constant TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");

    function emitTransfer(
        address from,
        address to,
        uint value
    ) internal {
        proxy.Log3( abi.encode(value),  TRANSFER_SIG, addressToBytes32(from), addressToBytes32(to) );
    }

    event Approval(address indexed owner, address indexed spender, uint value);
    bytes32 internal constant APPROVAL_SIG = keccak256("Approval(address,address,uint256)");

    function emitApproval(
        address owner,
        address spender,
        uint value
    ) internal {
        proxy.Log3( abi.encode(value),  APPROVAL_SIG, addressToBytes32(owner), addressToBytes32(spender) );
    }

    event TokenStorageUpdated(address newTokenStorage);
    bytes32 internal constant TOKENSTORAGE_UPDATED_SIG = keccak256("TokenStorageUpdated(address)");

    function emitTokenStorageUpdated(address newTokenStorage) internal {
        proxy.Log1( abi.encode(newTokenStorage), TOKENSTORAGE_UPDATED_SIG );
    }
}

