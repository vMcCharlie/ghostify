// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMiMC7 { function MiMCpe7(uint256 left, uint256 right) external view returns (uint256); }
interface IShieldedSpendVerifier {
    function verifyProof(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, uint[3] calldata publicSignals) external view returns (bool);
}

/// @notice Testnet-only 1 MON shielded note pool. No direct withdrawals are implemented.
/// @dev A transfer consumes one hidden note and creates another note of the same denomination.
contract ShieldedPool {
    uint256 public constant DENOMINATION = 1 ether;
    uint256 public constant TREE_DEPTH = 3;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IMiMC7 public immutable mimc;
    IShieldedSpendVerifier public immutable verifier;
    bytes32[TREE_DEPTH + 1] public zeros;
    bytes32[TREE_DEPTH] public filledSubtrees;
    bytes32 public currentRoot;
    uint32 public nextIndex;
    mapping(bytes32 => bool) public knownRoots;
    mapping(bytes32 => bool) public nullifierSpent;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, bytes32 newRoot);
    event PrivateTransfer(bytes32 indexed nullifierHash, bytes32 indexed newCommitment, bytes encryptedNote, bytes32 newRoot);

    constructor(address mimc_, address verifier_) {
        mimc = IMiMC7(mimc_);
        verifier = IShieldedSpendVerifier(verifier_);
        zeros[0] = bytes32(0);
        for (uint256 i; i < TREE_DEPTH; ++i) {
            zeros[i + 1] = _hash(zeros[i], zeros[i]);
            filledSubtrees[i] = zeros[i];
        }
        currentRoot = zeros[TREE_DEPTH];
        knownRoots[currentRoot] = true;
    }

    function deposit(bytes32 commitment) external payable returns (uint32 leafIndex) {
        require(msg.value == DENOMINATION, "deposit must be exactly 1 MON");
        require(uint256(commitment) < FIELD_SIZE, "commitment outside field");
        require(nextIndex < 2 ** TREE_DEPTH, "pool is full");
        leafIndex = nextIndex++;
        currentRoot = _insert(commitment, leafIndex);
        knownRoots[currentRoot] = true;
        emit Deposit(commitment, leafIndex, currentRoot);
    }

    function privateTransfer(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        bytes32 root,
        bytes32 nullifierHash,
        bytes32 newCommitment,
        bytes calldata encryptedNote
    ) external {
        require(knownRoots[root], "unknown root");
        require(!nullifierSpent[nullifierHash], "note already spent");
        require(uint256(nullifierHash) < FIELD_SIZE && uint256(newCommitment) < FIELD_SIZE, "public input outside field");
        uint[3] memory publicSignals = [uint256(root), uint256(nullifierHash), uint256(newCommitment)];
        require(verifier.verifyProof(pA, pB, pC, publicSignals), "invalid proof");
        nullifierSpent[nullifierHash] = true;
        require(nextIndex < 2 ** TREE_DEPTH, "pool is full");
        uint32 leafIndex = nextIndex++;
        currentRoot = _insert(newCommitment, leafIndex);
        knownRoots[currentRoot] = true;
        emit PrivateTransfer(nullifierHash, newCommitment, encryptedNote, currentRoot);
    }

    function _insert(bytes32 leaf, uint32 index) private returns (bytes32 current) {
        current = leaf;
        for (uint256 level; level < TREE_DEPTH; ++level) {
            if (index % 2 == 0) {
                filledSubtrees[level] = current;
                current = _hash(current, zeros[level]);
            } else {
                current = _hash(filledSubtrees[level], current);
            }
            index /= 2;
        }
    }

    function _hash(bytes32 left, bytes32 right) private view returns (bytes32) {
        return bytes32(mimc.MiMCpe7(uint256(left), uint256(right)));
    }
}
