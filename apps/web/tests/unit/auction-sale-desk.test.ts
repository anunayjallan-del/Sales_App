import { describe, expect, it } from "vitest";
import {
  mergeFinalizedSoldAuctionPayload,
  resolveCommittedSaleResult,
  validateAuctionSaleLiveCommit
} from "@/server/services/auction-sale-desk";
import { parseActionPayload } from "@/server/services/lot-actions";

describe("auction sale desk helpers", () => {
  it("rejects partial sale submissions", () => {
    const result = validateAuctionSaleLiveCommit({
      sale_date: "2026-03-22",
      eligible_lot_ids: ["lot-1", "lot-2"],
      rows: [
        {
          lot_id: "lot-1",
          result: "SOLD",
          buyer_name: "Buyer A",
          hammer_price: 400
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Lot lot-2: missing staged result.");
  });

  it("rejects missing sold buyer or hammer price", () => {
    const result = validateAuctionSaleLiveCommit({
      sale_date: "2026-03-22",
      eligible_lot_ids: ["lot-1"],
      rows: [
        {
          lot_id: "lot-1",
          result: "SOLD",
          hammer_price: 400
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Lot lot-1: buyer name is required for sold rows.");
  });

  it("rejects missing out price", () => {
    const result = validateAuctionSaleLiveCommit({
      sale_date: "2026-03-22",
      eligible_lot_ids: ["lot-1"],
      rows: [
        {
          lot_id: "lot-1",
          result: "OUT"
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain("Lot lot-1: out price must be 0 or greater.");
  });

  it("merges live-sold payload with finalize overrides into a full sold payload", () => {
    const merged = mergeFinalizedSoldAuctionPayload(
      {
        sale_no: "12",
        sale_date: "2026-03-22",
        buyer_name: "Buyer A",
        hammer_price: 405
      },
      {
        settlement_due_date: "2026-03-29",
        buyer_name: "Buyer B"
      }
    );

    const parsed = parseActionPayload("SOLD_AUCTION", merged);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.buyer_name).toBe("Buyer B");
    expect(parsed.data.hammer_price).toBe(405);
    expect(parsed.data.settlement_due_date).toBe("2026-03-29");
  });

  it("resolves committed sale snapshots for out and live-sold rows", () => {
    const out = resolveCommittedSaleResult("OUT", [
      {
        id: "out-action",
        action: "OUT",
        payload: { sale_no: "12", out_date: "2026-03-22", out_price: 310 },
        performed_at: "2026-03-22T10:00:00.000Z"
      }
    ]);
    expect(out).toMatchObject({
      action_id: "out-action",
      action: "OUT",
      status: "OUT",
      sale_no: "12",
      out_date: "2026-03-22",
      out_price: 310
    });

    const liveSold = resolveCommittedSaleResult("SOLD_AUCTION_PENDING_DETAILS", [
      {
        id: "sold-live",
        action: "SOLD_AUCTION_LIVE",
        payload: { sale_no: "12", sale_date: "2026-03-22", buyer_name: "Buyer A", hammer_price: 405 },
        performed_at: "2026-03-22T10:00:00.000Z"
      }
    ]);
    expect(liveSold).toMatchObject({
      action_id: "sold-live",
      action: "SOLD_AUCTION_LIVE",
      status: "SOLD_AUCTION_PENDING_DETAILS",
      sale_no: "12",
      sale_date: "2026-03-22",
      buyer_name: "Buyer A",
      hammer_price: 405
    });
  });
});
