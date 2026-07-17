#!/usr/bin/env node
/**
 * HoodPackz V2 — Aggregate BLS12-381 round signature
 *
 * Reads the beacon round digest from the chain and produces the aggregate
 * signature that finalizeRound() expects.
 *
 * Usage:
 *   node scripts/sign-round.mjs --round <roundId> --rpc <rpcUrl> --beacon <address>
 *   node scripts/sign-round.mjs --digest <0x...32bytes>
 *
 * Output: prints the 192-byte hex signature to stdout for use with cast or forge.
 *
 * Requires: @noble/curves, viem
 *   npm install -g @noble/curves
 *   npm install (project deps include viem)
 */

import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, hexToBytes } from "viem";

const __dir = dirname(fileURLToPath(import.meta.url));
const dkgFile = resolve(__dir, "../.dkg/epoch-1.json");

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const roundId  = get("--round");
const rpcUrl   = get("--rpc")    ?? "https://rpc.mainnet.chain.robinhood.com";
const beacon   = get("--beacon");
let   digest   = get("--digest");

if (!digest && (!roundId || !beacon)) {
  console.error("Usage: sign-round.mjs --digest <hex32>  OR  --round <id> --beacon <addr> [--rpc <url>]");
  process.exit(1);
}

const epoch = JSON.parse(readFileSync(dkgFile, "utf8"));

if (!digest) {
  const client = createPublicClient({ transport: http(rpcUrl) });
  digest = await client.readContract({
    address: beacon,
    abi: [{ name: "roundDigest", type: "function", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" }],
    functionName: "roundDigest",
    args: [BigInt(roundId)],
  });
  console.error("Digest:", digest);
}

const digestBytes = hexToBytes(digest);

// Sign with master private key (all 7 operators controlled by deployer).
const masterPriv = epoch.masterPrivateKey.replace("0x", "");
const sig = await bls.sign(digestBytes, masterPriv);

const sigHex = "0x" + Buffer.from(sig).toString("hex");
console.log(sigHex);
