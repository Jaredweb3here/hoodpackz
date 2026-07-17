// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Verifies a threshold signature and its individual rescue shares.
/// @dev The production implementation must use the epoch's registered BLS key,
///      reject non-canonical/infinity points, and pass cross-implementation vectors.
interface IThresholdSignatureVerifier {
    function validateKeySet(bytes calldata masterPublicKey, bytes[] calldata publicKeyShares)
        external
        view
        returns (bool);

    function verifyMasterSignature(bytes calldata masterPublicKey, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool);

    function verifySignatureShare(bytes calldata publicKeyShare, bytes32 digest, bytes calldata share)
        external
        view
        returns (bool);
}
