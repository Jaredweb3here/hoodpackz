"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw, X } from "lucide-react";
import { HOODPACKZ_TOKENS, PUBLIC_TOKEN_PRICE_USD_BY_TICKER } from "@/lib/hoodpackz-tokens";
import { useLiveTokenPrices } from "@/lib/use-live-token-prices";

type DemoPhase = "sealed" | "tearing" | "shuffling" | "revealing" | "result";
const DEMO_VALUE_MULTIPLIER = 1.4;
const DEMO_PULL_WEIGHTS = [0.31, 0.42, 0.27] as const;

function formatDemoUsd(value: number | null) {
  return value == null
    ? "NO LIVE QUOTE"
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDemoAmount(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function roundDemoAmount(value: number) {
  if (value >= 5000) return Math.max(100, Math.round(value / 100) * 100);
  if (value >= 500) return Math.max(10, Math.round(value / 10) * 10);
  return Math.max(1, Math.round(value));
}

function CountUpValue({ value, active }: { value: number | null; active: boolean }) {
  const [displayValue, setDisplayValue] = useState<number | null>(0);

  useEffect(() => {
    if (!active || value == null) return;

    const duration = 1250;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value]);

  return <>{formatDemoUsd(!active ? 0 : value == null ? null : displayValue)}</>;
}

interface DemoPackOpeningProps {
  open: boolean;
  pack: {
    name: string;
    label: string;
    image: string;
    price: number;
  };
  onClose: () => void;
}

function drawDemoTokens() {
  const pool = [...HOODPACKZ_TOKENS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const target = random[0] % (index + 1);
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, 3);
}

export function DemoPackOpening({ open, pack, onClose }: DemoPackOpeningProps) {
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<DemoPhase>("sealed");
  const [revealed, setRevealed] = useState(0);
  const [run, setRun] = useState(0);
  const [tokens, setTokens] = useState(() => HOODPACKZ_TOKENS.slice(0, 3));
  const [decision, setDecision] = useState<"keep" | "sell" | null>(null);
  const livePrices = useLiveTokenPrices();
  const targetTotal = pack.price * DEMO_VALUE_MULTIPLIER;
  const pulls = tokens.map((token, index) => {
    const unitPrice = livePrices.get(token.address.toLowerCase())?.priceUsd
      ?? PUBLIC_TOKEN_PRICE_USD_BY_TICKER[token.ticker.toUpperCase()]
      ?? null;
    const amount = unitPrice == null ? null : roundDemoAmount((targetTotal * DEMO_PULL_WEIGHTS[index]) / unitPrice);
    return {
      amount,
      unitPrice,
      value: amount == null || unitPrice == null ? null : amount * unitPrice,
    };
  });
  const pullValues = pulls.map((pull) => pull.value).filter((value): value is number => value != null);
  const totalValue = pullValues.length === pulls.length ? pullValues.reduce((sum, value) => sum + value, 0) : null;
  const legendaryIndex = pullValues.length ? pulls.findIndex((pull) => pull.value === Math.max(...pullValues)) : 0;

  useEffect(() => {
    if (!open) return;

    const nextTokens = drawDemoTokens();
    const resetTimer = window.setTimeout(() => {
      setTokens(nextTokens);
      setDecision(null);
      setRevealed(prefersReducedMotion ? 3 : 0);
      setPhase(prefersReducedMotion ? "result" : "sealed");
    }, 0);

    if (prefersReducedMotion) return () => window.clearTimeout(resetTimer);

    const timers = [
      window.setTimeout(() => setPhase("tearing"), 850),
      window.setTimeout(() => setPhase("shuffling"), 2300),
      window.setTimeout(() => {
        setPhase("revealing");
        setRevealed(1);
      }, 4700),
      window.setTimeout(() => setRevealed(2), 5750),
      window.setTimeout(() => setRevealed(3), 6800),
      window.setTimeout(() => setPhase("result"), 8050),
    ];

    return () => {
      window.clearTimeout(resetTimer);
      timers.forEach(window.clearTimeout);
    };
  }, [open, run, pack.name, prefersReducedMotion]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hp-demo-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className={`hp-demo-modal phase-${phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-opening-title"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 16 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="hp-demo-head">
              <div>
                <span>PACK REVEAL / NO WALLET</span>
                <strong id="demo-opening-title">{pack.name.toUpperCase()} PACK</strong>
              </div>
              <button type="button" onClick={onClose} aria-label="Close preview opening">
                <X size={18} />
              </button>
            </header>

            <div className="hp-demo-stage">
              <div className="hp-demo-grid" aria-hidden="true" />
              <div className="hp-demo-phase-label" aria-live="polite">
                <span>0{["sealed", "tearing", "shuffling", "revealing", "result"].indexOf(phase) + 1}</span>
                {phase === "sealed" && "PACK SEALED"}
                {phase === "tearing" && "CRACKING SEAL"}
                {phase === "shuffling" && "DEALING THE PULLS"}
                {phase === "revealing" && `REVEALING ${revealed} / 3`}
                {phase === "result" && "CHOOSE KEEP OR SELL"}
              </div>

              <AnimatePresence mode="wait">
                {(phase === "sealed" || phase === "tearing") && (
                  <motion.div
                    key="pack"
                    className="hp-demo-pack"
                    initial={{ opacity: 0, scale: 0.84, rotate: -4 }}
                    animate={
                      phase === "tearing"
                        ? {
                            opacity: 1,
                            scale: [1, 1.1, 1.04, 1.13],
                            rotate: [0, -2.6, 2.2, -1.4, 1, 0],
                            x: [0, -8, 9, -6, 5, 0],
                            filter: ["brightness(1)", "brightness(1.18)", "brightness(1.05)", "brightness(1.25)"],
                          }
                        : { opacity: 1, scale: 1, rotate: 0, y: [0, -8, 0] }
                    }
                    exit={{ opacity: 0, scale: 1.12, filter: "blur(14px)" }}
                    transition={
                      phase === "tearing"
                        ? { duration: 0.62, repeat: 1, ease: "easeInOut" }
                        : { opacity: { duration: 0.5 }, scale: { duration: 0.7 }, y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }
                    }
                  >
                    <Image src={pack.image} alt={`${pack.name} pack`} fill sizes="(max-width: 600px) 58vw, 300px" priority />
                    {phase === "tearing" && (
                      <>
                        <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.62 }} />
                        <motion.em initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: [0, 1, 0.2] }} transition={{ duration: 0.85, delay: 0.25 }} />
                      </>
                    )}
                  </motion.div>
                )}

                {(phase === "shuffling" || phase === "revealing" || phase === "result") && (
                  <motion.div
                    key="cards"
                    className="hp-demo-cards"
                    initial={{ opacity: 0, scale: 0.86, y: 46 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {tokens.map((token, index) => {
                      const isRevealed = phase === "result" || (phase === "revealing" && revealed > index);
                      const pull = pulls[index];
                      const legendary = index === legendaryIndex;
                      return (
                        <motion.article
                          key={`${run}-${token.address}`}
                          className={`${isRevealed ? "revealed" : ""} ${legendary ? "legendary" : ""}`}
                          initial={{ x: 0, y: 42, opacity: 0, rotate: 0, scale: 0.82 }}
                          animate={
                            phase === "shuffling"
                              ? {
                                  x: (index - 1) * 235,
                                  y: [28, -34, 10, 0],
                                  opacity: 1,
                                  rotate: [(index - 1) * -10, (index - 1) * 8, (index - 1) * 4],
                                  scale: [0.82, 1.08, 1],
                                }
                              : {
                                  x: 0,
                                  y: isRevealed ? [0, -18, 0] : 0,
                                  opacity: 1,
                                  rotate: 0,
                                  scale: isRevealed ? [1, 1.08, 1] : 1,
                                }
                          }
                          transition={
                            phase === "shuffling"
                              ? { duration: 1.65, delay: index * 0.2, ease: [0.16, 1, 0.3, 1] }
                              : { duration: 0.85, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }
                          }
                        >
                          <div className="hp-demo-card-back">
                            <span>PXZ</span>
                            <small>SEALED SLOT 0{index + 1}</small>
                          </div>
                          <div className="hp-demo-card-front" style={{ "--token-accent": token.color } as CSSProperties}>
                            <span className="hp-demo-card-number">0{index + 1} / 03</span>
                            {legendary && <span className="hp-demo-rarity">LEGENDARY / PSA 10</span>}
                            <span className="hp-demo-slab">
                              <strong>PSA</strong>
                              <small>PAXZ CERTIFIED<br />ONCHAIN PULL</small>
                            </span>
                            <Image src={token.logo} alt="" width={112} height={112} />
                            <div>
                              <small>{pack.label} PULL</small>
                              <strong>{token.ticker}</strong>
                              <p>{token.name}</p>
                              <small className="hp-demo-pull-math">
                                {pull.amount == null || pull.unitPrice == null
                                  ? "VALUE LOADING"
                                  : `${formatDemoAmount(pull.amount)} ${token.ticker.toUpperCase()} x ${formatDemoUsd(pull.unitPrice)}`}
                              </small>
                              <b><CountUpValue value={pull.value} active={isRevealed} /></b>
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {phase === "tearing" && (
                <div className="hp-demo-sparks" aria-hidden="true">
                  {Array.from({ length: 24 }, (_, index) => (
                    <motion.i
                      key={index}
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], x: Math.cos(index) * (90 + index * 7), y: Math.sin(index) * (75 + index * 5), scale: [0, 1, 0] }}
                      transition={{ duration: 0.75, delay: (index % 4) * 0.04 }}
                    />
                  ))}
                </div>
              )}
            </div>

            <footer className="hp-demo-footer">
              <p>{phase === "result" ? "Preview only. No funds moved and no onchain opening was created." : "Three cards slide out, reveal one by one, then the pack gets a total value."}</p>
              {phase === "result" && (
                <div className="hp-demo-result-bar" aria-label="Preview result actions">
                  <span>Pack value <strong><CountUpValue value={totalValue} active /></strong></span>
                  <button type="button" className={decision === "keep" ? "selected" : ""} onClick={() => setDecision("keep")}>
                    {decision === "keep" ? "KEEPING PACK" : "KEEP / CLAIM TOKENS"}
                  </button>
                  <button type="button" className={decision === "sell" ? "selected" : ""} onClick={() => setDecision("sell")}>
                    {decision === "sell" ? "SELL REQUEST STAGED" : "SELL PACK BACK"}
                  </button>
                </div>
              )}
              {phase === "result" && (
                <button type="button" onClick={() => setRun((current) => current + 1)}>
                  <RotateCcw size={15} /> PREVIEW ANOTHER PACK
                </button>
              )}
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
