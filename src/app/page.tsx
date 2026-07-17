"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Code2,
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
  formatOpeningAmount,
  readHoodPackzOpening,
  refundHoodPackzOpening,
  submitHoodPackzOpening,
  type HoodPackzOpening,
  type OpeningSubmission,
} from "@/lib/hoodpackz-v2";
import { HOODPACKZ_TOKENS, tokenExplorerUrl } from "@/lib/hoodpackz-tokens";
import { HoodPackzBrand } from "@/components/brand/hoodpackz-brand";

const TIERS = [
  { name: "Corner", price: 5, label: "ENTRY" },
  { name: "Block", price: 15, label: "CORE" },
  { name: "City", price: 50, label: "HEAT" },
] as const;

const TOKEN_POOLS = [
  [HOODPACKZ_TOKENS[0], HOODPACKZ_TOKENS[2], HOODPACKZ_TOKENS[4]],
  [HOODPACKZ_TOKENS[1], HOODPACKZ_TOKENS[3], HOODPACKZ_TOKENS[5]],
  [HOODPACKZ_TOKENS[6], HOODPACKZ_TOKENS[0], HOODPACKZ_TOKENS[3]],
] as const;

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
        <button type="button" className="hp-wallet" onClick={() => setOpen((value) => !value)}>
          <span className="hp-online-dot" />
          {shortAddress(address)}
          <ChevronDown size={14} />
        </button>
        {open && (
          <button
            type="button"
            className="hp-disconnect"
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
  const [tierIndex, setTierIndex] = useState(1);
  const [poolIndex, setPoolIndex] = useState(1);
  const [openingState, setOpeningState] = useState<"idle" | "approving" | "submitting">("idle");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<OpeningSubmission | null>(null);
  const [trackedOpeningIds, setTrackedOpeningIds] = useState<bigint[]>([]);
  const [trackedOpeningId, setTrackedOpeningId] = useState<bigint | null>(null);
  const [opening, setOpening] = useState<HoodPackzOpening | null>(null);
  const walletContext = useRef<{ address?: string; chainId?: number }>({});
  const openingContext = useRef<bigint | null>(null);
  const tier = TIERS[tierIndex];
  const tokens = TOKEN_POOLS[tierIndex] ?? TOKEN_POOLS[poolIndex];
  const isLive = Boolean(HOODPACKZ_V2_ADDRESS) && HOODPACKZ_PACK_SALES_LIVE;
  const canRecover = HOODPACKZ_V2_RECOVERY_AVAILABLE;

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

  function reshufflePreview() {
    setPoolIndex((current) => (current + 1) % TOKEN_POOLS.length);
  }

  async function openSelectedPack() {
    let submittedOpeningId: bigint | null = null;
    setOpeningError(null);
    setSubmission(null);

    if (!isLive) return;
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
    ? "LAUNCHING SOON"
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
            : `OPEN ${tier.name.toUpperCase()} PACK`;

  return (
    <main id="top" className="hp-shell">
      <header className="hp-header">
        <HoodPackzBrand href="#top" />
        <nav className="hp-nav" aria-label="Primary navigation">
          <a href="#packs">PACKS</a>
          <a href="#assets">TOKENS</a>
          <a href="#proof">PROOF</a>
          <a href="#economics">ECONOMICS</a>
          <a href="#transparency">CONTRACTS</a>
        </nav>
        <HoodWalletButton />
      </header>

      <section id="packs" className="hp-workbench" aria-labelledby="pack-heading">
        <div className="hp-intro">
          <div className="hp-kicker">
            <span>PACK OPENING DESK / RHC 4663</span>
            <span className={isLive ? "hp-live" : "hp-launching"}><i /> {isLive ? "LIVE" : "LAUNCHING"}</span>
          </div>
          <h1 id="pack-heading">
            THREE TOKENS.<br />ONE <span>SEALED DRAW.</span>
          </h1>
          <p>
            At launch, each USDG tier will draw three different assets from funded onchain
            inventory. No duplicates, no rerolls after the request is sealed.
          </p>
          <div className="hp-pool-strip" aria-label="Seven verified tokens in the pool">
            {HOODPACKZ_TOKENS.map((token) => (
              <span key={token.address} title={token.ticker}>
                <Image src={token.logo} alt={`${token.name} logo`} width={34} height={34} />
              </span>
            ))}
            <small>7 VERIFIED ASSETS</small>
          </div>
          <div className="hp-trust-row">
            <span><ShieldCheck size={15} /> 4-OF-7 BEACON</span>
            <span><Dices size={15} /> 3 UNIQUE OUTPUTS</span>
          </div>
        </div>

        <div className="hp-product-stage" aria-label={`${tier.name} pack preview`}>
          <div className={`hp-drop-ticket hp-drop-ticket-${tierIndex}`}>
            <div className="hp-ticket-head">
              <span>HOODPACKZ / DROP 001</span>
              <span className={isLive ? "hp-ticket-live" : "hp-ticket-lock"}>
                {isLive ? <Radio size={12} /> : <LockKeyhole size={12} />}
                {isLive ? "LIVE" : "LAUNCHING"}
              </span>
            </div>
            <div className="hp-ticket-price">
              <span>{tier.name} pack</span>
              <strong>${tier.price}<small> USDG</small></strong>
            </div>
            <div className="hp-ticket-rule">
              <span>OUTPUT</span>
              <strong>3 TOKENS / NO DUPES</strong>
            </div>
            <div className="hp-ticket-pulls" aria-label="Three token preview">
              {tokens.map((token, index) => (
                <div key={token.ticker} className="hp-ticket-token">
                  <span>0{index + 1}</span>
                  <Image src={token.logo} alt={`${token.name} logo`} width={64} height={64} />
                  <div>
                    <strong>{token.ticker}</strong>
                    <small>{token.name}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="hp-ticket-foot">
              <span>PREVIEW SELECTION</span>
              <span>FINAL DRAW: BEACON</span>
            </div>
          </div>
          <button type="button" className="hp-shuffle" onClick={reshufflePreview}>
            <RefreshCw size={14} /> SHUFFLE PREVIEW
          </button>
        </div>

        <div className="hp-control-panel">
          <div className="hp-panel-head">
            <div>
              <span>SELECT DROP</span>
              <strong>PACK TIER</strong>
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
                className={tierIndex === index ? "active" : ""}
                onClick={() => setTierIndex(index)}
              >
                <span>{option.label}</span>
                <strong>${option.price}</strong>
                <small>{option.name}</small>
              </button>
            ))}
          </div>

          <div className="hp-pull-list">
            <div className="hp-pull-title">
              <span>VERIFIED CONTRACTS</span>
              <span>7 / 7 POOL</span>
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
            <span>PACK TOTAL</span>
            <strong>{tier.price}.00 <small>USDG</small></strong>
          </div>

          <button
            type="button"
            className={isLive ? "hp-open-action" : "hp-locked-action"}
            disabled={!isLive || openingState !== "idle" || connecting || switching}
            onClick={openSelectedPack}
          >
            {isLive ? <Zap size={17} /> : <LockKeyhole size={17} />}
            {actionLabel}
          </button>
          <p className="hp-action-note">
            {submission ? (
              <>
                OPENING #{submission.openingId.toString()} QUEUED.{" "}
                <a
                  href={`${robinhoodChain.blockExplorers.default.url}/tx/${submission.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  VIEW TRANSACTION <ExternalLink size={9} />
                </a>
              </>
            ) : openingError ? (
              <span className="hp-action-error">{openingError}</span>
            ) : isLive ? (
              "Payment is submitted from your wallet. Three funded token rewards settle after the beacon finalizes."
            ) : (
              "PACK SALES OPEN WHEN RESERVES AND THE RANDOMNESS NETWORK ARE LIVE."
            )}
          </p>

          {canRecover && address && trackedOpeningId !== null && (
            <div className="hp-opening-drawer">
              <div className="hp-opening-drawer-head">
                <select
                  aria-label="Tracked opening"
                  value={trackedOpeningId.toString()}
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
                  <span>{opening?.roundStatus === 3 ? "ROUND CANCELLED" : "WAITING FOR BEACON"}</span>
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
                <div className="hp-opening-complete"><Check size={15} /> PAYMENT REFUNDED</div>
              ) : (
                <>
                  <div className="hp-opening-prizes">
                    {opening.prizes.map((prizeAddress, index) => {
                      const token = HOODPACKZ_TOKENS.find(
                        (item) => item.address.toLowerCase() === prizeAddress.toLowerCase(),
                      );
                      const claimed = (opening.claimedPrizes & (1 << index)) !== 0;
                      return (
                        <div key={prizeAddress} className={claimed ? "claimed" : ""}>
                          {token && <Image src={token.logo} alt="" width={30} height={30} />}
                          <span>
                            <strong>{token?.ticker ?? shortAddress(prizeAddress)}</strong>
                            <small>{formatOpeningAmount(opening.amounts[index], token?.decimals ?? 18)}</small>
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
                            {claimed ? <Check size={12} /> : "CLAIM"}
                          </button>
                        </div>
                      );
                    })}
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
      </section>

      <section className="hp-status-rail" aria-label="Protocol status">
        <div><Radio size={16} /><span>BEACON</span><strong>4 / 7 THRESHOLD</strong></div>
        <div><ShieldCheck size={16} /><span>COLLATERAL</span><strong>EXPOSURE CAPPED</strong></div>
        <div><Zap size={16} /><span>SETTLEMENT</span><strong>ROBINHOOD CHAIN</strong></div>
        <div className={isLive ? "" : "hp-status-warning"}>
          {isLive ? <Check size={16} /> : <TriangleAlert size={16} />}
          <span>PACK SALES</span><strong>{isLive ? "LIVE" : "COMING SOON"}</strong>
        </div>
      </section>

      <section id="assets" className="hp-assets" aria-labelledby="assets-heading">
        <div className="hp-assets-head">
          <div>
            <span className="hp-section-label">ROBINHOOD CHAIN / VERIFIED ERC-20</span>
            <h2 id="assets-heading">THE REAL TOKEN POOL.</h2>
          </div>
          <div className="hp-assets-state">
            <span>CONTRACTS</span>
            <strong>7 / 7 ONCHAIN</strong>
            <small>{isLive ? "PACK RESERVES LIVE" : "RESERVES PREPARING"}</small>
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
          These contracts exist on Robinhood Chain mainnet. Pack sales activate only when every
          possible reward is held in reserve and available for settlement.
        </p>
      </section>

      <section id="economics" className="hp-economics" aria-labelledby="economics-heading">
        <div className="hp-section-label">EVERY DOLLAR ACCOUNTED FOR</div>
        <div className="hp-economics-grid">
          <div className="hp-economics-copy">
            <h2 id="economics-heading">NO MYSTERY<br />IN THE MARGIN.</h2>
            <p>
              Pack proceeds follow one published split. Inventory funding supports the three-token
              pull; the rest funds the jackpot and protocol operations.
            </p>
          </div>
          <div className="hp-split" aria-label="Pack proceeds: 80 percent inventory funding, 10 percent jackpot, 10 percent protocol">
            <div className="hp-split-prize" style={{ width: "80%" }}>80%</div>
            <div className="hp-split-jackpot" style={{ width: "10%" }}>10%</div>
            <div className="hp-split-fee" style={{ width: "10%" }}>10%</div>
          </div>
          <div className="hp-ledger">
            <div><Coins /><span>INVENTORY</span><strong>80%</strong><small>Funds admitted token reserves</small></div>
            <div><CircleDollarSign /><span>USDG JACKPOT</span><strong>10%</strong><small>Paid from a capped vault</small></div>
            <div><Check /><span>PROTOCOL</span><strong>10%</strong><small>Operations and reserves</small></div>
          </div>
        </div>
      </section>

      <section id="proof" className="hp-proof" aria-labelledby="proof-heading">
        <div className="hp-proof-head">
          <div>
            <span className="hp-section-label">RANDOMNESS, WITH CONSEQUENCES</span>
            <h2 id="proof-heading">THE BEACON CAN BE VERIFIED.<br />THE OPERATORS CAN BE SLASHED.</h2>
          </div>
          <a href="https://github.com/Jaredweb3here/hoodpackz" target="_blank" rel="noreferrer">
            VIEW SOURCE <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="hp-proof-grid">
          <article><span>01</span><Radio /><h3>REQUEST</h3><p>The pack locks its value before a randomness round is sealed.</p></article>
          <article><span>02</span><ShieldCheck /><h3>SIGN</h3><p>Four independent operators produce threshold BLS shares against bonded collateral.</p></article>
          <article><span>03</span><Dices /><h3>FINALIZE</h3><p>One unique aggregate signature becomes immutable randomness for the pull.</p></article>
          <article><span>04</span><Zap /><h3>DELIVER</h3><p>Randomness finalizes independently, even if delivery needs to be retried.</p></article>
        </div>
      </section>

      <section id="transparency" className="hp-transparency" aria-labelledby="transparency-heading">
        <div className="hp-proof-head">
          <div>
            <span className="hp-section-label">FULLY ONCHAIN / ROBINHOOD CHAIN 4663</span>
            <h2 id="transparency-heading">EVERY CONTRACT.<br />EVERY ADDRESS.</h2>
          </div>
          <a href="https://github.com/Jaredweb3here/hoodpackz" target="_blank" rel="noreferrer">
            VIEW SOURCE <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="hp-contract-grid">
          {([
            { label: "HoodPackzCore V2", addr: "0x5337Ad84857E433b7d57Ca1130079044Ef37e436", note: "Pack sales, inventory, prize delivery" },
            { label: "ThresholdRandomBeacon", addr: "0x2B4547eAf629dE637C28146C3104e83f1F0AE7dc", note: "4-of-7 BLS randomness finalization" },
            { label: "BLS12381Verifier", addr: "0xf500CBd6bE6CCa621a0Bca39e384729E51ECF1c8", note: "EIP-2537 aggregate signature verification" },
            { label: "BeaconOperatorRegistry", addr: "0xFbE3C11728676604f90ea637450B6FEd24af3bb0", note: "Operator registration and epoch keys" },
            { label: "OperatorBondVault", addr: "0x70AFe9e397E0daF274368C6DEbd485F01B7c7E8D", note: "Slashable operator collateral" },
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
        <HoodPackzBrand />
        <p>HOODPACKZ / ROBINHOOD CHAIN</p>
        <div>
          <a href="https://github.com/Jaredweb3here/hoodpackz" target="_blank" rel="noreferrer" aria-label="HoodPackz on GitHub"><Code2 size={18} /></a>
          <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer" aria-label="Robinhood Chain explorer"><ExternalLink size={18} /></a>
        </div>
      </footer>
    </main>
  );
}
