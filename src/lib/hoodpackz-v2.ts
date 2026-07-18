import { formatUnits, keccak256, parseEventLogs } from "viem";
import {
  getAccount,
  getBlockNumber,
  getBytecode,
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { robinhoodChain, wagmiConfig } from "./chain";
import { erc20Abi, USDG_ADDRESS } from "./onchain";

const configuredAddress = process.env.NEXT_PUBLIC_HOODPACKZ_V2_ADDRESS?.trim();
const configuredCodeHash = process.env.NEXT_PUBLIC_HOODPACKZ_V2_CODEHASH?.trim();
const configuredConfigHash = process.env.NEXT_PUBLIC_HOODPACKZ_V2_CONFIG_HASH?.trim();

export const HOODPACKZ_V2_ADDRESS =
  configuredAddress && /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
    ? (configuredAddress as `0x${string}`)
    : undefined;

export const HOODPACKZ_V2_CODEHASH =
  configuredCodeHash && /^0x[0-9a-fA-F]{64}$/.test(configuredCodeHash)
    ? (configuredCodeHash.toLowerCase() as `0x${string}`)
    : undefined;

export const HOODPACKZ_V2_CONFIG_HASH =
  configuredConfigHash && /^0x[0-9a-fA-F]{64}$/.test(configuredConfigHash)
    ? (configuredConfigHash.toLowerCase() as `0x${string}`)
    : undefined;

export const HOODPACKZ_PACK_SALES_LIVE =
  Boolean(HOODPACKZ_V2_ADDRESS && HOODPACKZ_V2_CODEHASH && HOODPACKZ_V2_CONFIG_HASH) &&
  process.env.NEXT_PUBLIC_HOODPACKZ_PACK_SALES_LIVE?.trim() === "true";

export const HOODPACKZ_V2_RECOVERY_AVAILABLE = Boolean(
  HOODPACKZ_V2_ADDRESS && HOODPACKZ_V2_CODEHASH && HOODPACKZ_V2_CONFIG_HASH,
);

const openingComponents = [
  { name: "user", type: "address" },
  { name: "requestId", type: "uint256" },
  { name: "roundId", type: "uint256" },
  { name: "price", type: "uint256" },
  { name: "jackpotStake", type: "uint256" },
  { name: "jackpotPayout", type: "uint256" },
  { name: "prizes", type: "address[3]" },
  { name: "amounts", type: "uint256[3]" },
  { name: "tier", type: "uint8" },
  { name: "status", type: "uint8" },
  { name: "claimedPrizes", type: "uint8" },
  { name: "jackpotWinner", type: "bool" },
  { name: "jackpotClaimed", type: "bool" },
] as const;

export const hoodPackzV2Abi = [
  {
    type: "function",
    name: "usdg",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "deploymentConfigHash",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "openingsPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "packPrice",
    stateMutability: "pure",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getOpening",
    stateMutability: "view",
    inputs: [{ name: "openingId", type: "uint256" }],
    outputs: [{ type: "tuple", components: openingComponents }],
  },
  {
    type: "function",
    name: "beacon",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "openPack",
    stateMutability: "nonpayable",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [{ name: "openingId", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimPrize",
    stateMutability: "nonpayable",
    inputs: [
      { name: "openingId", type: "uint256" },
      { name: "prizeIndex", type: "uint8" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimJackpot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "openingId", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundCancelledOpening",
    stateMutability: "nonpayable",
    inputs: [{ name: "openingId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "OpeningRequested",
    inputs: [
      { name: "openingId", type: "uint256", indexed: true },
      { name: "requestId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "tier", type: "uint8", indexed: false },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
] as const;

const beaconAbi = [
  {
    type: "function",
    name: "roundStatus",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "targetBlock",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fulfill",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [],
  },
] as const;

export type OpeningSubmission = {
  openingId: bigint;
  requestId: bigint;
  hash: `0x${string}`;
};

export type HoodPackzOpening = {
  openingId: bigint;
  user: `0x${string}`;
  requestId: bigint;
  roundId: bigint;
  price: bigint;
  jackpotPayout: bigint;
  prizes: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
  amounts: readonly [bigint, bigint, bigint];
  status: number;
  claimedPrizes: number;
  jackpotWinner: boolean;
  jackpotClaimed: boolean;
  roundStatus: number;
  targetBlock: bigint;
  canFinalize: boolean;
  canCancel: boolean;
};

function requireConfiguredCore(): `0x${string}` {
  if (!HOODPACKZ_V2_ADDRESS || !HOODPACKZ_V2_RECOVERY_AVAILABLE) {
    throw new Error("Pack contract is not configured.");
  }
  return HOODPACKZ_V2_ADDRESS;
}

function requireLiveCore(): `0x${string}` {
  if (!HOODPACKZ_PACK_SALES_LIVE) throw new Error("Pack opening is not live yet.");
  return requireConfiguredCore();
}

function assertWalletContext(account: `0x${string}`): void {
  const connected = getAccount(wagmiConfig);
  if (
    connected.address?.toLowerCase() !== account.toLowerCase() ||
    connected.chainId !== robinhoodChain.id
  ) {
    throw new Error("Wallet account or network changed. Reconnect and try again.");
  }
}

async function attestDeployment(core: `0x${string}`, requireUnpaused: boolean): Promise<void> {
  const expectedCodeHash = HOODPACKZ_V2_CODEHASH;
  const expectedConfigHash = HOODPACKZ_V2_CONFIG_HASH;
  if (!expectedCodeHash || !expectedConfigHash) throw new Error("Pack opening is not live yet.");

  const bytecode = await getBytecode(wagmiConfig, { address: core, chainId: robinhoodChain.id });
  if (!bytecode || keccak256(bytecode).toLowerCase() !== expectedCodeHash) {
    throw new Error("Pack contract verification failed. No transaction was submitted.");
  }

  const [paymentToken, configHash, paused] = await Promise.all([
    readContract(wagmiConfig, {
      address: core,
      abi: hoodPackzV2Abi,
      functionName: "usdg",
      chainId: robinhoodChain.id,
    }),
    readContract(wagmiConfig, {
      address: core,
      abi: hoodPackzV2Abi,
      functionName: "deploymentConfigHash",
      chainId: robinhoodChain.id,
    }),
    readContract(wagmiConfig, {
      address: core,
      abi: hoodPackzV2Abi,
      functionName: "openingsPaused",
      chainId: robinhoodChain.id,
    }),
  ]);
  if (
    paymentToken.toLowerCase() !== USDG_ADDRESS.toLowerCase() ||
    configHash.toLowerCase() !== expectedConfigHash ||
    (requireUnpaused && paused)
  ) {
    throw new Error("Pack contract configuration does not match this sale. No transaction was submitted.");
  }
}

async function prepareCoreTransaction(account: `0x${string}`): Promise<`0x${string}`> {
  const core = requireConfiguredCore();
  assertWalletContext(account);
  await attestDeployment(core, false);
  assertWalletContext(account);
  return core;
}

async function confirmCoreTransaction(hash: `0x${string}`): Promise<`0x${string}`> {
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: robinhoodChain.id });
  if (receipt.status !== "success") throw new Error("Transaction reverted.");
  return hash;
}

export async function submitHoodPackzOpening(
  tier: number,
  price: number,
  account: `0x${string}`,
  onApprovalRequired?: () => void,
): Promise<OpeningSubmission> {
  const core = requireLiveCore();
  const payment = BigInt(price) * 1_000_000n;
  assertWalletContext(account);
  await attestDeployment(core, true);
  const onchainPrice = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "packPrice",
    args: [tier],
    chainId: robinhoodChain.id,
  });
  if (onchainPrice !== payment) {
    throw new Error("Pack price changed. No approval was submitted.");
  }

  const balance = await readContract(wagmiConfig, {
    address: USDG_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
    chainId: robinhoodChain.id,
  });
  if (balance < payment) {
    throw new Error(`You need ${price} USDG on Robinhood Chain to open this pack.`);
  }

  const allowance = await readContract(wagmiConfig, {
    address: USDG_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, core],
    chainId: robinhoodChain.id,
  });
  if (allowance !== payment) {
    onApprovalRequired?.();
    if (allowance !== 0n) {
      assertWalletContext(account);
      const resetHash = await writeContract(wagmiConfig, {
        address: USDG_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [core, 0n],
        account,
        chainId: robinhoodChain.id,
      });
      const resetReceipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: resetHash,
        chainId: robinhoodChain.id,
      });
      if (resetReceipt.status !== "success") throw new Error("USDG approval reset reverted.");
    }
    assertWalletContext(account);
    const approvalHash = await writeContract(wagmiConfig, {
      address: USDG_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [core, payment],
      account,
      chainId: robinhoodChain.id,
    });
    const approvalReceipt = await waitForTransactionReceipt(wagmiConfig, {
      hash: approvalHash,
      chainId: robinhoodChain.id,
    });
    if (approvalReceipt.status !== "success") throw new Error("USDG approval reverted.");
  }

  assertWalletContext(account);
  await attestDeployment(core, true);
  const hash = await writeContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "openPack",
    args: [tier],
    account,
    chainId: robinhoodChain.id,
  });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: robinhoodChain.id });
  if (receipt.status !== "success") throw new Error("Pack opening reverted.");
  const coreLogs = receipt.logs.filter((log) => log.address.toLowerCase() === core.toLowerCase());
  const event = parseEventLogs({
    abi: hoodPackzV2Abi,
    eventName: "OpeningRequested",
    logs: coreLogs,
  })[0];
  if (!event || event.args.user.toLowerCase() !== account.toLowerCase()) {
    throw new Error("Opening transaction confirmed without a valid opening id.");
  }

  return {
    openingId: event.args.openingId,
    requestId: event.args.requestId,
    hash,
  };
}

export async function readHoodPackzOpening(
  openingId: bigint,
  account: `0x${string}`,
): Promise<HoodPackzOpening> {
  const core = requireConfiguredCore();
  await attestDeployment(core, false);
  const opening = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "getOpening",
    args: [openingId],
    chainId: robinhoodChain.id,
  });
  if (opening.user.toLowerCase() !== account.toLowerCase()) {
    throw new Error("This opening belongs to another wallet.");
  }
  const beacon = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "beacon",
    chainId: robinhoodChain.id,
  });
  const roundStatus = await readContract(wagmiConfig, {
    address: beacon,
    abi: beaconAbi,
    functionName: "roundStatus",
    args: [opening.roundId],
    chainId: robinhoodChain.id,
  });
  let targetBlock = 0n;
  try {
    targetBlock = await readContract(wagmiConfig, {
      address: beacon,
      abi: beaconAbi,
      functionName: "targetBlock",
      args: [opening.requestId],
      chainId: robinhoodChain.id,
    });
  } catch {
    // Legacy threshold openings remain readable and refundable while the MVP coordinator rolls out.
  }
  const currentBlock = targetBlock > 0n ? await getBlockNumber(wagmiConfig, { chainId: robinhoodChain.id }) : 0n;
  return {
    openingId,
    user: opening.user,
    requestId: opening.requestId,
    roundId: opening.roundId,
    price: opening.price,
    jackpotPayout: opening.jackpotPayout,
    prizes: opening.prizes,
    amounts: opening.amounts,
    status: opening.status,
    claimedPrizes: opening.claimedPrizes,
    jackpotWinner: opening.jackpotWinner,
    jackpotClaimed: opening.jackpotClaimed,
    roundStatus,
    targetBlock,
    canFinalize: roundStatus === 1 && targetBlock > 0n && currentBlock > targetBlock,
    canCancel: roundStatus === 1 && targetBlock > 0n && currentBlock > targetBlock + 256n,
  };
}

export async function finalizeHoodPackzOpening(
  openingId: bigint,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const core = await prepareCoreTransaction(account);
  const opening = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "getOpening",
    args: [openingId],
    chainId: robinhoodChain.id,
  });
  const coordinator = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "beacon",
    chainId: robinhoodChain.id,
  });
  const hash = await writeContract(wagmiConfig, {
    address: coordinator,
    abi: beaconAbi,
    functionName: "fulfill",
    args: [opening.requestId],
    account,
    chainId: robinhoodChain.id,
  });
  return confirmCoreTransaction(hash);
}

export async function cancelExpiredHoodPackzOpening(
  openingId: bigint,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const core = await prepareCoreTransaction(account);
  const opening = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "getOpening",
    args: [openingId],
    chainId: robinhoodChain.id,
  });
  const coordinator = await readContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "beacon",
    chainId: robinhoodChain.id,
  });
  assertWalletContext(account);
  const cancelHash = await writeContract(wagmiConfig, {
    address: coordinator,
    abi: beaconAbi,
    functionName: "cancelExpired",
    args: [opening.requestId],
    account,
    chainId: robinhoodChain.id,
  });
  await confirmCoreTransaction(cancelHash);
  assertWalletContext(account);
  return refundHoodPackzOpening(openingId, account);
}

export function formatOpeningAmount(amount: bigint, decimals: number): string {
  const value = formatUnits(amount, decimals);
  const [whole, fraction = ""] = value.split(".");
  return fraction ? `${whole}.${fraction.slice(0, 6).replace(/0+$/, "")}`.replace(/\.$/, "") : whole;
}

export async function claimHoodPackzPrize(
  openingId: bigint,
  prizeIndex: number,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const core = await prepareCoreTransaction(account);
  const hash = await writeContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "claimPrize",
    args: [openingId, prizeIndex, account],
    account,
    chainId: robinhoodChain.id,
  });
  return confirmCoreTransaction(hash);
}

export async function claimHoodPackzJackpot(
  openingId: bigint,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const core = await prepareCoreTransaction(account);
  const hash = await writeContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "claimJackpot",
    args: [openingId, account],
    account,
    chainId: robinhoodChain.id,
  });
  return confirmCoreTransaction(hash);
}

export async function refundHoodPackzOpening(
  openingId: bigint,
  account: `0x${string}`,
): Promise<`0x${string}`> {
  const core = await prepareCoreTransaction(account);
  const hash = await writeContract(wagmiConfig, {
    address: core,
    abi: hoodPackzV2Abi,
    functionName: "refundCancelledOpening",
    args: [openingId],
    account,
    chainId: robinhoodChain.id,
  });
  return confirmCoreTransaction(hash);
}
