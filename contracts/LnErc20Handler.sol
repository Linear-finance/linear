pragma solidity ^0.5.17;

import "./LnAdmin.sol";
import "./SelfDestructible.sol";
import "./LnProxyImpl.sol";

import "./SafeDecimalMath.sol";

import "./LnTokenStorage.sol";

contract LnErc20Handler is LnAdmin, LnProxyImpl {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    LnTokenStorage public tokenData;

    string public name;
    string public symbol;
    uint public totalSupply;
    uint8 public decimals;

    constructor(
        address payable _proxy,
        LnTokenStorage _tokenData,
        string memory _name,
        string memory _symbol,
        uint _totalSupply,
        uint8 _decimals,
        address _owner
    ) public LnAdmin(_owner) SelfDestructible() LnProxyImpl(_proxy) {
        tokenData = _tokenData;

        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply;
        decimals = _decimals;
    }

    function allowance(address owner, address spender) public view returns (uint) {
        return tokenData.allowance(owner, spender);
    }

    function balanceOf(address account) external view returns (uint) {
        return tokenData.balanceOf(account);
    }

    function setTokenData(LnTokenStorage _tokenData) external optionalProxy_onlyOwner {
        tokenData = _tokenData;
        emitTokenDataUpdated(address(tokenData));
    }

    function _internalTransfer(
        address from,
        address to,
        uint value
    ) internal returns (bool) {
        
        require(to != address(0) && to != address(this) && to != address(proxy), "Cannot transfer to this address");

        tokenData.setBalanceOf(from, tokenData.balanceOf(from).sub(value));
        tokenData.setBalanceOf(to, tokenData.balanceOf(to).add(value));

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
        
        tokenData.setAllowance(from, sender, tokenData.allowance(from, sender).sub(value));
        return _internalTransfer(from, to, value);
    }


    // default transfer
    function transfer(address to, uint value) external optionalProxy returns (bool) {
        _transferByProxy(messageSender, to, value);

        return true;
    }
    
    // default transferFrom
    function transferFrom(
        address from,
        address to,
        uint value
    ) external optionalProxy  returns (bool) {
        return _transferFromByProxy(messageSender, from, to, value);
    }


    function approve(address spender, uint value) public optionalProxy returns (bool) {
        address sender = messageSender;

        tokenData.setAllowance(sender, spender, value);
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
        proxy._emit(abi.encode(value), 3, TRANSFER_SIG, addressToBytes32(from), addressToBytes32(to), 0);
    }

    event Approval(address indexed owner, address indexed spender, uint value);
    bytes32 internal constant APPROVAL_SIG = keccak256("Approval(address,address,uint256)");

    function emitApproval(
        address owner,
        address spender,
        uint value
    ) internal {
        proxy._emit(abi.encode(value), 3, APPROVAL_SIG, addressToBytes32(owner), addressToBytes32(spender), 0);
    }

    event TokenDataUpdated(address newTokenData);
    bytes32 internal constant TOKENDATA_UPDATED_SIG = keccak256("TokenDataUpdated(address)");

    function emitTokenDataUpdated(address newTokenData) internal {
        proxy._emit(abi.encode(newTokenData), 1, TOKENDATA_UPDATED_SIG, 0, 0, 0);
    }
}

