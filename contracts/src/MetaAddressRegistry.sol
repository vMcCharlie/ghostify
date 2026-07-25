// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Maps a wallet address to its public Ghostify stealth receive keys.
/// @dev Keys are public; only the matching private keys can discover a payment.
contract MetaAddressRegistry {
    struct MetaAddress { bytes spendingPublicKey; bytes viewingPublicKey; }
    mapping(address => MetaAddress) private entries;

    event MetaAddressRegistered(address indexed wallet, bytes spendingPublicKey, bytes viewingPublicKey);
    event MetaAddressCleared(address indexed wallet);

    function register(bytes calldata spendingPublicKey, bytes calldata viewingPublicKey) external {
        require(spendingPublicKey.length == 65 && viewingPublicKey.length == 65, "invalid public key");
        entries[msg.sender] = MetaAddress(spendingPublicKey, viewingPublicKey);
        emit MetaAddressRegistered(msg.sender, spendingPublicKey, viewingPublicKey);
    }

    function resolve(address wallet) external view returns (bytes memory spendingPublicKey, bytes memory viewingPublicKey) {
        MetaAddress storage entry = entries[wallet];
        return (entry.spendingPublicKey, entry.viewingPublicKey);
    }

    function clear() external {
        delete entries[msg.sender];
        emit MetaAddressCleared(msg.sender);
    }
}
