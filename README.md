# ebay-gated-sell

A small MCP server that lets a bot draft an eBay listing and will not publish it until a human signs the exact payload.

This is a sample, not an eBay product. It is not affiliated with eBay Inc. Their official reader stays separate: [`@ebay/npm-public-api-mcp`](https://github.com/eBay/npm-public-api-mcp) is GET-only on production, on purpose. This repo does not remove that check. Search stays on their server. Selling stays here, behind a gate.

## Why the gate exists

A connect card does three things: it names the action, it shows the scope, and the secret never enters the chat. This server copies that.

| Tool | Calls eBay? | Live on the site? |
|---|---|---|
| `draft_inventory_item` | yes, unpublished item | no |
| `draft_offer` | yes, unpublished offer | no |
| `propose_publish` / `propose_withdraw` | no | no |
| `approve_action` | no | no |
| `commit_publish` / `commit_withdraw` | yes | yes, only if the signed hash still matches |

`commit_publish` hashes the arguments it was just given and compares them to the card you approved. A bot that changes the price after you click approve gets a refusal, not a listing.

## What you create once

1. A production keyset at [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys). Sandbox is not the target.
2. A user refresh token from the [authorization-code grant](https://developer.ebay.com/api-docs/static/oauth-auth-code-grant-request.html) with `sell.inventory` and `sell.account`. An application token cannot publish.
3. A local env file, mode 600, from `.env.example`. Do not commit it. Do not paste it into chat.

```bash
cp .env.example ebay.env
chmod 600 ebay.env
npm install
npm run build
set -a && source ebay.env && set +a
node dist/index.js
```

MCP clients launch this over stdio. Point the client at `node /absolute/path/dist/index.js` and pass the env file. The process is the only one that should see the refresh token.

## Card shape

`propose_publish` returns a preview and a sha256. Show that preview to the human. Call `approve_action` with that hash only after they accept it. Then call `commit_publish` with the same fields. The sample cannot see your screen, so the consent card in your Grok client is the real gate. `approve_action` is the signature that card writes.

Pending cards live in `EBAY_GATE_DIR` (default `./data`). They are not secrets. Tokens are not written there.

## License

Apache-2.0. See `LICENSE`.
