#!/usr/bin/env node
/**
 * ebay-gated-sell
 *
 * A sample MCP server for people who want a bot to draft an eBay listing
 * and a human to be the only one who can make it live.
 *
 * Trust cut, on purpose:
 *   - draft tools write an unpublished offer. Nothing is for sale yet.
 *   - propose tools build a card and a sha256 of that card. They do not call eBay.
 *   - approve records a human signature of that hash. A bot can call it only if
 *     your client shows you the card first. The server cannot see your screen,
 *     so the sample treats "approve" as the human action. Wire it to the same
 *     consent card your other Grok tools use.
 *   - commit tools call publish, withdraw, or revise only if the signed hash
 *     still matches the payload about to be sent.
 *
 * This is not an eBay product. Their official MCP (@ebay/npm-public-api-mcp)
 * stays the reader. Do not fork it just to delete the GET-only check.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configFromEnv, EbaySell } from "./ebay.js";
import { payloadHash } from "./hash.js";
import { GateStore } from "./store.js";

const gate = new GateStore(process.env.EBAY_GATE_DIR || "./data");

function ebay(): EbaySell {
  return new EbaySell(configFromEnv(process.env));
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({
  name: "ebay-gated-sell",
  version: "0.1.0",
});

server.tool(
  "draft_inventory_item",
  "Create or replace an unpublished inventory item. Does not list it.",
  {
    sku: z.string(),
    product: z.object({ title: z.string(), description: z.string() }),
    condition: z.string().default("USED_EXCELLENT"),
    availability: z.object({ shipToLocationAvailability: z.object({ quantity: z.number().int().positive() }) }),
  },
  async (args) => text(await ebay().upsertItem(args.sku, args)),
);

server.tool(
  "draft_offer",
  "Create an unpublished offer. publishOffer has not been called. Nothing is live.",
  {
    sku: z.string(),
    marketplaceId: z.string().default("EBAY_US"),
    format: z.literal("FIXED_PRICE").default("FIXED_PRICE"),
    categoryId: z.string(),
    listingDescription: z.string(),
    availableQuantity: z.number().int().positive(),
    pricingSummary: z.object({ price: z.object({ value: z.string(), currency: z.string() }) }),
    listingPolicies: z.object({
      fulfillmentPolicyId: z.string(),
      paymentPolicyId: z.string(),
      returnPolicyId: z.string(),
    }),
    merchantLocationKey: z.string(),
  },
  async (args) => text(await ebay().createOffer(args)),
);

server.tool(
  "propose_publish",
  "Build the approval card for a live listing. Does not call eBay.",
  {
    offerId: z.string(),
    title: z.string(),
    price: z.string(),
    currency: z.string().default("USD"),
    quantity: z.number().int().positive(),
    categoryId: z.string(),
  },
  async (args) => {
    const preview = { action: "publish", ...args };
    const card = await gate.putPending({
      action: "publish",
      offerId: args.offerId,
      payloadHash: payloadHash(preview),
      preview,
      createdAt: "",
    });
    return text({
      card,
      next: "Show this card to the human. Call approve_action only after they accept this hash.",
    });
  },
);

server.tool(
  "propose_withdraw",
  "Build the approval card for ending a live listing. Does not call eBay.",
  { offerId: z.string(), reason: z.string() },
  async (args) => {
    const preview = { action: "withdraw", ...args };
    const card = await gate.putPending({
      action: "withdraw",
      offerId: args.offerId,
      payloadHash: payloadHash(preview),
      preview,
      createdAt: "",
    });
    return text({ card, next: "Human must approve this hash before commit_withdraw." });
  },
);

server.tool(
  "approve_action",
  "Human signature. Call this only from the consent card, not from an unattended bot.",
  {
    offerId: z.string(),
    action: z.enum(["publish", "withdraw", "revise"]),
    payloadHash: z.string(),
    approvedBy: z.string().default("human"),
  },
  async (args) => text(await gate.approve(args.offerId, args.action, args.payloadHash, args.approvedBy)),
);

server.tool(
  "commit_publish",
  "Publish the offer. Refuses unless approve_action signed this exact card.",
  {
    offerId: z.string(),
    title: z.string(),
    price: z.string(),
    currency: z.string().default("USD"),
    quantity: z.number().int().positive(),
    categoryId: z.string(),
  },
  async (args) => {
    const preview = { action: "publish", ...args };
    await gate.assertApproved(args.offerId, "publish", preview);
    return text(await ebay().publishOffer(args.offerId));
  },
);

server.tool(
  "commit_withdraw",
  "End the listing. Refuses unless approve_action signed this exact card.",
  { offerId: z.string(), reason: z.string() },
  async (args) => {
    const preview = { action: "withdraw", ...args };
    await gate.assertApproved(args.offerId, "withdraw", preview);
    return text(await ebay().withdrawOffer(args.offerId));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
