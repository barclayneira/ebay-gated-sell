/**
 * Thin Sell Inventory client.
 * Reads stay useful without a gate. Writes that make or change a live listing
 * are not exposed here. index.ts calls publish and withdraw only after the gate.
 *
 * eBay flow for one listing:
 *   1. createOrReplaceInventoryItem
 *   2. createOffer          (unpublished — not on the site yet)
 *   3. publishOffer         (this is the live call)
 * Revise of a published offer is updateOffer. Withdraw is withdrawOffer.
 */

const API = "https://api.ebay.com";

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
}

export class EbaySell {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;

  constructor(private readonly config: EbayConfig) {}

  async upsertItem(sku: string, body: unknown): Promise<unknown> {
    return this.request("PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, body);
  }

  async createOffer(body: unknown): Promise<unknown> {
    return this.request("POST", "/sell/inventory/v1/offer", body);
  }

  async publishOffer(offerId: string): Promise<unknown> {
    return this.request("POST", `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`);
  }

  async withdrawOffer(offerId: string): Promise<unknown> {
    return this.request("POST", `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`);
  }

  async updateOffer(offerId: string, body: unknown): Promise<unknown> {
    return this.request("PUT", `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, body);
  }

  private async request(method: string, pathname: string, body?: unknown): Promise<unknown> {
    const token = await this.token();
    const response = await fetch(`${API}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
        "X-EBAY-C-MARKETPLACE-ID": this.config.marketplaceId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`eBay ${method} ${pathname} failed (${response.status}): ${text}`);
    }
    return parsed;
  }

  /** User token. An application token cannot publish, so we do not fall back to one. */
  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessExpiresAt - 60_000) return this.accessToken;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const response = await fetch(`${API}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken,
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`eBay token refresh failed (${response.status}): ${text}`);
    const json = JSON.parse(text) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.accessExpiresAt = Date.now() + json.expires_in * 1000;
    return json.access_token;
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv): EbayConfig {
  const clientId = required(env, "EBAY_CLIENT_ID");
  const clientSecret = required(env, "EBAY_CLIENT_SECRET");
  const refreshToken = required(env, "EBAY_REFRESH_TOKEN");
  return {
    clientId,
    clientSecret,
    refreshToken,
    marketplaceId: env.EBAY_MARKETPLACE_ID || "EBAY_US",
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is missing. See .env.example. Do not paste it into chat.`);
  return value;
}
