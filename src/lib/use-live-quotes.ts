"use client";

import { useEffect, useState } from "react";

export interface LiveQuote {
  ticker: string;
  /** USD price from the deepest Uniswap v4 pool; null if not priced yet. */
  price: number | null;
}

let sharedCache: Map<string, number | null> | null = null;

/** Live on-chain prices for all tokenized stocks, refreshed every 60s. */
export function useLiveQuotes(): Map<string, number | null> {
  const [quotes, setQuotes] = useState<Map<string, number | null>>(
    () => sharedCache ?? new Map()
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/stocks");
        if (!res.ok) return;
        const data = (await res.json()) as { stocks: LiveQuote[] };
        const map = new Map(data.stocks.map((s) => [s.ticker, s.price]));
        sharedCache = map;
        if (!cancelled) setQuotes(map);
      } catch {
        /* keep previous quotes */
      }
    }

    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return quotes;
}
