// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BLS12381Verifier} from "../src/randomness/BLS12381Verifier.sol";
import {BeaconOperatorRegistry} from "../src/randomness/BeaconOperatorRegistry.sol";
import {OperatorBondVault} from "../src/randomness/OperatorBondVault.sol";
import {ThresholdRandomBeacon} from "../src/randomness/ThresholdRandomBeacon.sol";

/// @notice Deploys the full bonded threshold beacon stack and configures epoch 1.
/// @dev Run AFTER dkg.mjs has produced .dkg/epoch-1.json.
///
/// Required env vars:
///   DEPLOYER_PK          — deployer private key (needs gas + USDG for bonds)
///   ADMIN                — multisig / safe that will own all contracts after deployment
///   SLASH_RECEIVER       — address receiving slashed bond collateral
///   BOND_TOKEN           — ERC-20 used as bond collateral (use USDG: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168)
///   MASTER_PUBLIC_KEY    — G1 uncompressed master key from dkg.mjs (hex, no 0x)
///   OPERATOR_0..6        — 7 operator addresses (can all be the same address for solo operation)
///   PK_SHARE_0..6        — 7 G1 uncompressed public key shares from dkg.mjs (hex, no 0x)
///   BOND_AMOUNT          — USDG to deposit per operator (in USDG base units, e.g. 1300000000 = 1300 USDG)
///   REQUEST_WINDOW       — seconds collectors have to add requests (e.g. 120)
///   SIGNATURE_WINDOW     — seconds operators have to sign after seal (e.g. 300)
///   RESCUE_WINDOW        — seconds for rescue shares after normal deadline (e.g. 600)
contract DeployBeacon is Script {
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    uint8  internal constant OPERATOR_COUNT = 7;

    function run()
        external
        returns (
            BLS12381Verifier verifier,
            BeaconOperatorRegistry registry,
            OperatorBondVault vault,
            ThresholdRandomBeacon beacon
        )
    {
        require(block.chainid == 4663, "Robinhood Chain only");

        uint256 deployerKey   = vm.envUint("DEPLOYER_PK");
        address admin         = vm.envAddress("ADMIN");
        address slashReceiver = vm.envAddress("SLASH_RECEIVER");
        address bondToken     = vm.envOr("BOND_TOKEN", USDG);
        uint256 bondAmount    = vm.envUint("BOND_AMOUNT");
        uint64  requestWindow = uint64(vm.envUint("REQUEST_WINDOW"));
        uint64  signatureWindow = uint64(vm.envUint("SIGNATURE_WINDOW"));
        uint64  rescueWindow  = uint64(vm.envUint("RESCUE_WINDOW"));

        require(address(bondToken).code.length != 0, "bond token has no code");
        require(bondAmount != 0, "bond amount is zero");

        bytes memory masterKey = vm.envBytes("MASTER_PUBLIC_KEY");
        require(masterKey.length == 96, "master key must be 96 bytes (G1 uncompressed)");

        address[] memory operators = new address[](OPERATOR_COUNT);
        bytes[]   memory pkShares  = new bytes[](OPERATOR_COUNT);
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            operators[i] = vm.envAddress(string.concat("OPERATOR_", vm.toString(i)));
            pkShares[i]  = vm.envBytes(string.concat("PK_SHARE_", vm.toString(i)));
            require(pkShares[i].length == 96, "each pk share must be 96 bytes (G1 uncompressed)");
        }

        vm.startBroadcast(deployerKey);

        // 1. Verifier
        verifier = new BLS12381Verifier();
        console.log("BLS12381Verifier :", address(verifier));

        // 2. Registry — verifier is immutable, bound at construction
        registry = new BeaconOperatorRegistry(verifier, admin);
        console.log("BeaconOperatorRegistry:", address(registry));

        // 3. Bond vault — delayed withdrawal to prevent race against slash
        vault = new OperatorBondVault(IERC20(bondToken), 7 days, admin);
        console.log("OperatorBondVault:", address(vault));

        // 4. Beacon
        beacon = new ThresholdRandomBeacon(
            registry,
            vault,
            verifier,
            slashReceiver,
            requestWindow,
            signatureWindow,
            rescueWindow,
            admin
        );
        console.log("ThresholdRandomBeacon:", address(beacon));

        // 5. Vault → grant BEACON_ROLE to beacon
        vault.grantRole(vault.BEACON_ROLE(), address(beacon));

        // 6. Configure epoch 1 — validates key set on-chain
        registry.configureEpoch(masterKey, operators, pkShares);
        console.log("Epoch 1 configured.");

        // 7. Deposit bonds for each operator (deployer holds all USDG for solo mode)
        IERC20(bondToken).approve(address(vault), bondAmount * OPERATOR_COUNT);
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            // Impersonate each operator address to call deposit on their behalf.
            // In solo mode all operators may share the deployer address; deposit is called once per operator slot.
            // If operators[i] != msg.sender, transfer bond to that address first so they can deposit.
            if (operators[i] == msg.sender) {
                vault.deposit(bondAmount);
            } else {
                // Transfer and have the operator deposit via low-level call
                IERC20(bondToken).transfer(operators[i], bondAmount);
                // Note: operator must call vault.deposit(bondAmount) themselves if address differs.
                console.log("Transferred bond to operator", i, operators[i]);
                console.log("Operator must call vault.deposit() manually.");
            }
        }

        vm.stopBroadcast();

        console.log();
        console.log("=== BEACON STACK DEPLOYED ===");
        console.log("BLS12381Verifier      :", address(verifier));
        console.log("BeaconOperatorRegistry:", address(registry));
        console.log("OperatorBondVault     :", address(vault));
        console.log("ThresholdRandomBeacon :", address(beacon));
        console.log();
        console.log("Next: run DeployHoodPackzV2.s.sol with THRESHOLD_BEACON =", address(beacon));
    }
}
