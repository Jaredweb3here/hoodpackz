// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IRandomnessCoordinator, IRandomnessConsumer} from "../interfaces/IRandomnessCoordinator.sol";
import {IThresholdSignatureVerifier} from "../interfaces/IThresholdSignatureVerifier.sol";
import {BeaconOperatorRegistry} from "./BeaconOperatorRegistry.sol";
import {OperatorBondVault} from "./OperatorBondVault.sol";

/// @notice Bonded 4-of-7 threshold randomness with an attributable rescue path.
contract ThresholdRandomBeacon is IRandomnessCoordinator, AccessControl, ReentrancyGuard {
    uint8 public constant OPERATOR_COUNT = 7;
    uint8 public constant THRESHOLD = 4;
    uint32 public constant MAX_WORDS = 32;
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    enum RoundStatus {
        Collecting,
        Signing,
        Finalized,
        Cancelled
    }

    struct Round {
        uint256 epoch;
        uint256 exposure;
        uint256 capacity;
        bytes32 requestsRoot;
        bytes32 digest;
        bytes32 randomness;
        uint64 requestDeadline;
        uint64 normalDeadline;
        uint64 rescueDeadline;
        uint8 shareCount;
        RoundStatus status;
        bool exists;
    }

    struct Request {
        address consumer;
        uint256 roundId;
        uint256 exposure;
        uint32 numWords;
        bool delivered;
    }

    BeaconOperatorRegistry public immutable registry;
    OperatorBondVault public immutable bondVault;
    IThresholdSignatureVerifier public immutable verifier;
    address public immutable slashReceiver;
    uint64 public immutable requestWindow;
    uint64 public immutable signatureWindow;
    uint64 public immutable rescueWindow;

    uint256 public activeRoundId;
    uint256 public nextRoundId = 1;
    uint96 public nextRequestNonce = 1;

    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => Request) public requests;
    mapping(uint256 => uint256) public requestRound;
    mapping(uint256 => uint256[OPERATOR_COUNT]) private _roundLocks;
    mapping(uint256 => mapping(uint8 => bool)) public rescueShareSubmitted;

    event RoundOpened(uint256 indexed roundId, uint256 indexed epoch, uint256 capacity, uint64 requestDeadline);
    event RandomnessRequested(
        uint256 indexed requestId, uint256 indexed roundId, address indexed consumer, uint32 numWords, uint256 exposure
    );
    event RoundSealed(uint256 indexed roundId, bytes32 indexed digest, uint256 exposure);
    event RescueShareSubmitted(uint256 indexed roundId, uint8 indexed operatorIndex, address indexed operator);
    event RoundFinalized(uint256 indexed roundId, bytes32 indexed randomness, bool rescued);
    event RoundCancelled(uint256 indexed roundId, uint256 slashed);
    event RandomnessDelivered(uint256 indexed requestId, address indexed consumer);
    event RandomnessDeliveryFailed(uint256 indexed requestId, address indexed consumer);

    error InvalidConfiguration();
    error InvalidWordCount();
    error ExplicitExposureRequired();
    error ExposureCapacityExceeded();
    error RoundNotCollecting();
    error RequestWindowOpen();
    error NormalWindowClosed();
    error RescueWindowClosed();
    error RoundAlreadyResolved();
    error InvalidMasterSignature();
    error InvalidSignatureShare();
    error ShareAlreadySubmitted();
    error RescueThresholdNotMet();
    error UnknownRequest();

    constructor(
        BeaconOperatorRegistry operatorRegistry,
        OperatorBondVault operatorBondVault,
        IThresholdSignatureVerifier signatureVerifier,
        address slashRecipient,
        uint64 collectionDuration,
        uint64 normalSignatureDuration,
        uint64 rescueDuration,
        address admin
    ) {
        if (
            address(operatorRegistry) == address(0) || address(operatorBondVault) == address(0)
                || address(signatureVerifier) == address(0) || slashRecipient == address(0) || admin == address(0)
                || collectionDuration == 0 || normalSignatureDuration == 0 || rescueDuration == 0
                || address(operatorRegistry.verifier()) != address(signatureVerifier)
        ) revert InvalidConfiguration();

        registry = operatorRegistry;
        bondVault = operatorBondVault;
        verifier = signatureVerifier;
        slashReceiver = slashRecipient;
        requestWindow = collectionDuration;
        signatureWindow = normalSignatureDuration;
        rescueWindow = rescueDuration;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IRandomnessCoordinator
    function requestRandomness(uint32) external pure returns (uint256) {
        revert ExplicitExposureRequired();
    }

    /// @notice Queue randomness while reserving the maximum selectively abortable value.
    function requestRandomness(uint32 numWords, uint256 exposure)
        external
        onlyRole(CONSUMER_ROLE)
        returns (uint256 requestId)
    {
        return _requestRandomness(numWords, exposure);
    }

    function availableExposure() public view returns (uint256) {
        Round storage active = _rounds[activeRoundId];
        if (active.exists && active.status == RoundStatus.Collecting) {
            return active.capacity - active.exposure;
        }
        if (active.exists && active.status != RoundStatus.Finalized && active.status != RoundStatus.Cancelled) {
            return 0;
        }
        return _blockingCoalitionCapacity();
    }

    function sealRound(uint256 roundId) external {
        Round storage round = _rounds[roundId];
        if (!round.exists || round.status != RoundStatus.Collecting) revert RoundNotCollecting();
        if (block.timestamp <= round.requestDeadline) revert RequestWindowOpen();

        round.status = RoundStatus.Signing;
        round.normalDeadline = uint64(block.timestamp) + signatureWindow;
        round.rescueDeadline = round.normalDeadline + rescueWindow;
        round.digest = keccak256(
            abi.encode(
                "HOODPACKZ_THRESHOLD_BEACON_V1",
                block.chainid,
                address(this),
                roundId,
                round.epoch,
                round.requestsRoot,
                round.exposure
            )
        );
        emit RoundSealed(roundId, round.digest, round.exposure);
    }

    function finalizeRound(uint256 roundId, bytes calldata signature) external nonReentrant {
        Round storage round = _signingRound(roundId);
        if (block.timestamp > round.normalDeadline) revert NormalWindowClosed();
        if (!verifier.verifyMasterSignature(registry.masterPublicKey(round.epoch), round.digest, signature)) {
            revert InvalidMasterSignature();
        }
        _finalize(roundId, signature, false);
    }

    function submitRescueShare(uint256 roundId, bytes calldata share) external {
        Round storage round = _signingRound(roundId);
        if (block.timestamp <= round.normalDeadline || block.timestamp > round.rescueDeadline) {
            revert RescueWindowClosed();
        }

        uint8 operatorIndex = registry.operatorIndex(round.epoch, msg.sender);
        if (rescueShareSubmitted[roundId][operatorIndex]) revert ShareAlreadySubmitted();
        if (!verifier.verifySignatureShare(registry.publicKeyShare(round.epoch, operatorIndex), round.digest, share)) {
            revert InvalidSignatureShare();
        }

        rescueShareSubmitted[roundId][operatorIndex] = true;
        round.shareCount++;
        emit RescueShareSubmitted(roundId, operatorIndex, msg.sender);
    }

    function finalizeRescueRound(uint256 roundId, bytes calldata signature) external nonReentrant {
        Round storage round = _signingRound(roundId);
        if (block.timestamp <= round.normalDeadline) revert RescueWindowClosed();
        if (round.shareCount < THRESHOLD) revert RescueThresholdNotMet();
        if (!verifier.verifyMasterSignature(registry.masterPublicKey(round.epoch), round.digest, signature)) {
            revert InvalidMasterSignature();
        }
        _finalize(roundId, signature, true);
    }

    function cancelFailedRound(uint256 roundId) external nonReentrant {
        Round storage round = _signingRound(roundId);
        if (block.timestamp <= round.rescueDeadline) revert RescueWindowClosed();
        if (round.shareCount >= THRESHOLD) revert RescueThresholdNotMet();

        round.status = RoundStatus.Cancelled;
        uint256 remainingSlash = round.exposure;
        uint256 totalSlashed;
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            uint256 locked = _roundLocks[roundId][i];
            address operator = registry.operatorAt(round.epoch, i);
            if (!rescueShareSubmitted[roundId][i] && remainingSlash != 0) {
                uint256 slashAmount = locked < remainingSlash ? locked : remainingSlash;
                if (slashAmount != 0) {
                    bondVault.slash(operator, slashAmount, slashReceiver);
                    locked -= slashAmount;
                    remainingSlash -= slashAmount;
                    totalSlashed += slashAmount;
                }
            }
            if (locked != 0) bondVault.unlock(operator, locked);
        }

        activeRoundId = 0;
        emit RoundCancelled(roundId, totalSlashed);
    }

    /// @notice Retryable callback delivery. Finalized randomness never changes on failure.
    function deliver(uint256 requestId) external nonReentrant returns (bool delivered) {
        Request storage request = requests[requestId];
        if (request.consumer == address(0)) revert UnknownRequest();
        if (request.delivered) return true;

        Round storage round = _rounds[request.roundId];
        if (round.status != RoundStatus.Finalized) revert RoundAlreadyResolved();

        uint256[] memory words = new uint256[](request.numWords);
        for (uint32 i = 0; i < request.numWords; i++) {
            words[i] = uint256(keccak256(abi.encode(round.randomness, requestId, i)));
        }

        request.delivered = true;
        (delivered,) =
            request.consumer.call(abi.encodeCall(IRandomnessConsumer.rawFulfillRandomness, (requestId, words)));
        if (!delivered) {
            request.delivered = false;
            emit RandomnessDeliveryFailed(requestId, request.consumer);
            return false;
        }

        emit RandomnessDelivered(requestId, request.consumer);
    }

    function roundStatus(uint256 roundId) external view returns (RoundStatus) {
        return _rounds[roundId].status;
    }

    function roundEpoch(uint256 roundId) external view returns (uint256) {
        return _rounds[roundId].epoch;
    }

    function roundDigest(uint256 roundId) external view returns (bytes32) {
        return _rounds[roundId].digest;
    }

    function roundRandomness(uint256 roundId) external view returns (bytes32) {
        return _rounds[roundId].randomness;
    }

    function requestDeadline(uint256 roundId) external view returns (uint64) {
        return _rounds[roundId].requestDeadline;
    }

    function normalDeadline(uint256 roundId) external view returns (uint64) {
        return _rounds[roundId].normalDeadline;
    }

    function rescueDeadline(uint256 roundId) external view returns (uint64) {
        return _rounds[roundId].rescueDeadline;
    }

    function _requestRandomness(uint32 numWords, uint256 exposure) internal returns (uint256 requestId) {
        if (numWords == 0 || numWords > MAX_WORDS) revert InvalidWordCount();
        if (exposure == 0) revert ExplicitExposureRequired();

        uint256 roundId = activeRoundId;
        Round storage round = _rounds[roundId];
        if (roundId == 0 || round.status == RoundStatus.Finalized || round.status == RoundStatus.Cancelled) {
            roundId = _openRound();
            round = _rounds[roundId];
        }
        if (round.status != RoundStatus.Collecting || block.timestamp > round.requestDeadline) {
            revert RoundNotCollecting();
        }
        if (round.exposure + exposure > round.capacity) revert ExposureCapacityExceeded();

        requestId = (uint256(uint160(address(this))) << 96) | nextRequestNonce++;
        requests[requestId] =
            Request({consumer: msg.sender, roundId: roundId, exposure: exposure, numWords: numWords, delivered: false});
        requestRound[requestId] = roundId;
        round.exposure += exposure;
        round.requestsRoot = keccak256(abi.encode(round.requestsRoot, requestId, msg.sender, numWords, exposure));

        emit RandomnessRequested(requestId, roundId, msg.sender, numWords, exposure);
    }

    function _openRound() internal returns (uint256 roundId) {
        uint256 epoch = registry.currentEpoch();
        if (epoch == 0) revert InvalidConfiguration();

        roundId = nextRoundId++;
        uint256[OPERATOR_COUNT] memory locks;
        uint256[OPERATOR_COUNT] memory sorted;
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            address operator = registry.operatorAt(epoch, i);
            uint256 available = bondVault.availableBond(operator);
            locks[i] = available;
            sorted[i] = available;
            if (available != 0) bondVault.lock(operator, available);
        }
        _sort(sorted);
        uint256 capacity = sorted[0] + sorted[1] + sorted[2] + sorted[3];
        if (capacity == 0) revert ExposureCapacityExceeded();

        uint64 collectionDeadline = uint64(block.timestamp) + requestWindow;
        _rounds[roundId] = Round({
            epoch: epoch,
            exposure: 0,
            capacity: capacity,
            requestsRoot: bytes32(0),
            digest: bytes32(0),
            randomness: bytes32(0),
            requestDeadline: collectionDeadline,
            normalDeadline: 0,
            rescueDeadline: 0,
            shareCount: 0,
            status: RoundStatus.Collecting,
            exists: true
        });
        _roundLocks[roundId] = locks;
        activeRoundId = roundId;
        emit RoundOpened(roundId, epoch, capacity, collectionDeadline);
    }

    function _finalize(uint256 roundId, bytes calldata signature, bool rescued) internal {
        Round storage round = _rounds[roundId];
        round.status = RoundStatus.Finalized;
        round.randomness = keccak256(abi.encode(signature, round.digest));
        _unlockRound(roundId, round.epoch);
        activeRoundId = 0;
        emit RoundFinalized(roundId, round.randomness, rescued);
    }

    function _unlockRound(uint256 roundId, uint256 epoch) internal {
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            uint256 locked = _roundLocks[roundId][i];
            if (locked != 0) bondVault.unlock(registry.operatorAt(epoch, i), locked);
        }
    }

    function _signingRound(uint256 roundId) internal view returns (Round storage round) {
        round = _rounds[roundId];
        if (!round.exists || round.status == RoundStatus.Collecting) revert RoundNotCollecting();
        if (round.status != RoundStatus.Signing) revert RoundAlreadyResolved();
    }

    function _blockingCoalitionCapacity() internal view returns (uint256 capacity) {
        uint256 epoch = registry.currentEpoch();
        if (epoch == 0) return 0;
        uint256[OPERATOR_COUNT] memory balances;
        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            balances[i] = bondVault.availableBond(registry.operatorAt(epoch, i));
        }
        _sort(balances);
        return balances[0] + balances[1] + balances[2] + balances[3];
    }

    function _sort(uint256[OPERATOR_COUNT] memory values) internal pure {
        for (uint256 i = 1; i < OPERATOR_COUNT; i++) {
            uint256 value = values[i];
            uint256 j = i;
            while (j != 0 && values[j - 1] > value) {
                values[j] = values[j - 1];
                j--;
            }
            values[j] = value;
        }
    }
}
