// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// Foundry suite. From /contracts: `forge install foundry-rs/forge-std` then `forge test`.
/// The same behaviours are also covered by tests/contract.test.ts, which runs the compiled bytecode on an in-process EVM.
contract CredentialRegistryTest is Test {
    CredentialRegistry reg;
    address issuer = address(0xA11CE);
    address stranger = address(0xBAD);
    bytes32 id = keccak256("credential-1");
    bytes32 hash_ = keccak256("payload-1");

    event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed payloadHash, address indexed issuer, uint64 issuedAt);

    function setUp() public {
        reg = new CredentialRegistry(issuer);
    }

    function test_issuerCanIssueAndAnyoneCanLookUp() public {
        vm.warp(1_700_000_000);
        vm.expectEmit(true, true, true, true);
        emit CredentialIssued(id, hash_, issuer, 1_700_000_000);
        vm.prank(issuer);
        reg.issue(id, hash_);

        (bytes32 h, address i, uint64 at, bool revoked) = reg.get(id);
        assertEq(h, hash_);
        assertEq(i, issuer);
        assertEq(at, 1_700_000_000);
        assertFalse(revoked);
        vm.prank(stranger);
        assertTrue(reg.verify(id, hash_));
    }

    function test_unauthorizedIssuanceReverts() public {
        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotIssuer.selector);
        reg.issue(id, hash_);
    }

    function test_duplicateIssuanceReverts() public {
        vm.startPrank(issuer);
        reg.issue(id, hash_);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.AlreadyIssued.selector, id));
        reg.issue(id, keccak256("other"));
        vm.stopPrank();
    }

    function test_wrongHashFailsVerification() public {
        vm.prank(issuer);
        reg.issue(id, hash_);
        assertFalse(reg.verify(id, keccak256("tampered")));
        assertFalse(reg.verify(keccak256("unknown"), hash_));
    }

    function test_emptyInputsRevert() public {
        vm.startPrank(issuer);
        vm.expectRevert(CredentialRegistry.EmptyId.selector);
        reg.issue(bytes32(0), hash_);
        vm.expectRevert(CredentialRegistry.EmptyHash.selector);
        reg.issue(id, bytes32(0));
        vm.stopPrank();
    }

    function test_revokeByIssuerOrOwnerOnly() public {
        vm.prank(issuer);
        reg.issue(id, hash_);
        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotAllowedToRevoke.selector);
        reg.revoke(id);
        vm.prank(issuer);
        reg.revoke(id);
        assertFalse(reg.verify(id, hash_));
    }

    function test_ownerManagesIssuers() public {
        reg.setIssuer(stranger, true);
        vm.prank(stranger);
        reg.issue(id, hash_);
        reg.setIssuer(stranger, false);
        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotIssuer.selector);
        reg.issue(keccak256("x"), hash_);
        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotOwner.selector);
        reg.setIssuer(stranger, true);
    }
}
