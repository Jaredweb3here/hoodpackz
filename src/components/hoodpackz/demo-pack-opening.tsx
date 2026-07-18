"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw, X } from "lucide-react";
import { HOODPACKZ_TOKENS } from "@/lib/hoodpackz-tokens";

type DemoPhase = "sealed" | "tearing" | "shuffling" | "revealing" | "result";

interface DemoPackOpeningProps {
  open: boolean;
  pack: {
    name: string;
    label: string;
    image: string;
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

  useEffect(() => {
    if (!open) return;

    const nextTokens = drawDemoTokens();
    const resetTimer = window.setTimeout(() => {
      setTokens(nextTokens);
      setRevealed(prefersReducedMotion ? 3 : 0);
      setPhase(prefersReducedMotion ? "result" : "sealed");
    }, 0);

    if (prefersReducedMotion) return () => window.clearTimeout(resetTimer);

    const timers = [
      window.setTimeout(() => setPhase("tearing"), 1050),
      window.setTimeout(() => setPhase("shuffling"), 1950),
      window.setTimeout(() => {
        setPhase("revealing");
        setRevealed(1);
      }, 3150),
      window.setTimeout(() => setRevealed(2), 3780),
      window.setTimeout(() => setRevealed(3), 4410),
      window.setTimeout(() => setPhase("result"), 5150),
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
                <span>TEST OPENING / NO WALLET</span>
                <strong id="demo-opening-title">{pack.name.toUpperCase()} PACK</strong>
              </div>
              <button type="button" onClick={onClose} aria-label="Close test opening">
                <X size={18} />
              </button>
            </header>

            <div className="hp-demo-stage">
              <div className="hp-demo-grid" aria-hidden="true" />
              <div className="hp-demo-phase-label" aria-live="polite">
                <span>0{["sealed", "tearing", "shuffling", "revealing", "result"].indexOf(phase) + 1}</span>
                {phase === "sealed" && "PACK LOCKED"}
                {phase === "tearing" && "BREAKING SEAL"}
                {phase === "shuffling" && "DRAWING 3 OF 7"}
                {phase === "revealing" && `REVEALING ${revealed} / 3`}
                {phase === "result" && "PULL COMPLETE"}
              </div>

              <AnimatePresence mode="wait">
                {(phase === "sealed" || phase === "tearing") && (
                  <motion.div
                    key="pack"
                    className="hp-demo-pack"
                    initial={{ opacity: 0, scale: 0.84, rotate: -4 }}
                    animate={
                      phase === "tearing"
                        ? { opacity: 1, scale: 1.08, rotate: [0, -1.4, 1.3, -0.8, 0.5, 0], x: [0, -5, 5, -3, 3, 0] }
                        : { opacity: 1, scale: 1, rotate: 0, y: [0, -8, 0] }
                    }
                    exit={{ opacity: 0, scale: 1.12, filter: "blur(14px)" }}
                    transition={
                      phase === "tearing"
                        ? { duration: 0.45, repeat: 1, ease: "easeInOut" }
                        : { opacity: { duration: 0.5 }, scale: { duration: 0.7 }, y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }
                    }
                  >
                    <Image src={pack.image} alt={`${pack.name} pack`} fill sizes="(max-width: 600px) 58vw, 300px" priority />
                    {phase === "tearing" && <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.55 }} />}
                  </motion.div>
                )}

                {(phase === "shuffling" || phase === "revealing" || phase === "result") && (
                  <motion.div
                    key="cards"
                    className="hp-demo-cards"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {tokens.map((token, index) => {
                      const isRevealed = phase === "result" || (phase === "revealing" && revealed > index);
                      return (
                        <motion.article
                          key={`${run}-${token.address}`}
                          className={isRevealed ? "revealed" : ""}
                          initial={{ y: 70, opacity: 0, rotate: (index - 1) * 7 }}
                          animate={
                            phase === "shuffling"
                              ? { y: [0, -18, 6, 0], opacity: 1, rotate: [(index - 1) * 7, (1 - index) * 5, (index - 1) * 3] }
                              : { y: 0, opacity: 1, rotate: 0 }
                          }
                          transition={
                            phase === "shuffling"
                              ? { duration: 0.62, repeat: Infinity, delay: index * 0.08, ease: "easeInOut" }
                              : { duration: 0.55, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }
                          }
                        >
                          <div className="hp-demo-card-back">
                            <span>HP</span>
                            <small>SEALED SLOT 0{index + 1}</small>
                          </div>
                          <div className="hp-demo-card-front" style={{ "--token-accent": token.color } as CSSProperties}>
                            <span className="hp-demo-card-number">0{index + 1} / 03</span>
                            <Image src={token.logo} alt="" width={112} height={112} />
                            <div>
                              <small>{pack.label} PULL</small>
                              <strong>{token.ticker}</strong>
                              <p>{token.name}</p>
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
                  {Array.from({ length: 14 }, (_, index) => (
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
              <p>{phase === "result" ? "Demo result only. No funds moved and no onchain opening was created." : "Simulating the presentation layer. No transaction will be requested."}</p>
              {phase === "result" && (
                <button type="button" onClick={() => setRun((current) => current + 1)}>
                  <RotateCcw size={15} /> OPEN ANOTHER TEST PACK
                </button>
              )}
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
