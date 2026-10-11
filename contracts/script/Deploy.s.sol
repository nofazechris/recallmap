// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --private-key $DEPLOYER_KEY --broadcast
/// ISSUER_ADDRESS is the address of the key the app will use as ARC_ISSUER_PRIVATE_KEY.
contract Deploy is Script {
    function run() external {
        address issuer = vm.envAddress("ISSUER_ADDRESS");
        vm.startBroadcast();
        CredentialRegistry reg = new CredentialRegistry(issuer);
        vm.stopBroadcast();
        console2.log("CredentialRegistry deployed at", address(reg));
    }
}
