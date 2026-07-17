// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Exact-backed operator collateral with delayed withdrawals.
contract OperatorBondVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant BEACON_ROLE = keccak256("BEACON_ROLE");

    struct Withdrawal {
        uint256 amount;
        uint64 availableAt;
    }

    IERC20 public immutable bondToken;
    uint64 public immutable withdrawalDelay;

    mapping(address => uint256) public bondOf;
    mapping(address => uint256) public lockedBondOf;
    mapping(address => Withdrawal) public withdrawals;

    event BondDeposited(address indexed operator, uint256 amount);
    event BondLocked(address indexed operator, uint256 amount);
    event BondUnlocked(address indexed operator, uint256 amount);
    event BondSlashed(address indexed operator, address indexed receiver, uint256 amount);
    event WithdrawalRequested(address indexed operator, uint256 amount, uint64 availableAt);
    event WithdrawalExecuted(address indexed operator, address indexed receiver, uint256 amount);

    error InvalidConfiguration();
    error InvalidAmount();
    error FeeOnTransferNotSupported();
    error InsufficientAvailableBond();
    error InsufficientLockedBond();
    error WithdrawalNotReady();

    constructor(IERC20 token, uint64 delay, address admin) {
        if (address(token) == address(0) || admin == address(0) || delay == 0) revert InvalidConfiguration();
        bondToken = token;
        withdrawalDelay = delay;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function availableBond(address operator) public view returns (uint256) {
        uint256 reserved = lockedBondOf[operator] + withdrawals[operator].amount;
        return bondOf[operator] > reserved ? bondOf[operator] - reserved : 0;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = bondToken.balanceOf(address(this));
        bondToken.safeTransferFrom(msg.sender, address(this), amount);
        if (bondToken.balanceOf(address(this)) - beforeBalance != amount) revert FeeOnTransferNotSupported();
        bondOf[msg.sender] += amount;
        emit BondDeposited(msg.sender, amount);
    }

    function requestWithdrawal(uint256 amount) external {
        if (amount == 0 || amount > bondOf[msg.sender]) revert InvalidAmount();
        uint64 availableAt = uint64(block.timestamp) + withdrawalDelay;
        withdrawals[msg.sender] = Withdrawal({amount: amount, availableAt: availableAt});
        emit WithdrawalRequested(msg.sender, amount, availableAt);
    }

    function executeWithdrawal(address receiver) external nonReentrant {
        Withdrawal memory pending = withdrawals[msg.sender];
        if (pending.amount == 0 || block.timestamp < pending.availableAt) revert WithdrawalNotReady();
        if (pending.amount + lockedBondOf[msg.sender] > bondOf[msg.sender]) revert InsufficientAvailableBond();
        delete withdrawals[msg.sender];
        bondOf[msg.sender] -= pending.amount;
        bondToken.safeTransfer(receiver, pending.amount);
        emit WithdrawalExecuted(msg.sender, receiver, pending.amount);
    }

    function lock(address operator, uint256 amount) external onlyRole(BEACON_ROLE) {
        if (amount > availableBond(operator)) revert InsufficientAvailableBond();
        lockedBondOf[operator] += amount;
        emit BondLocked(operator, amount);
    }

    function unlock(address operator, uint256 amount) external onlyRole(BEACON_ROLE) {
        if (amount > lockedBondOf[operator]) revert InsufficientLockedBond();
        lockedBondOf[operator] -= amount;
        emit BondUnlocked(operator, amount);
    }

    function slash(address operator, uint256 amount, address receiver) external onlyRole(BEACON_ROLE) nonReentrant {
        if (amount > lockedBondOf[operator]) revert InsufficientLockedBond();
        lockedBondOf[operator] -= amount;
        bondOf[operator] -= amount;
        Withdrawal storage pending = withdrawals[operator];
        if (pending.amount > bondOf[operator]) pending.amount = bondOf[operator];
        bondToken.safeTransfer(receiver, amount);
        emit BondSlashed(operator, receiver, amount);
    }
}
