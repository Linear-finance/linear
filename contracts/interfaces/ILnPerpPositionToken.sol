// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface ILnPerpPositionToken is IERC721Upgradeable {
    function positionExists(address perpAddress, uint256 positionId) external view returns (bool);

    function mint(address perpAddress, address to) external returns (uint256 tokenId);

    function burn(uint256 tokenId) external;

    function move(uint256 tokenId, address to) external;
}
