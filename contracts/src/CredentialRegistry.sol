// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RecallMap CredentialRegistry
/// @notice Public, privacy-preserving registry of achievement credentials.
/// @dev Only a hash of a canonical, versioned credential payload is stored: never notes, answers or personal data.
///      A credential id is chosen by the issuer and can be issued exactly once.
contract CredentialRegistry {
    struct Credential {
        bytes32 payloadHash;
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    address public owner;
    mapping(address => bool) public issuers;
    mapping(bytes32 => Credential) private _credentials;

    event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed payloadHash, address indexed issuer, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialId, address indexed by);
    event IssuerUpdated(address indexed issuer, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotIssuer();
    error AlreadyIssued(bytes32 credentialId);
    error EmptyHash();
    error EmptyId();
    error NotFound(bytes32 credentialId);
    error NotAllowedToRevoke();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert NotIssuer();
        _;
    }

    constructor(address initialIssuer) {
        if (initialIssuer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        issuers[initialIssuer] = true;
        emit IssuerUpdated(initialIssuer, true);
    }

    /// @notice Anchor a credential. Reverts if the id was already used.
    function issue(bytes32 credentialId, bytes32 payloadHash) external onlyIssuer {
        if (credentialId == bytes32(0)) revert EmptyId();
        if (payloadHash == bytes32(0)) revert EmptyHash();
        if (_credentials[credentialId].issuer != address(0)) revert AlreadyIssued(credentialId);
        uint64 ts = uint64(block.timestamp);
        _credentials[credentialId] = Credential(payloadHash, msg.sender, ts, false);
        emit CredentialIssued(credentialId, payloadHash, msg.sender, ts);
    }

    /// @notice Revoke a credential. Allowed for the issuer that created it, or the contract owner.
    function revoke(bytes32 credentialId) external {
        Credential storage c = _credentials[credentialId];
        if (c.issuer == address(0)) revert NotFound(credentialId);
        if (msg.sender != c.issuer && msg.sender != owner) revert NotAllowedToRevoke();
        c.revoked = true;
        emit CredentialRevoked(credentialId, msg.sender);
    }

    /// @notice Public lookup. `issuer == address(0)` means the credential does not exist.
    function get(bytes32 credentialId) external view returns (bytes32 payloadHash, address issuer, uint64 issuedAt, bool revoked) {
        Credential storage c = _credentials[credentialId];
        return (c.payloadHash, c.issuer, c.issuedAt, c.revoked);
    }

    /// @notice True only if the credential exists, is not revoked, and its stored hash equals `expectedHash`.
    function verify(bytes32 credentialId, bytes32 expectedHash) external view returns (bool) {
        Credential storage c = _credentials[credentialId];
        return c.issuer != address(0) && !c.revoked && c.payloadHash == expectedHash;
    }

    function setIssuer(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        issuers[account] = allowed;
        emit IssuerUpdated(account, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
