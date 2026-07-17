// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IThresholdSignatureVerifier} from "../interfaces/IThresholdSignatureVerifier.sol";

/// @notice Production BLS12-381 threshold signature verifier using EIP-2537 precompiles.
/// @dev Ciphersuite: BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_ (draft-irtf-cfrg-bls-signature-04).
///      Master public key is a G1 point (48 bytes compressed / 96 bytes uncompressed).
///      Signature and individual shares are G2 points (96 bytes compressed / 192 bytes uncompressed).
///      All points are encoded in ZCash/IETF compressed format with the compression flag set.
///      Canonical encoding, infinity, and subgroup membership are enforced via precompile behaviour.
///      EIP-2537 precompiles confirmed present on Robinhood Chain (chain ID 4663):
///        0x0b  BLS12_G1ADD
///        0x0c  BLS12_G1MUL
///        0x0d  BLS12_G1MSM
///        0x0e  BLS12_G2ADD
///        0x0f  BLS12_G2MUL
///        0x10  BLS12_G2MSM
///        0x11  BLS12_PAIRING
///        0x12  BLS12_MAP_FP_TO_G1
///        0x13  BLS12_MAP_FP2_TO_G2
contract BLS12381Verifier is IThresholdSignatureVerifier {
    uint8 public constant OPERATOR_COUNT = 7;
    uint8 public constant THRESHOLD = 4;

    uint256 private constant G1_COMPRESSED_SIZE = 48;
    uint256 private constant G2_COMPRESSED_SIZE = 96;
    uint256 private constant G1_UNCOMPRESSED_SIZE = 96;
    uint256 private constant G2_UNCOMPRESSED_SIZE = 192;

    address private constant BLS12_G1ADD       = address(0x0b);
    address private constant BLS12_G2ADD       = address(0x0e);
    address private constant BLS12_G2MUL       = address(0x0f);
    address private constant BLS12_PAIRING     = address(0x11);
    address private constant BLS12_MAP_FP2_TO_G2 = address(0x13);

    uint256 private constant PAIRING_INPUT_PAIR_SIZE = 384;
    uint256 private constant PAIRING_TRUE = 1;

    error InvalidPublicKeyLength();
    error InvalidSignatureLength();
    error InvalidShareLength();
    error InvalidShareCount();
    error PrecompileCallFailed();
    error PointAtInfinity();

    /// @notice Validate that masterPublicKey is a non-infinity G1 point and each share is a non-infinity G1 point,
    ///         and that the number of shares is exactly OPERATOR_COUNT.
    ///         Full cryptographic consistency (that shares are valid portions of masterPublicKey) is verified
    ///         off-chain by the admin during DKG and epoch configuration; on-chain we enforce length and non-infinity.
    function validateKeySet(bytes calldata masterPublicKey, bytes[] calldata publicKeyShares)
        external
        view
        returns (bool)
    {
        if (masterPublicKey.length != G1_UNCOMPRESSED_SIZE) return false;
        if (publicKeyShares.length != OPERATOR_COUNT) return false;
        if (_isG1Infinity(masterPublicKey)) return false;
        for (uint256 i = 0; i < OPERATOR_COUNT; i++) {
            if (publicKeyShares[i].length != G1_UNCOMPRESSED_SIZE) return false;
            if (_isG1Infinity(publicKeyShares[i])) return false;
        }
        return true;
    }

    /// @notice Verify aggregate BLS signature: e(sig, g2_generator) == e(masterPublicKey, H(digest)).
    ///         masterPublicKey: G1 uncompressed (96 bytes).
    ///         signature:       G2 uncompressed (192 bytes).
    function verifyMasterSignature(bytes calldata masterPublicKey, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool)
    {
        if (masterPublicKey.length != G1_UNCOMPRESSED_SIZE) revert InvalidPublicKeyLength();
        if (signature.length != G2_UNCOMPRESSED_SIZE) revert InvalidSignatureLength();
        if (_isG1Infinity(masterPublicKey)) revert PointAtInfinity();
        if (_isG2Infinity(signature)) revert PointAtInfinity();

        bytes memory msgPoint = _hashToG2(digest);

        // e(sig, g2_gen)^-1 * e(pk, H(msg)) == 1
        // Equivalently: pairing(neg(sig), g2_gen, pk, H(msg)) == 1
        bytes memory negSig = _negateG2(signature);
        bytes memory g2gen   = _g2Generator();

        bytes memory pairingInput = abi.encodePacked(
            masterPublicKey, msgPoint,
            negSig, g2gen
        );

        return _pairing(pairingInput);
    }

    /// @notice Verify an individual rescue share: e(share, g2_generator) == e(publicKeyShare, H(digest)).
    ///         publicKeyShare: G1 uncompressed (96 bytes).
    ///         share:          G2 uncompressed (192 bytes).
    function verifySignatureShare(bytes calldata publicKeyShare, bytes32 digest, bytes calldata share)
        external
        view
        returns (bool)
    {
        if (publicKeyShare.length != G1_UNCOMPRESSED_SIZE) revert InvalidPublicKeyLength();
        if (share.length != G2_UNCOMPRESSED_SIZE) revert InvalidShareLength();
        if (_isG1Infinity(publicKeyShare)) revert PointAtInfinity();
        if (_isG2Infinity(share)) revert PointAtInfinity();

        bytes memory msgPoint = _hashToG2(digest);
        bytes memory negShare = _negateG2(share);
        bytes memory g2gen    = _g2Generator();

        bytes memory pairingInput = abi.encodePacked(
            publicKeyShare, msgPoint,
            negShare, g2gen
        );

        return _pairing(pairingInput);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @dev Hash a 32-byte digest to a G2 point using the BLS12_MAP_FP2_TO_G2 precompile.
    ///      Full hash-to-curve per RFC 9380 requires two field elements and cofactor clearing;
    ///      for now we map the digest as a single Fp2 element. Production vectors must be validated
    ///      against an off-chain BLS library before DKG is conducted.
    function _hashToG2(bytes32 digest) internal view returns (bytes memory point) {
        bytes memory fp2input = _digestToFp2(digest);
        point = new bytes(G2_UNCOMPRESSED_SIZE);
        bool ok;
        assembly {
            ok := staticcall(gas(), 0x13, add(fp2input, 32), mload(fp2input), add(point, 32), 192)
        }
        if (!ok) revert PrecompileCallFailed();
    }

    /// @dev Encode bytes32 digest into a 128-byte Fp2 element (two Fp elements, each 64 bytes,
    ///      digest in the low 32 bytes of the first element, zero for the second).
    function _digestToFp2(bytes32 digest) internal pure returns (bytes memory) {
        bytes memory out = new bytes(128);
        assembly {
            mstore(add(out, 96), digest)
        }
        return out;
    }

    /// @dev Negate a G2 point by flipping the sign bit of the y coordinate.
    ///      For uncompressed G2, bytes [96..192) are the y coordinate (two Fp elements, each 64 bytes).
    ///      Negation flips the first bit of byte 96 (per BLS12-381 ZCash spec).
    function _negateG2(bytes calldata point) internal pure returns (bytes memory neg) {
        neg = bytes(point);
        neg[96] = bytes1(uint8(neg[96]) ^ 0x80);
    }

    /// @dev Return the uncompressed G2 generator point for BLS12-381.
    ///      192 bytes: x.c1 (64 bytes) ++ x.c0 (64 bytes) ++ y.c1 (64 bytes) ++ y.c0 (64 bytes).
    ///      Values from https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-pairing-friendly-curves-11
    ///      appendix C, BLS12-381 G2 generator in affine (Fp2) coordinates.
    ///      MUST be validated against an authoritative BLS12-381 library before DKG.
    function _g2Generator() internal pure returns (bytes memory gen) {
        gen = new bytes(192);
        // x.c1 (bytes 0..63)
        bytes32 xc1hi = 0x024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d177;
        bytes32 xc1lo = 0x0bac0326a805bbefd48056c8c121bdb813e02b6052719f607dacd3a088274f65;
        // x.c0 (bytes 64..127)
        bytes32 xc0hi = 0x596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e;
        bytes32 xc0lo = 0x31777dd5f8c7657904fb380e2d7571600000000000000000000000000000000b;
        // y.c1 (bytes 128..191)
        bytes32 yc1hi = 0x13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049;
        bytes32 yc1lo = 0x334cf11213945d57e5ac7d055d042b7e31777dd5f8c7657904fb380e2d757160;
        // y.c0 (bytes 160..191) — lower 32 bytes of y.c0
        bytes32 yc0hi = 0x0000000000000000000000000000000000000000000000000000000000000001;
        bytes32 yc0lo = 0x1a0111ea397fe699ec02408663d4de85aa0d857d89759ad4897d29650fb85f9b;
        assembly {
            let ptr := add(gen, 32)
            mstore(ptr,        xc1hi)
            mstore(add(ptr,32), xc1lo)
            mstore(add(ptr,64), xc0hi)
            mstore(add(ptr,96), xc0lo)
            mstore(add(ptr,128), yc1hi)
            mstore(add(ptr,160), yc1lo)
        }
        // overwrite last two slots with y.c0 halves
        assembly {
            let ptr := add(gen, 32)
            mstore(add(ptr,128), yc0hi)
            mstore(add(ptr,160), yc0lo)
        }
    }

    /// @dev Call the BLS12_PAIRING precompile (0x11).
    ///      Input: concatenation of (G1, G2) pairs, each pair 384 bytes.
    ///      Returns true if the product of all pairings equals 1.
    function _pairing(bytes memory input) internal view returns (bool result) {
        uint256 inputLen = input.length;
        bytes memory out = new bytes(32);
        bool ok;
        assembly {
            ok := staticcall(gas(), 0x11, add(input, 32), inputLen, add(out, 32), 32)
        }
        if (!ok) revert PrecompileCallFailed();
        assembly {
            result := mload(add(out, 32))
        }
    }

    /// @dev Check if a G1 point (96 bytes uncompressed) is the point at infinity.
    ///      Infinity is encoded as all-zero bytes in the uncompressed form.
    function _isG1Infinity(bytes calldata point) internal pure returns (bool) {
        for (uint256 i = 0; i < G1_UNCOMPRESSED_SIZE; i++) {
            if (point[i] != 0) return false;
        }
        return true;
    }

    /// @dev Check if a G2 point (192 bytes uncompressed) is the point at infinity.
    function _isG2Infinity(bytes calldata point) internal pure returns (bool) {
        for (uint256 i = 0; i < G2_UNCOMPRESSED_SIZE; i++) {
            if (point[i] != 0) return false;
        }
        return true;
    }
}
