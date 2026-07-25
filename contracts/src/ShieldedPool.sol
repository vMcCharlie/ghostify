// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMiMC7 { function MiMCpe7(uint256 left, uint256 right) external view returns (uint256); }
interface IDepositVerifier { function verifyProof(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, uint[2] calldata publicSignals) external view returns (bool); }
interface ISpendVerifier { function verifyProof(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, uint[3] calldata publicSignals) external view returns (bool); }
interface IWithdrawVerifier { function verifyProof(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, uint[4] calldata publicSignals) external view returns (bool); }

/// @notice Testnet-only whole-note shielded pool. This contract is unaudited.
/// @dev Deposit proofs bind a public MON value to a hidden note commitment.
/// Private transfers preserve that value; withdrawals reveal only the value and destination.
contract ShieldedPool {
    uint256 public constant TREE_DEPTH = 3;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IMiMC7 public immutable mimc;
    IDepositVerifier public immutable depositVerifier;
    ISpendVerifier public immutable spendVerifier;
    IWithdrawVerifier public immutable withdrawVerifier;
    bytes32[TREE_DEPTH + 1] public zeros;
    bytes32[TREE_DEPTH] public filledSubtrees;
    bytes32 public currentRoot;
    uint32 public nextIndex;
    mapping(bytes32 => bool) public knownRoots;
    mapping(bytes32 => bool) public nullifierSpent;

    event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, bytes32 newRoot);
    event PrivateTransfer(bytes32 indexed nullifierHash, bytes32 indexed newCommitment, bytes encryptedNote, bytes32 newRoot);
    event PrivateWithdrawal(bytes32 indexed nullifierHash, address indexed recipient, uint256 amount, bytes32 recipientHash);

    constructor(address mimc_, address depositVerifier_, address spendVerifier_, address withdrawVerifier_) {
        require(mimc_ != address(0) && depositVerifier_ != address(0) && spendVerifier_ != address(0) && withdrawVerifier_ != address(0), "zero dependency");
        mimc = IMiMC7(mimc_); depositVerifier = IDepositVerifier(depositVerifier_); spendVerifier = ISpendVerifier(spendVerifier_); withdrawVerifier = IWithdrawVerifier(withdrawVerifier_);
        zeros[0] = bytes32(0);
        for (uint256 i; i < TREE_DEPTH; ++i) { zeros[i + 1] = _hash(zeros[i], zeros[i]); filledSubtrees[i] = zeros[i]; }
        currentRoot = zeros[TREE_DEPTH]; knownRoots[currentRoot] = true;
    }

    function deposit(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, bytes32 commitment) external payable returns (uint32 leafIndex) {
        require(msg.value > 0 && msg.value < FIELD_SIZE, "invalid deposit amount");
        require(uint256(commitment) < FIELD_SIZE, "commitment outside field");
        uint[2] memory publicSignals = [uint256(commitment), msg.value];
        require(depositVerifier.verifyProof(pA, pB, pC, publicSignals), "invalid deposit proof");
        require(nextIndex < 2 ** TREE_DEPTH, "pool is full");
        leafIndex = nextIndex++; currentRoot = _insert(commitment, leafIndex); knownRoots[currentRoot] = true;
        emit Deposit(commitment, msg.value, leafIndex, currentRoot);
    }

    function privateTransfer(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, bytes32 root, bytes32 nullifierHash, bytes32 newCommitment, bytes calldata encryptedNote) external {
        require(knownRoots[root], "unknown root"); require(!nullifierSpent[nullifierHash], "note already spent");
        require(uint256(nullifierHash) < FIELD_SIZE && uint256(newCommitment) < FIELD_SIZE, "public input outside field");
        uint[3] memory publicSignals = [uint256(root), uint256(nullifierHash), uint256(newCommitment)];
        require(spendVerifier.verifyProof(pA, pB, pC, publicSignals), "invalid transfer proof");
        nullifierSpent[nullifierHash] = true;
        require(nextIndex < 2 ** TREE_DEPTH, "pool is full");
        uint32 leafIndex = nextIndex++; currentRoot = _insert(newCommitment, leafIndex); knownRoots[currentRoot] = true;
        emit PrivateTransfer(nullifierHash, newCommitment, encryptedNote, currentRoot);
    }

    function privateWithdraw(uint[2] calldata pA, uint[2][2] calldata pB, uint[2] calldata pC, bytes32 root, bytes32 nullifierHash, address payable recipient, uint256 amount) external {
        require(recipient != address(0) && amount > 0 && amount < FIELD_SIZE, "invalid withdrawal");
        require(knownRoots[root], "unknown root"); require(!nullifierSpent[nullifierHash], "note already spent");
        require(uint256(nullifierHash) < FIELD_SIZE, "public input outside field");
        bytes32 recipientHash = _hash(bytes32(uint256(uint160(address(recipient)))), bytes32(0));
        uint[4] memory publicSignals = [uint256(root), uint256(nullifierHash), uint256(recipientHash), amount];
        require(withdrawVerifier.verifyProof(pA, pB, pC, publicSignals), "invalid withdrawal proof");
        nullifierSpent[nullifierHash] = true;
        (bool sent,) = recipient.call{value: amount}(""); require(sent, "withdrawal failed");
        emit PrivateWithdrawal(nullifierHash, recipient, amount, recipientHash);
    }

    function _insert(bytes32 leaf, uint32 index) private returns (bytes32 current) {
        current = leaf;
        for (uint256 level; level < TREE_DEPTH; ++level) { if (index % 2 == 0) { filledSubtrees[level] = current; current = _hash(current, zeros[level]); } else current = _hash(filledSubtrees[level], current); index /= 2; }
    }
    function _hash(bytes32 left, bytes32 right) private view returns (bytes32) { return bytes32(mimc.MiMCpe7(uint256(left), uint256(right))); }
}