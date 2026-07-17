#!/usr/bin/env node
/**
 * HoodPackz V2 — Local 4-of-7 BLS12-381 DKG
 *
 * Generates 7 operator key shares and an aggregated master public key
 * for use with BLS12381Verifier and BeaconOperatorRegistry.
 *
 * Output: .dkg/epoch-1.json — keep SECRET, backup securely.
 *
 * Usage:
 *   node scripts/dkg.mjs [--out .dkg/epoch-1.json]
 *
 * Requires: @noble/curves (npm install -g @noble/curves)
 */

import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { randomBytes } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv[process.argv.indexOf("--out") + 1];
const outFile = resolve(__dir, "..", outArg ?? ".dkg/epoch-1.json");

const OPERATORS = 7;
const THRESHOLD = 4;

// ── Feldman VSS (simplified) ──────────────────────────────────────────────────
// Generate a random polynomial of degree (THRESHOLD-1) over Fr.
// Secret = poly[0]. Shares = poly(i) for i = 1..OPERATORS.

function randomFr() {
  // Fr order for BLS12-381
  const ORDER = bls.fields.Fr.ORDER;
  let r;
  do {
    r = BigInt("0x" + randomBytes(32).toString("hex"));
  } while (r >= ORDER || r === 0n);
  return r;
}

function evalPoly(poly, x) {
  let result = 0n;
  let xPow = 1n;
  const ORDER = bls.fields.Fr.ORDER;
  for (const coeff of poly) {
    result = bls.fields.Fr.add(result, bls.fields.Fr.mul(coeff, xPow));
    xPow = bls.fields.Fr.mul(xPow, x);
  }
  return result;
}

// ── G1 point serialisation (uncompressed, 96 bytes) ──────────────────────────
function g1ToHex(point) {
  return Buffer.from(point.toRawBytes(false)).toString("hex"); // uncompressed
}

function g2ToHex(point) {
  return Buffer.from(point.toRawBytes(false)).toString("hex"); // uncompressed
}

// ── Main ─────────────────────────────────────────────────────────────────────
const poly = Array.from({ length: THRESHOLD }, () => randomFr());
const secret = poly[0];

const masterPrivKey = secret;
const masterPubKey  = bls.G1.ProjectivePoint.fromPrivateKey(
  masterPrivKey.toString(16).padStart(64, "0")
);

const shares = [];
for (let i = 1; i <= OPERATORS; i++) {
  const shareScalar = evalPoly(poly, BigInt(i));
  const sharePrivKey = shareScalar.toString(16).padStart(64, "0");
  const sharePubKey  = bls.G1.ProjectivePoint.fromPrivateKey(sharePrivKey);
  shares.push({
    operatorIndex: i - 1,
    // In production: distribute sharePrivKey to each independent operator.
    // Here all operators are controlled by the deployer.
    privateKey:    "0x" + sharePrivKey,
    publicKey:     "0x" + g1ToHex(sharePubKey),
  });
}

const epoch = {
  threshold: THRESHOLD,
  operatorCount: OPERATORS,
  masterPublicKey: "0x" + g1ToHex(masterPubKey),
  // master private key — only needed to produce aggregate signatures
  masterPrivateKey: "0x" + masterPrivKey.toString(16).padStart(64, "0"),
  shares,
  generatedAt: new Date().toISOString(),
  note: "KEEP SECRET. Back up securely. Do not commit to git.",
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(epoch, null, 2));

console.log("DKG complete.");
console.log("Master public key :", epoch.masterPublicKey);
console.log("Output            :", outFile);
console.log();
console.log("Next: run scripts/sign-round.mjs to produce aggregate signatures.");
