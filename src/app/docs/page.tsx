import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { HoodPackzBrand } from "@/components/brand/hoodpackz-brand";

export const metadata: Metadata = {
  title: "Protocol Status | HoodPackz",
  description: "HoodPackz V2 architecture, launch gates, economics, and deployment status.",
};

const STATUS = [
  { name: "Bond registry", state: "Implemented", ready: true },
  { name: "Operator bond vault", state: "Implemented", ready: true },
  { name: "4-of-7 beacon state machine", state: "Implemented", ready: true },
  { name: "Production EIP-2537 verifier", state: "Pending vectors", ready: false },
  { name: "Meme asset registry", state: "Pending", ready: false },
  { name: "Pack inventory and core", state: "Pending", ready: false },
  { name: "External audit and legal review", state: "Required", ready: false },
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
          <span className="hp-section-label">V2 / PROTOCOL STATUS</span>
          <h1>THE SPEC IS PUBLIC.<br />THE LAUNCH IS GATED.</h1>
        </div>
        <p>
          HoodPackz will not accept approvals or funds until the meme-pack core, production BLS
          verifier, asset controls, external audit, and legal review are complete.
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
          <strong>DISABLED</strong>
          <p>No HoodPackz V2 core address is configured. The current application is a non-custodial preview.</p>
        </aside>
      </section>

      <section className="hp-docs-spec">
        <div><span>PACKS</span><strong>5 / 15 / 50 USDG</strong><p>Each pack resolves to three different admitted meme tokens.</p></div>
        <div><span>ECONOMICS</span><strong>80 / 10 / 10</strong><p>Prize EV, USDG jackpot, and protocol fee.</p></div>
        <div><span>RANDOMNESS</span><strong>4-OF-7 BLS</strong><p>Bonded threshold signatures with attributable rescue shares.</p></div>
        <div><span>EXPOSURE</span><strong>COLLATERAL CAPPED</strong><p>Value at risk cannot exceed slashable quorum capacity.</p></div>
      </section>

      <section className="hp-docs-principles">
        <div>
          <span className="hp-section-label">NON-NEGOTIABLES</span>
          <h2>WHAT V2 WILL<br />NOT TRUST.</h2>
        </div>
        <ul>
          <li><ShieldCheck size={18} /><span>No timestamp, blockhash, prevrandao, or single keeper as entropy.</span></li>
          <li><ShieldCheck size={18} /><span>No fee-on-transfer, rebasing, blacklistable, or owner-mintable prize assets.</span></li>
          <li><ShieldCheck size={18} /><span>No uncapped jackpot exposure against fixed operator bonds.</span></li>
          <li><ShieldCheck size={18} /><span>No mainnet launch before audit, BLS vectors, liquidity tests, and legal approval.</span></li>
        </ul>
      </section>

      <footer className="hp-footer hp-docs-footer">
        <HoodPackzBrand />
        <p>ARCHITECTURE SOURCE AND TESTS</p>
        <a href="https://github.com/Jaredweb3here/hoodpackz" target="_blank" rel="noreferrer">
          GITHUB <ArrowUpRight size={15} />
        </a>
      </footer>
    </main>
  );
}
