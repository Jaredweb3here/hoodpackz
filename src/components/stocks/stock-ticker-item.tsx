"use client";

import { StockLogo } from "@/components/capsules/stock-logo";
import type { TokenizedStock } from "@/lib/tokenized-stocks";
import { formatCurrency, cn } from "@/lib/utils";

interface StockTickerItemProps {
  stock: TokenizedStock;
  /** Live on-chain pool price; undefined/null renders a live-dot only. */
  price?: number | null;
  className?: string;
}

export function StockTickerItem({ stock, price, className }: StockTickerItemProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-full bg-white/[0.05] px-4 py-2.5 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]",
        className
      )}
    >
      <StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} color={stock.brandColor} size="xs" />
      <span className="text-sm font-semibold text-white">{stock.ticker}</span>
      {price != null ? (
        <span className="text-sm tabular-nums text-white/55">{formatCurrency(price)}</span>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-white/35">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00c805]" />
          on-chain
        </span>
      )}
    </div>
  );
}
