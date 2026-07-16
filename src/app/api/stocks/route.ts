import { NextResponse } from "next/server";
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  zeroAddress,
} from "viem";
import { robinhoodChain } from "@/lib/chain";
import { LIVE_TOKENIZED_STOCKS } from "@/lib/tokenized-stocks";

export const dynamic = "force-dynamic";

/**
 * Live stock prices read directly from Uniswap v4 pools on Robinhood Chain.
 * For each token we scan the standard fee tiers, pick the deepest pool, and
 * derive USD price from its sqrtPriceX96. No mock data.
 */

const STATE_VIEW = "0xF3334192D15450CdD385c8b70E03f9A6bD9E673b" as const;
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const stateViewAbi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
  {
    type: "function",
    name: "getLiquidity",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint128" }],
  },
] as const;

const FEE_TIERS: { fee: number; tickSpacing: number }[] = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
];

function poolId(c0: string, c1: string, fee: number, tickSpacing: number) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [c0 as `0x${string}`, c1 as `0x${string}`, fee, tickSpacing, zeroAddress]
    )
  );
}

/** USD price per whole token from sqrtPriceX96 (USDG 6dp, stock 18dp). */
function priceFromSqrt(sqrtPriceX96: bigint, usdgIsCurrency0: boolean): number {
  const p = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // amount1 per amount0, raw units
  if (p === 0) return 0;
  // usdg c0: p = tokenWei per usdgRaw -> usd/token = 1e12 / p
  // usdg c1: p = usdgRaw per tokenWei -> usd/token = p * 1e12
  return usdgIsCurrency0 ? 1e12 / p : p * 1e12;
}

let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 30_000;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.body);
  }

  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(robinhoodChain.rpcUrls.default.http[0]),
  });

  const stocks = await Promise.all(
    LIVE_TOKENIZED_STOCKS.map(async (stock) => {
      const token = stock.contractAddress.toLowerCase();
      const usdgIsCurrency0 = USDG < token;
      const [c0, c1] = usdgIsCurrency0 ? [USDG, token] : [token, USDG];

      let best: { liquidity: bigint; price: number } | null = null;
      await Promise.all(
        FEE_TIERS.map(async ({ fee, tickSpacing }) => {
          try {
            const id = poolId(c0, c1, fee, tickSpacing);
            const [liquidity, slot0] = await Promise.all([
              client.readContract({
                address: STATE_VIEW,
                abi: stateViewAbi,
                functionName: "getLiquidity",
                args: [id],
              }),
              client.readContract({
                address: STATE_VIEW,
                abi: stateViewAbi,
                functionName: "getSlot0",
                args: [id],
              }),
            ]);
            if (liquidity === 0n || slot0[0] === 0n) return;
            if (!best || liquidity > best.liquidity) {
              best = { liquidity, price: priceFromSqrt(slot0[0], usdgIsCurrency0) };
            }
          } catch {
            /* tier missing */
          }
        })
      );

      const resolved = best as { liquidity: bigint; price: number } | null;
      return {
        id: stock.id,
        ticker: stock.ticker,
        name: stock.instrumentName,
        contractAddress: stock.contractAddress,
        sector: stock.sector,
        rarity: stock.rarity,
        /** Live on-chain pool price; null when no priced pool exists. */
        price: resolved && resolved.price > 0 ? resolved.price : null,
        source: resolved ? "uniswap-v4" : "none",
      };
    })
  );

  const body = { stocks, count: stocks.length, updatedAt: new Date().toISOString() };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
