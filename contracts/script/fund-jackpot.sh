#!/bin/bash
# Top up the StockPackz jackpot from the rewards wallet.
#
# Usage:  ./fund-jackpot.sh <amount-usd> <private-key-or-account>
# Example: ./fund-jackpot.sh 500 --ledger        (hardware wallet)
#          ./fund-jackpot.sh 250 0xabc...        (raw key, use with care)
#
# Every top-up emits JackpotExternallyFunded — publicly auditable at
# https://robinhoodchain.blockscout.com/address/0xeee1458ad6deb8fa35f39fddbb1aaa12d4a422f3
set -euo pipefail

RPC=https://rpc.mainnet.chain.robinhood.com
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
CORE=0xeee1458ad6deb8fa35f39fddbb1aaa12d4a422f3

AMOUNT_USD="${1:?usage: fund-jackpot.sh <amount-usd> <key-args...>}"
shift
AMOUNT=$((AMOUNT_USD * 1000000)) # USDG has 6 decimals

echo "Approving $AMOUNT_USD USDG..."
cast send $USDG "approve(address,uint256)" $CORE $AMOUNT --rpc-url $RPC --private-key "$@"

echo "Funding jackpot with $AMOUNT_USD USDG..."
cast send $CORE "fundJackpot(uint256)" $AMOUNT --rpc-url $RPC --private-key "$@"

echo "Done. New jackpot balance:"
BAL=$(cast call $CORE "jackpotBalance()(uint256)" --rpc-url $RPC | awk '{print $1}')
echo "  \$$(echo "scale=2; $BAL/1000000" | bc) USDG"
