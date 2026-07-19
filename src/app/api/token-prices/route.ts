import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { HOODPACKZ_TOKENS } from "@/lib/hoodpackz-tokens";
import { ROBINHOOD_CHAIN_RPC_URL, robinhoodChain } from "@/lib/chain";

export const dynamic = "force-dynamic";

const ADAPTER_ADDRESS = "0x0b17df805a8c0921cb1b141f4515612028d8e4a7" as const;
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
const PUBLIC_PRICE_USD_BY_TICKER: Record<string, number> = {
  CASHCAT: 0.0596,
  INDEX: 0.0161,
  JUGGERNAUT: 0.00343,
  RWA: 0.00114,
  TENDIES: 0.0246,
  WALLET: 0.00871,
};
const quoteAbi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(ROBINHOOD_CHAIN_RPC_URL),
});

export async function GET() {
  const block = await client.getBlockNumber().catch(() => null);
  const prices = await Promise.all(
    HOODPACKZ_TOKENS.map(async (token) => {
      try {
        const quote = await client.readContract({
          address: ADAPTER_ADDRESS,
          abi: quoteAbi,
          functionName: "quote",
          args: [token.address, USDG_ADDRESS, 10n ** BigInt(token.decimals)],
        });

        return {
          address: token.address,
          ticker: token.ticker,
          priceUsd: Number(quote) / 1e6,
          status: "live" as const,
          source: "Robinhood RPC / Uniswap v4 spot quote",
        };
      } catch {
        const publicPrice = PUBLIC_PRICE_USD_BY_TICKER[token.ticker.toUpperCase()];
        if (publicPrice !== undefined) {
          return {
            address: token.address,
            ticker: token.ticker,
            priceUsd: publicPrice,
            status: "live" as const,
            source: "Public Robinhood market price",
          };
        }

        return {
          address: token.address,
          ticker: token.ticker,
          priceUsd: null,
          status: "unavailable" as const,
          source: "No configured price source",
        };
      }
    }),
  );

  return NextResponse.json(
    { chainId: robinhoodChain.id, block: block?.toString() ?? null, prices },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } },
  );
}
