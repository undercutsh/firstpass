#!/bin/bash
# One-time publish of server.json to the Official MCP Registry.
# Needs: mcp-publisher on PATH (https://github.com/modelcontextprotocol/registry/releases),
# the 1Password CLI signed in, and the ability to add one DNS TXT record on getundercut.sh.
# The private key lives only in 1Password; nothing secret is written to this repo.
#
#   1. Run with no args: generates a keypair, stores the private key in 1Password
#      (item "mcp-registry-getundercut-key", vault winter-family-safe), and prints the TXT record to add.
#   2. Add that TXT record at the root of getundercut.sh, wait for DNS.
#   3. Run with "publish": logs in over DNS and publishes.
set -euo pipefail
ITEM="mcp-registry-getundercut-key"; VAULT="winter-family-safe"; DOMAIN="getundercut.sh"
if [ "${1:-}" != "publish" ]; then
  KEY=$(openssl genpkey -algorithm Ed25519 -outform PEM)
  PUB=$(printf '%s' "$KEY" | openssl pkey -pubout -outform DER | tail -c 32 | base64)
  op item create --vault "$VAULT" --category password --title "$ITEM" "private_key[concealed]=$KEY" >/dev/null
  echo "Stored private key in 1Password item '$ITEM'."
  echo "Add this TXT record at the root of $DOMAIN, then run: $0 publish"
  echo "  v=MCPv1; k=ed25519; p=$PUB"
  exit 0
fi
PRIV_HEX=$(op read "op://$VAULT/$ITEM/private_key" | openssl pkey -outform DER | tail -c 32 | xxd -p -c 64)
mcp-publisher login dns --domain "$DOMAIN" --private-key "$PRIV_HEX"
mcp-publisher publish
