// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IRandomnessConsumer} from "../../src/interfaces/IRandomnessCoordinator.sol";
import {IThresholdSignatureVerifier} from "../../src/interfaces/IThresholdSignatureVerifier.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {BeaconOperatorRegistry} from "../../src/randomness/BeaconOperatorRegistry.sol";
import {OperatorBondVault} from "../../src/randomness/OperatorBondVault.sol";
import {ThresholdRandomBeacon} from "../../src/randomness/ThresholdRandomBeacon.sol";

contract MockThresholdSignatureVerifier is IThresholdSignatureVerifier {
    mapping(bytes32 => mapping(bytes32 => bytes32)) public shareHashes;
    bool public keySetValid = true;

    function validMasterSignature(bytes calldata masterPublicKey, bytes32 digest) external pure returns (bytes memory) {
        return abi.encode(masterPublicKey, digest);
    }

    function setKeySetValid(bool valid) external {
        keySetValid = valid;
    }

    function setValidShare(bytes calldata publicKeyShare, bytes32 digest, bytes calldata share) external {
        shareHashes[keccak256(publicKeyShare)][digest] = keccak256(share);
    }

    function validateKeySet(bytes calldata masterPublicKey, bytes[] calldata publicKeyShares)
        external
        view
        returns (bool)
    {
        return keySetValid && masterPublicKey.length != 0 && publicKeyShares.length == 7;
    }

    function verifyMasterSignature(bytes calldata masterPublicKey, bytes32 digest, bytes calldata signature)
        external
        pure
        returns (bool)
    {
        return keccak256(signature) == keccak256(abi.encode(masterPublicKey, digest));
    }

    function verifySignatureShare(bytes calldata publicKeyShare, bytes32 digest, bytes calldata share)
        external
        view
        returns (bool)
    {
        return shareHashes[keccak256(publicKeyShare)][digest] == keccak256(share);
    }
}

contract BeaconConsumer is IRandomnessConsumer {
    bool public rejectDelivery;
    uint256 public deliveredRequestId;
    uint256[] private _words;

    function request(ThresholdRandomBeacon beacon, uint32 numWords, uint256 exposure)
        external
        returns (uint256 requestId)
    {
        return beacon.requestRandomness(numWords, exposure);
    }

    function requestLegacy(ThresholdRandomBeacon beacon, uint32 numWords) external pure returns (uint256 requestId) {
        return beacon.requestRandomness(numWords);
    }

    function setRejectDelivery(bool rejected) external {
        rejectDelivery = rejected;
    }

    function rawFulfillRandomness(uint256 requestId, uint256[] calldata words) external {
        require(!rejectDelivery, "delivery rejected");
        deliveredRequestId = requestId;
        _words = words;
    }

    function word(uint256 index) external view returns (uint256) {
        return _words[index];
    }
}

contract ThresholdRandomBeaconTest is Test {
    uint256 internal constant BOND = 100e6;
    uint256 internal constant EXPOSURE = 400e6;
    uint64 internal constant REQUEST_WINDOW = 60;
    uint64 internal constant SIGNATURE_WINDOW = 60;
    uint64 internal constant RESCUE_WINDOW = 60;

    address internal admin = makeAddr("admin");
    address internal slashReceiver = makeAddr("slashReceiver");

    MockERC20 internal usdg;
    BeaconOperatorRegistry internal registry;
    OperatorBondVault internal bonds;
    MockThresholdSignatureVerifier internal verifier;
    ThresholdRandomBeacon internal beacon;
    BeaconConsumer internal consumer;
    address[7] internal operators;

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 6);
        verifier = new MockThresholdSignatureVerifier();
        registry = new BeaconOperatorRegistry(verifier, admin);
        bonds = new OperatorBondVault(IERC20(address(usdg)), 30 seconds, admin);
        beacon = new ThresholdRandomBeacon(
            registry, bonds, verifier, slashReceiver, REQUEST_WINDOW, SIGNATURE_WINDOW, RESCUE_WINDOW, admin
        );
        consumer = new BeaconConsumer();

        address[] memory operatorList = new address[](7);
        bytes[] memory publicKeyShares = new bytes[](7);
        for (uint8 i = 0; i < 7; i++) {
            operators[i] = makeAddr(string.concat("operator", vm.toString(i)));
            operatorList[i] = operators[i];
            publicKeyShares[i] = abi.encodePacked("public-key-share-", i);

            usdg.mint(operators[i], BOND);
            vm.startPrank(operators[i]);
            usdg.approve(address(bonds), BOND);
            bonds.deposit(BOND);
            vm.stopPrank();
        }

        vm.startPrank(admin);
        registry.configureEpoch(abi.encodePacked("master-public-key"), operatorList, publicKeyShares);
        bonds.grantRole(bonds.BEACON_ROLE(), address(beacon));
        beacon.grantRole(beacon.CONSUMER_ROLE(), address(consumer));
        vm.stopPrank();
    }

    function test_exposureCapacity_isMinimumBlockingCoalitionBond() public view {
        assertEq(beacon.availableExposure(), EXPOSURE);
    }

    function test_request_rejectsExposureAboveBondedCapacity() public {
        vm.expectRevert(ThresholdRandomBeacon.ExposureCapacityExceeded.selector);
        consumer.request(beacon, 2, EXPOSURE + 1);
    }

    function test_legacyRequestWithoutExposure_failsClosed() public {
        vm.expectRevert(bytes4(keccak256("ExplicitExposureRequired()")));
        consumer.requestLegacy(beacon, 2);
    }

    function test_explicitZeroExposure_failsClosed() public {
        vm.expectRevert(ThresholdRandomBeacon.ExplicitExposureRequired.selector);
        consumer.request(beacon, 2, 0);
    }

    function testFuzz_request_acceptsExposureWithinCapacity(uint256 exposure) public {
        exposure = bound(exposure, 1, EXPOSURE);
        uint256 requestId = consumer.request(beacon, 2, exposure);
        (,, uint256 storedExposure,,) = beacon.requests(requestId);
        assertEq(storedExposure, exposure);
        assertEq(beacon.availableExposure(), EXPOSURE - exposure);
    }

    function test_aggregateFinalization_isImmutableAndDeliveryCanRetry() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        _seal(roundId);

        bytes memory signature = _validMasterSignature(roundId);
        consumer.setRejectDelivery(true);
        beacon.finalizeRound(roundId, signature);

        bytes32 randomness = beacon.roundRandomness(roundId);
        assertNotEq(randomness, bytes32(0));
        assertFalse(beacon.deliver(requestId));
        assertEq(beacon.roundRandomness(roundId), randomness);

        consumer.setRejectDelivery(false);
        assertTrue(beacon.deliver(requestId));
        assertEq(consumer.deliveredRequestId(), requestId);
        assertEq(consumer.word(0), uint256(keccak256(abi.encode(randomness, requestId, uint32(0)))));
        assertEq(consumer.word(1), uint256(keccak256(abi.encode(randomness, requestId, uint32(1)))));

        vm.expectRevert(ThresholdRandomBeacon.RoundAlreadyResolved.selector);
        beacon.finalizeRound(roundId, signature);
    }

    function test_signatureCannotReplayAcrossRounds() public {
        uint256 firstRequest = consumer.request(beacon, 2, 1e6);
        uint256 firstRound = beacon.requestRound(firstRequest);
        _seal(firstRound);
        bytes memory firstSignature = _validMasterSignature(firstRound);
        beacon.finalizeRound(firstRound, firstSignature);

        uint256 secondRequest = consumer.request(beacon, 2, 1e6);
        uint256 secondRound = beacon.requestRound(secondRequest);
        _seal(secondRound);

        vm.expectRevert(ThresholdRandomBeacon.InvalidMasterSignature.selector);
        beacon.finalizeRound(secondRound, firstSignature);
    }

    function test_sealRound_startsFreshSigningAndRescueWindows() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        vm.warp(beacon.requestDeadline(roundId) + SIGNATURE_WINDOW + RESCUE_WINDOW + 1);

        uint256 sealedAt = block.timestamp;
        beacon.sealRound(roundId);

        assertEq(beacon.normalDeadline(roundId), sealedAt + SIGNATURE_WINDOW);
        assertEq(beacon.rescueDeadline(roundId), sealedAt + SIGNATURE_WINDOW + RESCUE_WINDOW);
        beacon.finalizeRound(roundId, _validMasterSignature(roundId));
    }

    function test_registry_rejectsCryptographicallyInvalidKeySet() public {
        address[] memory operatorList = new address[](7);
        bytes[] memory publicKeyShares = new bytes[](7);
        for (uint8 i = 0; i < 7; i++) {
            operatorList[i] = makeAddr(string.concat("replacement-operator", vm.toString(i)));
            publicKeyShares[i] = abi.encodePacked("replacement-public-key-share-", i);
        }
        verifier.setKeySetValid(false);

        vm.prank(admin);
        vm.expectRevert(BeaconOperatorRegistry.InvalidEpochConfiguration.selector);
        registry.configureEpoch(abi.encodePacked("invalid-master-public-key"), operatorList, publicKeyShares);
    }

    function test_beacon_rejectsVerifierDifferentFromRegistry() public {
        MockThresholdSignatureVerifier otherVerifier = new MockThresholdSignatureVerifier();

        vm.expectRevert(ThresholdRandomBeacon.InvalidConfiguration.selector);
        new ThresholdRandomBeacon(
            registry, bonds, otherVerifier, slashReceiver, REQUEST_WINDOW, SIGNATURE_WINDOW, RESCUE_WINDOW, admin
        );
    }

    function test_rescue_requiresFourDistinctVerifiedShares() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        _seal(roundId);
        _enterRescue(roundId);

        for (uint8 i = 0; i < 3; i++) {
            _submitShare(roundId, i);
        }

        bytes memory signature = _validMasterSignature(roundId);
        vm.expectRevert(ThresholdRandomBeacon.RescueThresholdNotMet.selector);
        beacon.finalizeRescueRound(roundId, signature);

        bytes memory duplicate = abi.encodePacked("share-", uint8(0));
        vm.prank(operators[0]);
        vm.expectRevert(ThresholdRandomBeacon.ShareAlreadySubmitted.selector);
        beacon.submitRescueShare(roundId, duplicate);

        _submitShare(roundId, 3);
        beacon.finalizeRescueRound(roundId, signature);
        assertNotEq(beacon.roundRandomness(roundId), bytes32(0));
    }

    function test_rescue_rejectsInvalidShare() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        _seal(roundId);
        _enterRescue(roundId);

        vm.prank(operators[0]);
        vm.expectRevert(ThresholdRandomBeacon.InvalidSignatureShare.selector);
        beacon.submitRescueShare(roundId, "invalid-share");
    }

    function test_rescueThreshold_remainsFinalizableAfterSubmissionDeadline() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        _seal(roundId);
        _enterRescue(roundId);
        for (uint8 i = 0; i < 4; i++) {
            _submitShare(roundId, i);
        }

        vm.warp(beacon.rescueDeadline(roundId) + 1);
        vm.expectRevert(ThresholdRandomBeacon.RescueThresholdNotMet.selector);
        beacon.cancelFailedRound(roundId);

        beacon.finalizeRescueRound(roundId, _validMasterSignature(roundId));
        assertNotEq(beacon.roundRandomness(roundId), bytes32(0));
    }

    function test_failedRound_slashesOnlyMissingOperatorsUpToExposure() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        _seal(roundId);
        _enterRescue(roundId);

        for (uint8 i = 0; i < 3; i++) {
            _submitShare(roundId, i);
        }
        vm.warp(beacon.rescueDeadline(roundId) + 1);
        beacon.cancelFailedRound(roundId);

        for (uint8 i = 0; i < 3; i++) {
            assertEq(bonds.bondOf(operators[i]), BOND);
        }
        for (uint8 i = 3; i < 7; i++) {
            assertEq(bonds.bondOf(operators[i]), 0);
        }
        assertEq(usdg.balanceOf(slashReceiver), EXPOSURE);
        assertEq(uint8(beacon.roundStatus(roundId)), uint8(ThresholdRandomBeacon.RoundStatus.Cancelled));
    }

    function test_lockedBond_cannotBeWithdrawnUntilRoundResolves() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);

        vm.startPrank(operators[0]);
        bonds.requestWithdrawal(BOND);
        vm.warp(block.timestamp + 30 seconds);
        vm.expectRevert(OperatorBondVault.InsufficientAvailableBond.selector);
        bonds.executeWithdrawal(operators[0]);
        vm.stopPrank();

        _seal(roundId);
        beacon.finalizeRound(roundId, _validMasterSignature(roundId));

        vm.prank(operators[0]);
        bonds.executeWithdrawal(operators[0]);
        assertEq(usdg.balanceOf(operators[0]), BOND);
    }

    function test_pendingWithdrawal_isExcludedFromNewRoundCapacity() public {
        vm.prank(operators[0]);
        bonds.requestWithdrawal(BOND);

        assertEq(bonds.availableBond(operators[0]), 0);
        assertEq(beacon.availableExposure(), EXPOSURE - BOND);
        vm.expectRevert(ThresholdRandomBeacon.ExposureCapacityExceeded.selector);
        consumer.request(beacon, 2, EXPOSURE);
    }

    function test_slash_reducesPendingWithdrawalToRemainingBond() public {
        uint256 requestId = consumer.request(beacon, 2, EXPOSURE);
        uint256 roundId = beacon.requestRound(requestId);
        vm.prank(operators[3]);
        bonds.requestWithdrawal(BOND);
        _seal(roundId);
        _enterRescue(roundId);
        for (uint8 i = 0; i < 3; i++) {
            _submitShare(roundId, i);
        }

        vm.warp(beacon.rescueDeadline(roundId) + 1);
        beacon.cancelFailedRound(roundId);

        (uint256 pendingAmount,) = bonds.withdrawals(operators[3]);
        assertEq(pendingAmount, 0);
    }

    function test_bondVault_rejectsFeeOnTransferToken() public {
        MockERC20 taxed = new MockERC20("Taxed", "TAX", 6);
        OperatorBondVault taxedVault = new OperatorBondVault(IERC20(address(taxed)), 30 seconds, admin);
        taxed.mint(address(this), BOND);
        taxed.setFeeOnTransferBps(100);
        taxed.approve(address(taxedVault), BOND);

        vm.expectRevert(OperatorBondVault.FeeOnTransferNotSupported.selector);
        taxedVault.deposit(BOND);
    }

    function _seal(uint256 roundId) internal {
        vm.warp(beacon.requestDeadline(roundId) + 1);
        beacon.sealRound(roundId);
    }

    function _enterRescue(uint256 roundId) internal {
        vm.warp(beacon.normalDeadline(roundId) + 1);
    }

    function _validMasterSignature(uint256 roundId) internal view returns (bytes memory) {
        uint256 epoch = beacon.roundEpoch(roundId);
        return verifier.validMasterSignature(registry.masterPublicKey(epoch), beacon.roundDigest(roundId));
    }

    function _submitShare(uint256 roundId, uint8 index) internal {
        bytes memory share = abi.encodePacked("share-", index);
        verifier.setValidShare(
            registry.publicKeyShare(beacon.roundEpoch(roundId), index), beacon.roundDigest(roundId), share
        );
        vm.prank(operators[index]);
        beacon.submitRescueShare(roundId, share);
    }
}
