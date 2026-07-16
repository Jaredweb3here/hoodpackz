"use client";

import { Marquee } from "@/components/ui/marquee";
import { StockTickerItem } from "./stock-ticker-item";
import { LIVE_TOKENIZED_STOCKS } from "@/lib/tokenized-stocks";
import { useLiveQuotes } from "@/lib/use-live-quotes";

export function StockTickerStrip() {
  const quotes = useLiveQuotes();

  return (
    <div className="relative py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#050505] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#050505] to-transparent" />
      <Marquee pauseOnHover className="[--duration:40s] [--gap:0.75rem]">
        {LIVE_TOKENIZED_STOCKS.map((stock) => (
          <StockTickerItem key={stock.ticker} stock={stock} price={quotes.get(stock.ticker)} />
        ))}
      </Marquee>
      <Marquee reverse pauseOnHover className="mt-2 [--duration:48s] [--gap:0.75rem]">
        {[...LIVE_TOKENIZED_STOCKS].reverse().map((stock) => (
          <StockTickerItem
            key={`r-${stock.ticker}`}
            stock={stock}
            price={quotes.get(stock.ticker)}
          />
        ))}
      </Marquee>
    </div>
  );
}
