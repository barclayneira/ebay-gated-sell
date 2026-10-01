import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { payloadHash } from "./hash.js";

/**
 * Local record of a card the human has or has not signed.
 * This directory is not a secret store. Tokens never land here.
 * One file per offer. Rewriting the draft invalidates the approval
 * because the stored hash no longer matches.
 */

export type CardAction = "publish" | "withdraw" | "revise";

export interface ApprovalCard {
  action: CardAction;
  offerId: string;
  /** Hash of the payload that will be sent if the human approves. */
  payloadHash: string;
  /** What the card shows. Same object that was hashed. */
  preview: Record<string, unknown>;
  createdAt: string;
  /** Set only by approve(). A bot must not write this field. */
  approvedAt?: string;
  approvedBy?: string;
}

export class GateStore {
  constructor(private readonly dir: string) {}

  async putPending(card: ApprovalCard): Promise<ApprovalCard> {
    await mkdir(this.dir, { recursive: true });
    const next: ApprovalCard = {
      action: card.action,
      offerId: card.offerId,
      payloadHash: card.payloadHash,
      preview: card.preview,
      createdAt: new Date().toISOString(),
    };
    await writeFile(this.path(card.offerId, card.action), JSON.stringify(next, null, 2));
    return next;
  }

  async approve(offerId: string, action: CardAction, hash: string, approvedBy: string): Promise<ApprovalCard> {
    const card = await this.read(offerId, action);
    if (card.payloadHash !== hash) {
      throw new Error("Refusing approval: hash does not match the pending card. Propose again.");
    }
    card.approvedAt = new Date().toISOString();
    card.approvedBy = approvedBy;
    await writeFile(this.path(offerId, action), JSON.stringify(card, null, 2));
    return card;
  }

  /**
   * Commit is allowed only when the human signed this exact payload.
   * Callers must pass the payload they are about to send, not a remembered hash.
   */
  async assertApproved(offerId: string, action: CardAction, payload: unknown): Promise<ApprovalCard> {
    const card = await this.read(offerId, action);
    const now = payloadHash(payload);
    if (!card.approvedAt) throw new Error("Refusing commit: card has not been approved.");
    if (card.payloadHash !== now) {
      throw new Error("Refusing commit: payload changed after approval. Propose again.");
    }
    return card;
  }

  private async read(offerId: string, action: CardAction): Promise<ApprovalCard> {
    const raw = await readFile(this.path(offerId, action), "utf8");
    return JSON.parse(raw) as ApprovalCard;
  }

  private path(offerId: string, action: CardAction): string {
    const safe = offerId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, `${safe}.${action}.json`);
  }
}
