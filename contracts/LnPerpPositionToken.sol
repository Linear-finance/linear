// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "./interfaces/ILnPerpPositionToken.sol";

contract LnPerpPositionToken is ILnPerpPositionToken, ERC721Upgradeable, OwnableUpgradeable {
    event PositionTokenMinted(uint256 indexed tokenId, address indexed perpAddress, address indexed to);

    uint256 public lastPositionId;
    mapping(uint256 => address) public positionPerpAddresses; // Provides access to underlying position data on-chain

    address public minter;
    address public burner;
    address public mover;

    modifier onlyMinter() {
        require(msg.sender == minter, "LnPerpPositionToken: not minter");
        _;
    }

    modifier onlyBurner() {
        require(msg.sender == burner, "LnPerpPositionToken: not burner");
        _;
    }

    modifier onlyMover() {
        require(msg.sender == mover, "LnPerpPositionToken: not mover");
        _;
    }

    function positionExists(address perpAddress, uint256 positionId) external view override returns (bool) {
        return positionPerpAddresses[positionId] == perpAddress;
    }

    function __LnPerpPositionToken_init() public initializer {
        __Ownable_init();
        __ERC721_init("Linear Perpetual Positions NFT", "LINEAR-PERP-POS");
    }

    function setMinter(address newMinter) external onlyOwner {
        minter = newMinter;
    }

    function setBurner(address newBurner) external onlyOwner {
        burner = newBurner;
    }

    function setMover(address newMover) external onlyOwner {
        mover = newMover;
    }

    function mint(address perpAddress, address to) external override onlyMinter returns (uint256 tokenId) {
        tokenId = ++lastPositionId;

        positionPerpAddresses[tokenId] = perpAddress;
        _mint(to, tokenId);

        emit PositionTokenMinted(tokenId, perpAddress, to);
    }

    function burn(uint256 tokenId) external override onlyBurner {
        _burn(tokenId);
        delete positionPerpAddresses[tokenId];
    }

    function move(uint256 tokenId, address to) external override onlyMover {
        address existingOnwer = ownerOf(tokenId);
        require(existingOnwer != address(0), "LnPerpPositionToken: token not found");

        _transfer(existingOnwer, to, tokenId);
    }
}
