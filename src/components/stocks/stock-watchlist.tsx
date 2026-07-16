"use client";

import { motion } from "framer-motion";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeader } from "@/components/capsules/section-header";
import { StockLogo } from "@/components/capsules/stock-logo";
import { LIVE_TOKENIZED_STOCKS } from "@/lib/tokenized-stocks";
import { useLiveQuotes } from "@/lib/use-live-quotes";
import { formatCurrency } from "@/lib/utils";

export function StockWatchlist() {
  const quotes = useLiveQuotes();

  return (
    <section id="stocks" className="px-6 py-14 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          title="On the chain"
          description="Real tokenized equities with live Uniswap v4 prices. Every pack pulls from this set."
          className="mb-10"
        />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {LIVE_TOKENIZED_STOCKS.map((stock, index) => {
            const price = quotes.get(stock.ticker);

            return (
              <BlurFade key={stock.id} delay={Math.min(index * 0.03, 0.3)} inView>
                <motion.a
                  href={`https://robinhoodchain.blockscout.com/token/${stock.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ y: -3 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="block h-full rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StockLogo
                      ticker={stock.ticker}
                      logoUrl={stock.logoUrl}
                      color={stock.brandColor}
                      size="sm"
                    />
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#00c805]" />
                      live
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold tracking-tight text-white">
                    {stock.ticker}
                  </p>
                  <p className="truncate text-[11px] text-white/30">{stock.instrumentName}</p>
                  <div className="mt-2.5 flex items-baseline justify-between">
                    <p className="text-[15px] font-bold tabular-nums tracking-tight text-white">
                      {price != null ? formatCurrency(price) : "—"}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/25">
                      {price != null ? "v4 pool" : "no pool"}
                    </p>
                  </div>
                </motion.a>
              </BlurFade>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-white/25">
          Prices read directly from Uniswap v4 pools on Robinhood Chain. More stocks join as
          their on-chain liquidity reaches the required depth.
        </p>
      </div>
    </section>
  );
}
