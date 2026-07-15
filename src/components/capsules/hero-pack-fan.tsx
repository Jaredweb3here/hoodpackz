"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getCapsuleArtwork } from "@/lib/capsule-artwork";
import { StockLogo } from "./stock-logo";

const CHIPS = [
  { ticker: "NVDA", x: "4%", y: "10%", delay: 0, dur: 5.5, drift: 10, tilt: -3 },
  { ticker: "AAPL", x: "86%", y: "16%", delay: 0.8, dur: 6.2, drift: -12, tilt: 4 },
  { ticker: "TSLA", x: "0%", y: "60%", delay: 1.6, dur: 5.8, drift: 8, tilt: 3 },
  { ticker: "MSFT", x: "90%", y: "56%", delay: 0.4, dur: 6.6, drift: -9, tilt: -4 },
  { ticker: "AMZN", x: "12%", y: "88%", delay: 1.2, dur: 6.0, drift: 11, tilt: 4 },
  { ticker: "GOOGL", x: "80%", y: "90%", delay: 2.0, dur: 5.6, drift: -10, tilt: -3 },
];

const FAN = [
  { id: "mag7", rotate: -14, x: -120, y: 26, scale: 0.86, z: 1 },
  { id: "ai", rotate: 0, x: 0, y: 0, scale: 1, z: 3 },
  { id: "dividend", rotate: 14, x: 120, y: 26, scale: 0.86, z: 2 },
];

export function HeroPackFan() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 120, damping: 22 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 120, damping: 22 });

  function onMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  function onLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative flex h-full w-full items-center justify-center"
      style={{ perspective: 1400 }}
    >
      {/* Stage glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 48% at 50% 52%, rgba(0,200,5,0.09) 0%, rgba(0,200,5,0.03) 40%, transparent 68%)",
        }}
      />

      {/* Floating stock chips */}
      {CHIPS.map((chip, i) => (
        <motion.div
          key={chip.ticker}
          initial={{ opacity: 0, scale: 0.4, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5 + i * 0.14, type: "spring", stiffness: 260, damping: 18 }}
          className="absolute z-20 hidden sm:block"
          style={{ left: chip.x, top: chip.y }}
        >
          <motion.div
            animate={{
              y: [0, -16, -4, 0],
              x: [0, chip.drift, chip.drift * 0.4, 0],
              rotate: [0, chip.tilt, -chip.tilt * 0.5, 0],
            }}
            transition={{
              duration: chip.dur,
              repeat: Infinity,
              ease: "easeInOut",
              delay: chip.delay,
            }}
            whileHover={{ scale: 1.12 }}
            className="relative"
          >
            {/* Pulsing glow halo */}
            <motion.div
              aria-hidden
              animate={{ opacity: [0.2, 0.55, 0.2], scale: [0.95, 1.12, 0.95] }}
              transition={{
                duration: chip.dur * 0.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: chip.delay,
              }}
              className="absolute -inset-1.5 rounded-full bg-rh-green/12 blur-lg"
            />
            <div className="relative flex items-center gap-2.5 rounded-full bg-white/[0.06] py-2 pr-5 pl-2 shadow-[0_10px_36px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.1] backdrop-blur-xl">
              <StockLogo ticker={chip.ticker} size="sm" />
              <span className="text-sm font-semibold tracking-wide text-white/75">
                {chip.ticker}
              </span>
            </div>
          </motion.div>
        </motion.div>
      ))}

      {/* Pack fan */}
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10 h-[340px] w-[240px] sm:h-[420px] sm:w-[290px]"
      >
        {FAN.map((pack, i) => (
          <motion.div
            key={pack.id}
            initial={{ opacity: 0, y: 40, rotate: 0, x: 0 }}
            animate={{ opacity: 1, y: pack.y, rotate: pack.rotate, x: pack.x }}
            transition={{ delay: 0.25 + i * 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: pack.y - 14, scale: pack.scale + 0.03 }}
            className="absolute inset-0"
            style={{ zIndex: pack.z, scale: pack.scale, transformOrigin: "50% 85%" }}
          >
            <Image
              src={getCapsuleArtwork(pack.id)}
              alt={`${pack.id} StockPack`}
              fill
              priority={pack.id === "ai"}
              className="object-contain drop-shadow-[0_36px_70px_rgba(0,0,0,0.85)]"
              sizes="290px"
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Floor shadow */}
      <div
        aria-hidden
        className="absolute bottom-[4%] left-1/2 h-10 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/70 blur-2xl"
      />
    </div>
  );
}
