// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public directory from a wallet address to its Ghostify encryption key.
/// @dev It holds no funds, note secrets, or spending authority.
contract ReceiveKeyRegistry {
    mapping(address => bytes) private receiveKeys;
    event ReceiveKeyRegistered(address indexed wallet, bytes receiveKey);

    function register(bytes calldata receiveKey) external {
        require(receiveKey.length == 65 && receiveKey[0] == 0x04, "invalid public key");
        receiveKeys[msg.sender] = receiveKey;
        emit ReceiveKeyRegistered(msg.sender, receiveKey);
    }

    function keyOf(address wallet) external view returns (bytes memory) { return receiveKeys[wallet]; }
}