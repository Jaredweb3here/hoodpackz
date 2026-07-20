import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { HoodPackzBrand } from "@/components/brand/hoodpackz-brand";

export const metadata: Metadata = {
  title: "Protocol Status | Paxz",
  description: "Paxz protocol notes, reserve model, economics, and deployment status.",
};

const STATUS = [
  { name: "Future-block draw", state: "Live", ready: true },
  { name: "Permissionless reveal", state: "Live", ready: true },
  { name: "Refund after expired entropy", state: "Live", ready: true },
  { name: "Trencher reserve", state: "Live", ready: true },
  { name: "Cashcat Max reserve", state: "Locked", ready: false },
  { name: "Techpro reserve", state: "Locked", ready: false },
  { name: "External audit review", state: "Ongoing", ready: false },
] as const;

export default function DocsPage() {
  return (
    <main className="hp-shell hp-docs-shell">
      <header className="hp-header hp-docs-header">
        <HoodPackzBrand />
        <Link href="/" className="hp-docs-back"><ArrowLeft size={15} /> BACK TO PACKS</Link>
      </header>

      <section className="hp-docs-hero">
        <div>
          <span className="hp-section-label">PROTOCOL STATUS</span>
          <h1>LIVE PACKS.<br />PUBLIC RULES.</h1>
        </div>
        <p>
          Paxz uses a fixed future Robinhood block hash with permissionless reveal.
          Only funded packs can open; locked packs stay closed until their reserves are ready.
        </p>
      </section>

      <section className="hp-docs-grid">
        <article className="hp-docs-status">
          <div className="hp-docs-title"><span>BUILD STATUS</span><strong>{STATUS.filter((item) => item.ready).length} / {STATUS.length}</strong></div>
          {STATUS.map((item) => (
            <div key={item.name} className="hp-docs-row">
              {item.ready ? <Check size={16} /> : <Clock3 size={16} />}
              <span>{item.name}</span>
              <strong className={item.ready ? "ready" : "pending"}>{item.state}</strong>
            </div>
          ))}
        </article>

        <aside className="hp-docs-callout">
          <LockKeyhole size={28} />
          <span>MAINNET ACTIONS</span>
          <strong>LIVE</strong>
          <p>Openings are wallet-submitted, non-custodial, and settled by the deployed beta contracts.</p>
        </aside>
      </section>

      <section className="hp-docs-spec">
        <div><span>PACKS</span><strong>5 / 15 / 50 USDG</strong><p>Each opening resolves to three different reward tokens.</p></div>
        <div><span>ECONOMICS</span><strong>80 / 10 / 10</strong><p>Reward reserve, USDG jackpot, and protocol operations.</p></div>
        <div><span>DRAW</span><strong>FUTURE BLOCK</strong><p>The target block is fixed before its hash exists.</p></div>
        <div><span>RECOVERY</span><strong>FULL REFUND</strong><p>Expired entropy unlocks reserve inventory and returns the purchase price.</p></div>
      </section>

      <section className="hp-docs-principles">
        <div>
          <span className="hp-section-label">GUARDRAILS</span>
          <h2>WHAT EVERY<br />OPENING CHECKS.</h2>
        </div>
        <ul>
          <li><ShieldCheck size={18} /><span>The target future block is committed when the opening is created.</span></li>
          <li><ShieldCheck size={18} /><span>Rewards are pre-funded and checked before a pack can accept payment.</span></li>
          <li><ShieldCheck size={18} /><span>Locked tiers stay closed until every possible result is backed.</span></li>
          <li><ShieldCheck size={18} /><span>If the draw expires, the user can recover the full purchase price.</span></li>
        </ul>
      </section>

      <footer className="hp-footer hp-docs-footer">
        <HoodPackzBrand />
        <p>PROTOCOL STATUS AND TEST NOTES</p>
        <span>ROBINHOOD CHAIN / 4663</span>
      </footer>
    </main>
  );
}
