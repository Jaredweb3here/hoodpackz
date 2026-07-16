import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { TOKENIZED_STOCKS } from "@/lib/tokenized-stocks";

export const dynamic = "force-dynamic";

/**
 * Real on-chain activity feed. Reads StockPurchased and JackpotWon events
 * from the live StockPackz contract — every entry shown is a settled,
 * verifiable opening.
 */

const stockPurchased = parseAbiItem(
  "event StockPurchased(uint256 indexed openingId, address indexed user, address indexed stock, uint256 usdgIn, uint256 stockOut)"
);
const jackpotWon = parseAbiItem(
  "event JackpotWon(uint256 indexed openingId, address indexed winner, uint256 payout, uint256 retainedSeed)"
);

/** How far back to scan. Robinhood Chain blocks are sub-second; ~1 day. */
const LOOKBACK_BLOCKS = 400_000n;

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function tickerFor(stock: string): string {
  const token = Object.values(TOKENIZED_STOCKS).find(
    (t) => t.contractAddress.toLowerCase() === stock.toLowerCase()
  );
  return token ? token.ticker : shortAddr(stock);
}

// Tiny in-memory cache so polling clients don't hammer the RPC.
let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 4_000;

export async function GET(request: Request) {
  const core = process.env.NEXT_PUBLIC_STOCKPACKZ_ADDRESS as Hex | undefined;
  if (!core) return NextResponse.json({ events: [] });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.body);
  }

  const limit = Math.min(
    Number(new URL(request.url).searchParams.get("limit") ?? 8),
    25
  );

  try {
    const client = createPublicClient({
      chain: robinhoodChain,
      transport: http(robinhoodChain.rpcUrls.default.http[0]),
    });
    const latest = await client.getBlockNumber();
    const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;

    const [purchases, wins] = await Promise.all([
      client.getLogs({ address: core, event: stockPurchased, fromBlock, toBlock: latest }),
      client.getLogs({ address: core, event: jackpotWon, fromBlock, toBlock: latest }),
    ]);

    // Timestamp via block numbers — approximate ordering by log position.
    const events = [
      ...purchases.map((log) => ({
        id: `open-${log.args.openingId!.toString()}`,
        type: "pull" as const,
        user: shortAddr(log.args.user!),
        target: tickerFor(log.args.stock!),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      })),
      ...wins.map((log) => ({
        id: `jackpot-${log.args.openingId!.toString()}`,
        type: "jackpot" as const,
        user: shortAddr(log.args.winner!),
        target: "the Jackpot",
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      })),
    ]
      .sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? b.logIndex - a.logIndex
          : Number(b.blockNumber - a.blockNumber)
      )
      .slice(0, limit);

    // Resolve real timestamps for the (few) blocks involved.
    const blockNumbers = [...new Set(events.map((e) => e.blockNumber))];
    const blocks = await Promise.all(
      blockNumbers.map((bn) => client.getBlock({ blockNumber: bn }))
    );
    const tsByBlock = new Map(
      blocks.map((b) => [b.number, new Date(Number(b.timestamp) * 1000).toISOString()])
    );

    const body = {
      events: events.map(({ blockNumber, logIndex: _l, ...e }) => ({
        ...e,
        timestamp: tsByBlock.get(blockNumber) ?? new Date().toISOString(),
      })),
    };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch {
    // RPC hiccup: return the last good payload rather than an error.
    return NextResponse.json(cache?.body ?? { events: [] });
  }
}
