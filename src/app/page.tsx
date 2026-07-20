"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Dices,
  ExternalLink,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  Zap,
} from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/chain";
import {
  HOODPACKZ_PACK_SALES_LIVE,
  HOODPACKZ_V2_ADDRESS,
  HOODPACKZ_V2_RECOVERY_AVAILABLE,
  claimHoodPackzJackpot,
  claimHoodPackzPrize,
  cancelExpiredHoodPackzOpening,
  finalizeHoodPackzOpening,
  formatOpeningAmount,
  readHoodPackzOpening,
  refundHoodPackzOpening,
  submitHoodPackzOpening,
  type HoodPackzOpening,
  type OpeningSubmission,
} from "@/lib/hoodpackz-v2";
import { HOODPACKZ_TOKENS, tokenExplorerUrl } from "@/lib/hoodpackz-tokens";
import { useLiveTokenPrices } from "@/lib/use-live-token-prices";
import { HoodPackzBrand } from "@/components/brand/hoodpackz-brand";
import { DemoPackOpening } from "@/components/hoodpackz/demo-pack-opening";

const TIERS = [
  {
    name: "Trencher",
    price: 5,
    label: "PACK 01",
    image: "/trencher1.png",
    note: "Start here. Three real tokens, locked to one onchain draw.",
  },
  {
    name: "Cashcat Max",
    price: 15,
    label: "PACK 02",
    image: "/cashcat-max-pack.png",
    note: "The heavier pull. Bigger allocations, same transparent draw.",
  },
  {
    name: "Techpro",
    price: 50,
    label: "PACK 03",
    image: "/techpro-pack.png",
    note: "The max tier. Opens when the full reward reserve is ready.",
  },
] as const;

function tokenValueUsd(
  address: string,
  amount: bigint | undefined,
  decimals: number,
  prices: ReturnType<typeof useLiveTokenPrices>,
) {
  const price = prices.get(address.toLowerCase())?.priceUsd;
  if (price == null || amount === undefined) return null;
  const quantity = Number(formatOpeningAmount(amount, decimals));
  return Number.isFinite(quantity) ? quantity * price : null;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function assertPackInventoryAvailable(tier: number) {
  const response = await fetch(`/api/pack-inventory?tier=${tier}`, { cache: "no-store" });
  if (!response.ok) return;
  const inventory = (await response.json()) as { canOpen?: boolean; missing?: string[] };
  if (inventory.canOpen === false && inventory.missing?.length) {
    throw new Error(`Pack inventory sold out. Refill ${inventory.missing.join(", ")} before opening more packs.`);
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseOpeningIds(value: string | null): bigint[] {
  if (!value) return [];
  const values = /^\d+$/.test(value) ? [value] : (() => {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return values.filter((item): item is string => typeof item === "string" && /^\d+$/.test(item)).map(BigInt);
}

function loadOpeningIds(storage: Storage, account: `0x${string}`): bigint[] {
  const accountKey = account.toLowerCase();
  const legacyKey = `hoodpackz-opening:${accountKey}`;
  const markerPrefix = `${legacyKey}:`;
  const ids = new Set(parseOpeningIds(storage.getItem(legacyKey)).map(String));
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    const openingId = key?.startsWith(markerPrefix) ? key.slice(markerPrefix.length) : "";
    if (/^\d+$/.test(openingId)) ids.add(openingId);
  }
  return [...ids].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function persistOpeningId(storage: Storage, account: `0x${string}`, openingId: bigint): bigint[] {
  storage.setItem(`hoodpackz-opening:${account.toLowerCase()}:${openingId.toString()}`, openingId.toString());
  return loadOpeningIds(storage, account);
}

function HoodWalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    if (chainId !== robinhoodChain.id) {
      return (
        <button
          type="button"
          className="hp-wallet hp-wallet-wrong"
          onClick={() => switchChain({ chainId: robinhoodChain.id })}
          disabled={switching}
        >
          <TriangleAlert size={15} />
          {switching ? "SWITCHING" : "SWITCH NETWORK"}
        </button>
      );
    }

    return (
      <div className="hp-wallet-menu">
        <button
          type="button"
          className="hp-wallet"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="hp-online-dot" />
          {shortAddress(address)}
          <ChevronDown size={14} />
        </button>
        {open && (
          <button
            type="button"
            className="hp-disconnect"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Disconnect wallet
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="hp-wallet"
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      <Wallet size={15} />
      {isPending ? "CONNECTING" : "CONNECT WALLET"}
    </button>
  );
}

export default function HoodPackzPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [tierIndex, setTierIndex] = useState(0);
  const [openingState, setOpeningState] = useState<"idle" | "approving" | "submitting">("idle");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<OpeningSubmission | null>(null);
  const [trackedOpeningIds, setTrackedOpeningIds] = useState<bigint[]>([]);
  const [trackedOpeningId, setTrackedOpeningId] = useState<bigint | null>(null);
  const [opening, setOpening] = useState<HoodPackzOpening | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const livePrices = useLiveTokenPrices();
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const heroPackY = useTransform(scrollYProgress, [0, 0.22], [0, prefersReducedMotion ? 0 : -72]);
  const walletContext = useRef<{ address?: string; chainId?: number }>({});
  const openingContext = useRef<bigint | null>(null);
  const tier = TIERS[tierIndex];
  const isLive = Boolean(HOODPACKZ_V2_ADDRESS) && HOODPACKZ_PACK_SALES_LIVE;
  const tierIsLive = isLive && tierIndex === 0;
  const canRecover = HOODPACKZ_V2_RECOVERY_AVAILABLE;
  const livePriceCount = [...livePrices.values()].filter((price) => price.status === "live").length;

  function walletMatches(expectedAddress: `0x${string}`) {
    return walletContext.current.address === expectedAddress.toLowerCase();
  }

  useEffect(() => {
    walletContext.current = { address: address?.toLowerCase(), chainId };
  }, [address, chainId]);

  useEffect(() => {
    openingContext.current = trackedOpeningId;
  }, [trackedOpeningId]);

  useEffect(() => {
    const savedIds = canRecover && address ? loadOpeningIds(window.localStorage, address) : [];
    const timer = window.setTimeout(() => {
      setOpening(null);
      setSubmission(null);
      setOpeningError(null);
      setClaiming(null);
      setOpeningState("idle");
      setTrackedOpeningIds(savedIds);
      const latestOpeningId = savedIds.at(-1) ?? null;
      openingContext.current = latestOpeningId;
      setTrackedOpeningId(latestOpeningId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [address, canRecover]);

  useEffect(() => {
    if (!canRecover || !address || trackedOpeningId === null) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await readHoodPackzOpening(trackedOpeningId, address);
        if (active) setOpening(result);
      } catch (error) {
        if (active) setOpeningError(error instanceof Error ? error.message : "Could not load opening.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [address, canRecover, trackedOpeningId]);

  function selectTier(index: number) {
    setTierIndex(index);
  }

  function selectTierByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + direction + TIERS.length) % TIERS.length;
    selectTier(next);
    document.getElementById(`pack-tier-${next}`)?.focus();
  }

  async function openSelectedPack() {
    let submittedOpeningId: bigint | null = null;
    setOpeningError(null);
    setSubmission(null);

    if (!tierIsLive) return;
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    if (chainId !== robinhoodChain.id) {
      switchChain({ chainId: robinhoodChain.id });
      return;
    }

    try {
      setOpeningState("submitting");
      await assertPackInventoryAvailable(tierIndex);
      const result = await submitHoodPackzOpening(tierIndex, tier.price, address, () => {
        if (walletMatches(address)) setOpeningState("approving");
      });
      submittedOpeningId = result.openingId;
      const nextIds = persistOpeningId(window.localStorage, address, result.openingId);
      if (!walletMatches(address)) return;
      setSubmission(result);
      setTrackedOpeningIds(nextIds);
      openingContext.current = result.openingId;
      setTrackedOpeningId(result.openingId);
      const resultOpening = await readHoodPackzOpening(result.openingId, address);
      if (walletMatches(address) && openingContext.current === result.openingId) setOpening(resultOpening);
    } catch (error) {
      if (
        address &&
        (!walletMatches(address) || (submittedOpeningId !== null && openingContext.current !== submittedOpeningId))
      ) return;
      const message = error instanceof Error ? error.message : "Opening transaction failed.";
      setOpeningError(
        /user rejected|user denied/i.test(message) ? "Transaction cancelled in your wallet." : message,
      );
    } finally {
      if (address && walletMatches(address)) setOpeningState("idle");
    }
  }

  async function refreshOpening() {
    if (!address || trackedOpeningId === null) return;
    const refreshOpeningId = trackedOpeningId;
    setClaiming("refresh");
    setOpeningError(null);
    try {
      const result = await readHoodPackzOpening(refreshOpeningId, address);
      if (walletMatches(address) && openingContext.current === refreshOpeningId) setOpening(result);
    } catch (error) {
      if (!walletMatches(address) || openingContext.current !== refreshOpeningId) return;
      setOpeningError(error instanceof Error ? error.message : "Could not load opening.");
    } finally {
      if (walletMatches(address) && openingContext.current === refreshOpeningId) setClaiming(null);
    }
  }

  async function runOpeningAction(label: string, action: () => Promise<unknown>) {
    const actionAccount = address;
    const actionOpeningId = trackedOpeningId;
    setClaiming(label);
    setOpeningError(null);
    try {
      await action();
      if (actionAccount && actionOpeningId !== null && walletMatches(actionAccount)) {
        const result = await readHoodPackzOpening(actionOpeningId, actionAccount);
        if (walletMatches(actionAccount) && openingContext.current === actionOpeningId) setOpening(result);
      }
    } catch (error) {
      if (
        actionAccount &&
        (!walletMatches(actionAccount) || openingContext.current !== actionOpeningId)
      ) return;
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setOpeningError(/user rejected|user denied/i.test(message) ? "Transaction cancelled in your wallet." : message);
    } finally {
      if (actionAccount && walletMatches(actionAccount) && openingContext.current === actionOpeningId) setClaiming(null);
    }
  }

  const actionLabel = !isLive
    ? "PACKS PAUSED"
    : !tierIsLive
      ? "PACK LOCKED"
    : !isConnected
      ? connecting
        ? "CONNECTING WALLET"
        : "CONNECT WALLET"
      : chainId !== robinhoodChain.id
        ? switching
          ? "SWITCHING NETWORK"
          : "SWITCH TO ROBINHOOD CHAIN"
        : openingState === "approving"
          ? "APPROVE USDG IN WALLET"
          : openingState === "submitting"
            ? "CONFIRM PACK OPENING"
            : `OPEN ${tier.name.toUpperCase()}`;

  return (
    <main id="top" className="hp-shell">
      <div className="hp-announcement">
        <span>{isLive ? "Live beta on Robinhood Chain" : "Beta reserve activation in progress"}</span>
        <a href="#proof">See how every draw settles <ArrowUpRight size={13} /></a>
      </div>
      <header className="hp-header">
        <HoodPackzBrand href="#top" />
        <nav className="hp-nav" aria-label="Primary navigation">
          <a href="#packs">PACKS</a>
          <a href="#assets">TOKENS</a>
          <a href="#proof">PROOF</a>
          <a href="#economics">ECONOMICS</a>
          <a href="/docs">STATUS</a>
        </nav>
        <HoodWalletButton />
      </header>

      <section id="packs" className="hp-workbench" aria-labelledby="pack-heading">
        <motion.div
          className="hp-intro"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="hp-kicker">
            <span>ONCHAIN TOKEN PACKS / RHC 4663</span>
            <span className={isLive ? "hp-live" : "hp-launching"}><i /> {isLive ? "LIVE" : "PACKS PAUSED"}</span>
          </div>
          <h1 id="pack-heading">
            OPEN THE MARKET.<br /><span>ONE PACK AT A TIME.</span>
          </h1>
          <p>
            Choose a tier and reveal three different Robinhood Chain tokens from a funded reserve.
            Every draw is fixed onchain before the result exists.
          </p>
          <div className="hp-pool-strip" aria-label="Seven verified tokens in the pool">
            {HOODPACKZ_TOKENS.map((token) => (
              <span key={token.address} title={token.ticker}>
                <Image src={token.logo} alt={`${token.name} logo`} width={34} height={34} />
              </span>
            ))}
            <small>7 ONCHAIN ASSETS</small>
          </div>
          <div className="hp-trust-row">
            <span><ShieldCheck size={15} /> FUNDED BEFORE REVEAL</span>
            <span><Dices size={15} /> SLOW REVEAL</span>
            <span><Radio size={15} /> {livePriceCount ? `${livePriceCount}/7 RPC PRICES` : "RPC PRICES LOADING"}</span>
          </div>
        </motion.div>

        <div className="hp-control-panel">
          <div className="hp-panel-head">
            <div>
              <span>SELECT PACK</span>
              <strong>PACK MENU</strong>
            </div>
            <span className="hp-series">SERIES 01</span>
          </div>

          <div className="hp-tier-control" role="radiogroup" aria-label="Pack tier">
            {TIERS.map((option, index) => (
              <button
                key={option.name}
                type="button"
                role="radio"
                aria-checked={tierIndex === index}
                tabIndex={tierIndex === index ? 0 : -1}
                className={tierIndex === index ? "active" : ""}
                onClick={() => selectTier(index)}
                onKeyDown={(event) => selectTierByKey(event, index)}
              >
                <span>{option.label}</span>
                <strong>${option.price}</strong>
                <small>{option.name}</small>
              </button>
            ))}
          </div>

          <div className="hp-pull-list">
            <div className="hp-pull-title">
              <span>REWARD POOL</span>
              <span>7 ASSETS</span>
            </div>
            {HOODPACKZ_TOKENS.map((token, index) => (
              <div className="hp-pull" key={token.ticker}>
                <span className="hp-mini-token">
                  <Image src={token.logo} alt="" width={28} height={28} />
                </span>
                <span>
                  <strong>{token.ticker}</strong>
                  <small>{token.name}</small>
                  <a
                    className="hp-token-address"
                    href={tokenExplorerUrl(token.address)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${token.name} contract on Blockscout`}
                  >
                    {shortAddress(token.address)} <ExternalLink size={9} />
                  </a>
                </span>
                <span className="hp-pull-slot">SLOT {index + 1}</span>
              </div>
            ))}
          </div>

          <div className="hp-total">
            <span>PACK PRICE</span>
            <strong>{tier.price}.00 <small>USDG</small></strong>
          </div>

          <button
            type="button"
            className={tierIsLive ? "hp-open-action" : "hp-locked-action"}
            disabled={!tierIsLive || openingState !== "idle" || connecting || switching}
            onClick={openSelectedPack}
          >
            {tierIsLive ? <Zap size={17} /> : <LockKeyhole size={17} />}
            {actionLabel}
          </button>
          <button type="button" className="hp-demo-action" onClick={() => setDemoOpen(true)}>
            <Dices size={17} /> OPEN PACK PREVIEW
          </button>
          <p className="hp-action-note" aria-live="polite">
            {submission ? (
              <>
                OPENING #{submission.openingId.toString()} SENT.{" "}
                <a
                  href={`${robinhoodChain.blockExplorers.default.url}/tx/${submission.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  VIEW TX <ExternalLink size={9} />
                </a>
              </>
            ) : openingError ? (
              <span className="hp-action-error">{openingError}</span>
            ) : tierIsLive ? (
              "Open Pack starts the onchain draw. Reveal settles first; claiming stays in your wallet."
            ) : isLive ? (
              "TRENCHER IS LIVE. CASHCAT MAX AND TECHPRO UNLOCK AFTER THEIR RESERVES ARE FUNDED."
            ) : (
              "PACKS ARE PAUSED WHILE THE BETA RESERVE IS BEING ACTIVATED."
            )}
          </p>

          {canRecover && address && trackedOpeningId !== null && (
            <div className="hp-opening-drawer">
              <div className="hp-opening-drawer-head">
                <select
                  aria-label="Tracked opening"
                  value={trackedOpeningId.toString()}
                  disabled={claiming !== null}
                  onChange={(event) => {
                    const nextOpeningId = BigInt(event.target.value);
                    setOpening(null);
                    setOpeningError(null);
                    openingContext.current = nextOpeningId;
                    setTrackedOpeningId(nextOpeningId);
                  }}
                >
                  {trackedOpeningIds.map((id) => (
                    <option key={id.toString()} value={id.toString()}>OPENING #{id.toString()}</option>
                  ))}
                </select>
                <button type="button" onClick={refreshOpening} disabled={claiming !== null} title="Refresh draw status">
                  <RefreshCw size={13} />
                </button>
              </div>

              {!opening || opening.status === 0 ? (
                <div className="hp-opening-pending">
                  <Radio size={15} />
                  <span>{opening?.roundStatus === 3 ? "DRAW CANCELLED" : opening?.targetBlock ? `WAITING FOR BLOCK ${opening.targetBlock}` : "DRAW PENDING"}</span>
                  {opening?.canFinalize && !opening.canCancel && address && (
                    <button
                      type="button"
                      disabled={claiming !== null}
                      onClick={() => runOpeningAction("finalize", () => finalizeHoodPackzOpening(opening.openingId, address))}
                    >
                      REVEAL DRAW
                    </button>
                  )}
                  {opening?.canCancel && address && (
                    <button
                      type="button"
                      disabled={claiming !== null}
                      onClick={() => runOpeningAction("cancel", () => cancelExpiredHoodPackzOpening(opening.openingId, address))}
                    >
                      REFUND EXPIRED OPENING
                    </button>
                  )}
                  {opening?.roundStatus === 3 && address && (
                    <button
                      type="button"
                      disabled={claiming !== null}
                      onClick={() => runOpeningAction("refund", () => refundHoodPackzOpening(opening.openingId, address))}
                    >
                      REFUND {formatOpeningAmount(opening.price, 6)} USDG
                    </button>
                  )}
                </div>
              ) : opening.status === 3 ? (
                <div className="hp-opening-complete"><Check size={15} /> REFUND COMPLETE</div>
              ) : (
                <>
                  <div className="hp-opening-prizes">
                    {opening.prizes.map((prizeAddress, index) => {
                      const token = HOODPACKZ_TOKENS.find(
                        (item) => item.address.toLowerCase() === prizeAddress.toLowerCase(),
                      );
                      const claimed = (opening.claimedPrizes & (1 << index)) !== 0;
                      const unitPrice = token ? livePrices.get(token.address.toLowerCase())?.priceUsd : null;
                      const value = token
                        ? tokenValueUsd(token.address, opening.amounts[index], token.decimals, livePrices)
                        : null;
                      const source = token ? livePrices.get(token.address.toLowerCase())?.source : null;
                      return (
                        <div key={prizeAddress} className={claimed ? "claimed" : ""}>
                          {token && <Image src={token.logo} alt="" width={30} height={30} />}
                          <span>
                            <strong>{token?.ticker ?? shortAddress(prizeAddress)}</strong>
                            <small>
                              {formatOpeningAmount(opening.amounts[index], token?.decimals ?? 18)}{token ? ` ${token.ticker.toUpperCase()}` : ""}
                              {unitPrice == null ? "" : ` x ${formatUsd(unitPrice)}`}
                            </small>
                            <small className="hp-prize-value">
                              {value == null
                                ? "NO LIVE QUOTE"
                                : `${formatUsd(value)} ${source?.includes("RPC") ? "RPC spot" : "market"}`}
                            </small>
                          </span>
                          <button
                            type="button"
                            disabled={claimed || claiming !== null || !address}
                            onClick={() =>
                              address &&
                              runOpeningAction(`prize-${index}`, () =>
                                claimHoodPackzPrize(opening.openingId, index, address),
                              )
                            }
                          >
                            {claimed ? <Check size={12} /> : "CLAIM TOKENS"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hp-pack-result-total">
                    <span>Total pack value</span>
                    <strong>
                      {(() => {
                        let total = 0;
                        let complete = true;
                        opening.prizes.forEach((prizeAddress, index) => {
                        const token = HOODPACKZ_TOKENS.find(
                          (item) => item.address.toLowerCase() === prizeAddress.toLowerCase(),
                        );
                          const value = token
                            ? tokenValueUsd(token.address, opening.amounts[index], token.decimals, livePrices)
                            : null;
                          if (value == null) complete = false;
                          else total += value;
                        });
                        return complete ? formatUsd(total) : "NO LIVE QUOTE";
                      })()}
                    </strong>
                  </div>
                  <div className="hp-pack-result-actions">
                    <span>Choose</span>
                    <button type="button" disabled={claiming !== null || !address}>Sell Pack Back</button>
                  </div>
                  {opening.jackpotWinner && (
                    <button
                      type="button"
                      className="hp-jackpot-claim"
                      disabled={opening.jackpotClaimed || claiming !== null || !address}
                      onClick={() =>
                        address &&
                        runOpeningAction("jackpot", () => claimHoodPackzJackpot(opening.openingId, address))
                      }
                    >
                      {opening.jackpotClaimed
                        ? "JACKPOT CLAIMED"
                        : `CLAIM ${formatOpeningAmount(opening.jackpotPayout, 6)} USDG JACKPOT`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <motion.div
          className="hp-pack-gallery"
          style={{ y: heroPackY }}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          role="radiogroup"
          aria-label="Choose a Paxz pack"
        >
          {TIERS.map((option, index) => (
            <motion.button
              id={`pack-tier-${index}`}
              key={option.name}
              type="button"
              role="radio"
              aria-checked={tierIndex === index}
              tabIndex={tierIndex === index ? 0 : -1}
              className={`hp-pack-card ${tierIndex === index ? "active" : ""}`}
              onClick={() => selectTier(index)}
              onKeyDown={(event) => selectTierByKey(event, index)}
              whileHover={prefersReducedMotion ? undefined : { y: -12 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
            >
              <span className="hp-pack-card-index">PAXZ.FUN / {option.label}</span>
              <span className={`hp-pack-card-art ${index === 0 ? "hp-pack-card-art-square" : ""}`}>
                <Image
                  src={option.image}
                  alt={`${option.name} Paxz pack`}
                  width={index === 0 ? 1254 : 1024}
                  height={index === 0 ? 1254 : 1536}
                  priority={index === 0}
                  sizes="(max-width: 760px) 78vw, (max-width: 1100px) 32vw, 27vw"
                />
              </span>
              <span className="hp-pack-card-meta">
                <span><strong>{option.name}</strong><small>{option.note}</small></span>
                <b>${option.price}<small> USDG</small></b>
              </span>
            </motion.button>
          ))}
        </motion.div>
      </section>

      <section className="hp-status-rail" aria-label="Protocol status">
        <div><Radio size={16} /><span>DRAW</span><strong>FUTURE BLOCK</strong></div>
        <div><ShieldCheck size={16} /><span>RESERVE</span><strong>PRE-FUNDED</strong></div>
        <div><Zap size={16} /><span>SETTLEMENT</span><strong>ROBINHOOD CHAIN</strong></div>
        <div className={isLive ? "" : "hp-status-warning"}>
          {isLive ? <Check size={16} /> : <TriangleAlert size={16} />}
          <span>PACKS</span><strong>{isLive ? "LIVE" : "PAUSED"}</strong>
        </div>
      </section>

      <section id="assets" className="hp-assets" aria-labelledby="assets-heading">
        <div className="hp-assets-head">
          <div>
            <span className="hp-section-label">ROBINHOOD CHAIN / ERC-20 REWARDS</span>
            <h2 id="assets-heading">THE POOL,<br />ONCHAIN.</h2>
          </div>
          <div className="hp-assets-state">
            <span>CONTRACTS</span>
            <strong>7 / 7 ONCHAIN</strong>
            <small>{isLive ? "RESERVE ACTIVE" : "RESERVE PENDING"}</small>
          </div>
        </div>

        <div className="hp-token-registry">
          <div className="hp-token-registry-head" aria-hidden="true">
            <span>ASSET</span>
            <span>CONTRACT</span>
            <span>DECIMALS</span>
            <span>EXPLORER</span>
          </div>
          {HOODPACKZ_TOKENS.map((token, index) => (
            <a
              key={token.address}
              className="hp-token-registry-row"
              href={tokenExplorerUrl(token.address)}
              target="_blank"
              rel="noreferrer"
              aria-label={`${token.name} contract on Blockscout`}
            >
              <span className="hp-token-identity">
                <i><Image src={token.logo} alt={`${token.name} logo`} width={38} height={38} /></i>
                <span>
                  <strong>{token.ticker}</strong>
                  <small>{token.name}</small>
                </span>
              </span>
              <code>{token.address}</code>
              <span className="hp-token-decimals">{token.decimals}</span>
              <span className="hp-token-explorer">
                VIEW <ExternalLink size={13} />
              </span>
              <span className="hp-token-number">0{index + 1}</span>
            </a>
          ))}
        </div>

        <p className="hp-assets-note">
          Every reward token is an ERC-20 on Robinhood Chain. A pack can only open when the reserve
          can cover every possible result.
        </p>
      </section>

      <section id="economics" className="hp-economics" aria-labelledby="economics-heading">
        <div className="hp-section-label">CLEAR SPLIT</div>
        <div className="hp-economics-grid">
          <div className="hp-economics-copy">
            <h2 id="economics-heading">NO MYSTERY<br />IN THE MARGIN.</h2>
            <p>
              Each opening follows the same split: most of the payment backs rewards, a slice feeds
              the jackpot, and the rest keeps the protocol running.
            </p>
          </div>
          <div className="hp-split" aria-label="Opening split: 80 percent rewards, 10 percent jackpot, 10 percent protocol">
            <div className="hp-split-prize">80%</div>
            <div className="hp-split-jackpot">10%</div>
            <div className="hp-split-fee">10%</div>
          </div>
          <div className="hp-ledger">
            <div><Coins /><span>REWARDS</span><strong>80%</strong><small>Funds the token reserve</small></div>
            <div><CircleDollarSign /><span>JACKPOT</span><strong>10%</strong><small>Builds the USDG vault</small></div>
            <div><Check /><span>PROTOCOL</span><strong>10%</strong><small>Keeps the system live</small></div>
          </div>
        </div>
      </section>

      <section id="proof" className="hp-proof" aria-labelledby="proof-heading">
        <div className="hp-proof-head">
          <div>
            <span className="hp-section-label">TRANSPARENT BETA DRAW</span>
            <h2 id="proof-heading">THE TARGET BLOCK IS SET<br />BEFORE THE REVEAL.</h2>
          </div>
          <span className="hp-proof-note">AUDITABLE DRAW</span>
        </div>
        <div className="hp-proof-grid">
          <article><span>01</span><Radio /><h3>OPEN</h3><p>Your transaction locks the opening to a future Robinhood block.</p></article>
          <article><span>02</span><ShieldCheck /><h3>RESERVE</h3><p>The contract keeps enough inventory for every possible outcome.</p></article>
          <article><span>03</span><Dices /><h3>REVEAL</h3><p>Once the block exists, anyone can finalize the same draw.</p></article>
          <article><span>04</span><Zap /><h3>BETA NOTE</h3><p>The draw is transparent and auditable. A future release can upgrade it to VRF.</p></article>
        </div>
      </section>

      <section id="transparency" className="hp-transparency" aria-labelledby="transparency-heading">
        <div className="hp-proof-head">
          <div>
            <span className="hp-section-label">ONCHAIN RECORD / ROBINHOOD CHAIN 4663</span>
            <h2 id="transparency-heading">ADDRESSES YOU CAN CHECK.</h2>
          </div>
          <span className="hp-proof-note">BLOCKSCOUT LINKS</span>
        </div>
        <div className="hp-contract-grid">
          {([
            { label: "Legacy core", addr: "0x5337Ad84857E433b7d57Ca1130079044Ef37e436", note: "Paused historical deployment; not used for new openings" },
            { label: "Archived beacon", addr: "0x2B4547eAf629dE637C28146C3104e83f1F0AE7dc", note: "Experimental randomness path retained for review" },
          ] as const).map(({ label, addr, note }) => (
            <a
              key={addr}
              className="hp-contract-row"
              href={`https://robinhoodchain.blockscout.com/address/${addr}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="hp-contract-label">{label}</span>
              <code className="hp-contract-addr">{addr}</code>
              <span className="hp-contract-note">{note}</span>
              <span className="hp-contract-cta">BLOCKSCOUT <ExternalLink size={11} /></span>
            </a>
          ))}
        </div>
      </section>

      <footer className="hp-footer">
        <div className="hp-footer-top">
          <div>
            <span className="hp-section-label">LIVE ON ROBINHOOD CHAIN</span>
            <h2>THREE TOKENS.<br />ONE OPENING.</h2>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#packs">Packs <ArrowUpRight size={18} /></a>
            <a href="#assets">Reward pool <ArrowUpRight size={18} /></a>
            <a href="https://x.com/paxzdotfun" target="_blank" rel="noreferrer">Community on X <ArrowUpRight size={18} /></a>
          </nav>
        </div>
        <div className="hp-footer-word" aria-hidden="true">PAXZ.FUN</div>
        <div className="hp-footer-base">
          <p />
          <p>ROBINHOOD CHAIN / 4663 / BETA</p>
          <div>
            <a href="https://x.com/paxzdotfun" target="_blank" rel="noreferrer" aria-label="Paxz on X">X</a>
            <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer" aria-label="Robinhood Chain explorer"><ExternalLink size={18} /></a>
          </div>
        </div>
      </footer>
      <DemoPackOpening open={demoOpen} pack={tier} onClose={() => setDemoOpen(false)} />
    </main>
  );
}
