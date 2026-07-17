// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IThresholdSignatureVerifier} from "../interfaces/IThresholdSignatureVerifier.sol";

/// @notice Immutable history of threshold-key epochs and their seven operators.
contract BeaconOperatorRegistry is AccessControl {
    uint8 public constant OPERATOR_COUNT = 7;
    uint8 public constant THRESHOLD = 4;

    struct Epoch {
        bytes masterPublicKey;
        address[OPERATOR_COUNT] operators;
        bytes[OPERATOR_COUNT] publicKeyShares;
        bool exists;
    }

    uint256 public currentEpoch;
    IThresholdSignatureVerifier public immutable verifier;
    mapping(uint256 => Epoch) private _epochs;
    mapping(uint256 => mapping(address => uint8)) private _operatorIndexPlusOne;

    event EpochConfigured(uint256 indexed epoch, bytes32 indexed keyHash);

    error InvalidAdmin();
    error InvalidEpochConfiguration();
    error UnknownEpoch();
    error UnknownOperator();

    constructor(IThresholdSignatureVerifier signatureVerifier, address admin) {
        if (address(signatureVerifier) == address(0) || admin == address(0)) revert InvalidAdmin();
        verifier = signatureVerifier;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function configureEpoch(bytes calldata masterKey, address[] calldata operators, bytes[] calldata publicKeyShares)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 epoch)
    {
        if (masterKey.length == 0 || operators.length != OPERATOR_COUNT || publicKeyShares.length != OPERATOR_COUNT) {
            revert InvalidEpochConfiguration();
        }
        if (!verifier.validateKeySet(masterKey, publicKeyShares)) revert InvalidEpochConfiguration();

        epoch = ++currentEpoch;
        Epoch storage stored = _epochs[epoch];
        stored.masterPublicKey = masterKey;
        stored.exists = true;

        for (uint8 i = 0; i < OPERATOR_COUNT; i++) {
            address operator = operators[i];
            if (operator == address(0) || publicKeyShares[i].length == 0 || _operatorIndexPlusOne[epoch][operator] != 0)
            {
                revert InvalidEpochConfiguration();
            }
            stored.operators[i] = operator;
            stored.publicKeyShares[i] = publicKeyShares[i];
            _operatorIndexPlusOne[epoch][operator] = i + 1;
        }

        emit EpochConfigured(epoch, keccak256(masterKey));
    }

    function masterPublicKey(uint256 epoch) external view returns (bytes memory) {
        _requireEpoch(epoch);
        return _epochs[epoch].masterPublicKey;
    }

    function operatorAt(uint256 epoch, uint8 index) public view returns (address) {
        _requireEpoch(epoch);
        if (index >= OPERATOR_COUNT) revert UnknownOperator();
        return _epochs[epoch].operators[index];
    }

    function publicKeyShare(uint256 epoch, uint8 index) external view returns (bytes memory) {
        _requireEpoch(epoch);
        if (index >= OPERATOR_COUNT) revert UnknownOperator();
        return _epochs[epoch].publicKeyShares[index];
    }

    function operatorIndex(uint256 epoch, address operator) external view returns (uint8 index) {
        uint8 indexPlusOne = _operatorIndexPlusOne[epoch][operator];
        if (indexPlusOne == 0) revert UnknownOperator();
        return indexPlusOne - 1;
    }

    function isOperator(uint256 epoch, address operator) external view returns (bool) {
        return _operatorIndexPlusOne[epoch][operator] != 0;
    }

    function _requireEpoch(uint256 epoch) internal view {
        if (!_epochs[epoch].exists) revert UnknownEpoch();
    }
}
