// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-5564-compatible announcement registry. It never holds user funds.
contract Announcer {
    event Announcement(uint256 indexed schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata);

    function announce(uint256 schemeId, address stealthAddress, bytes calldata ephemeralPubKey, bytes calldata metadata) external {
        require(stealthAddress != address(0), "zero stealth address");
        emit Announcement(schemeId, stealthAddress, ephemeralPubKey, metadata);
    }
}
