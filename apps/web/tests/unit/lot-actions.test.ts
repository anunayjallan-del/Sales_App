import { describe, expect, it } from "vitest";
import {
  applyActionToStatuses,
  isConflictPromptTypeCompatible,
  isActionAllowedForStatuses,
  normalizeConflictPromptTypeForAudit,
  parseActionPayload,
  replayStatusesFromActions,
  resolveConflictPromptType,
  shouldRequireConflictAck
} from "@/server/services/lot-actions";

describe("lot-actions lane model", () => {
  it("keeps auction status when private negotiation starts", () => {
    const next = applyActionToStatuses("NEGOTIATING", ["IN_TRANSIT"]);
    expect(next.nextStatuses).toEqual(expect.arrayContaining(["IN_TRANSIT", "NEGOTIATING"]));
  });

  it("does not allow dispatch to auction from in-transit even if private is negotiating", () => {
    expect(isActionAllowedForStatuses("DISPATCH_TO_AUCTION", ["IN_TRANSIT", "NEGOTIATING"])).toBe(false);
  });

  it("allows withdraw from early auction stages", () => {
    expect(isActionAllowedForStatuses("WITHDRAW", ["PENDING_AUCTION_DISPATCH"])).toBe(true);
    expect(isActionAllowedForStatuses("WITHDRAW", ["IN_TRANSIT"])).toBe(true);
    expect(isActionAllowedForStatuses("WITHDRAW", ["AWR_PENDING"])).toBe(true);
    expect(isActionAllowedForStatuses("WITHDRAW", ["AWR_RECEIVED"])).toBe(true);
  });

  it("requires conflict ack for private progression while auction is active", () => {
    expect(shouldRequireConflictAck("SOLD_PENDING_DISPATCH", "IN_TRANSIT")).toBe(true);
    expect(shouldRequireConflictAck("SOLD_PENDING_DISPATCH", "AWR_RECEIVED")).toBe(true);
    expect(resolveConflictPromptType("IN_TRANSIT")).toBe("EARLY_STAGE_GUIDANCE");
    expect(resolveConflictPromptType("AWR_PENDING")).toBe("MIDDLE_STAGE_1_GUIDANCE");
    expect(resolveConflictPromptType("AWR_RECEIVED")).toBe("LATER_STAGE_GUIDANCE");
    expect(resolveConflictPromptType("CATALOGUED")).toBe("LATER_STAGE_GUIDANCE");
    expect(shouldRequireConflictAck("NEGOTIATING", "IN_TRANSIT")).toBe(false);
  });

  it("clears private lane when sold in auction", () => {
    const next = applyActionToStatuses("SOLD_AUCTION", ["RESERVE_SET", "SOLD_PENDING_DISPATCH"]);
    expect(next.nextStatuses).toEqual(["SOLD_AUCTION"]);
  });

  it("moves live-sold auction lots into pending details before finalization", () => {
    const next = applyActionToStatuses("SOLD_AUCTION_LIVE", ["REPRINT", "NEGOTIATING"]);
    expect(next.resultingStatus).toBe("SOLD_AUCTION_PENDING_DETAILS");
    expect(next.nextStatuses).toEqual(["SOLD_AUCTION_PENDING_DETAILS"]);
    expect(isActionAllowedForStatuses("SOLD_AUCTION_LIVE", ["CATALOGUED"])).toBe(true);
    expect(isActionAllowedForStatuses("SOLD_AUCTION_LIVE", ["RESERVE_SET"])).toBe(true);
    expect(isActionAllowedForStatuses("SOLD_AUCTION_LIVE", ["REPRINT"])).toBe(true);
  });

  it("finalizes sold auction only from pending details", () => {
    expect(isActionAllowedForStatuses("FINALIZE_SOLD_AUCTION", ["SOLD_AUCTION_PENDING_DETAILS"])).toBe(true);
    expect(isActionAllowedForStatuses("FINALIZE_SOLD_AUCTION", ["CATALOGUED"])).toBe(false);

    const next = applyActionToStatuses("FINALIZE_SOLD_AUCTION", ["SOLD_AUCTION_PENDING_DETAILS"]);
    expect(next.resultingStatus).toBe("SOLD_AUCTION");
    expect(next.nextStatuses).toEqual(["SOLD_AUCTION"]);
  });

  it("replays action history into dual-lane state", () => {
    const statuses = replayStatusesFromActions([
      { id: "1", action: "DISPATCH_TO_AUCTION", performed_at: "2026-01-01T00:00:00.000Z" },
      { id: "2", action: "AUCTION_DISPATCHED", performed_at: "2026-01-02T00:00:00.000Z" },
      { id: "3", action: "NEGOTIATING", performed_at: "2026-01-03T00:00:00.000Z" }
    ]);
    expect(statuses).toEqual(expect.arrayContaining(["IN_TRANSIT", "NEGOTIATING"]));
  });

  it("allows payment received for sold auction and sold private", () => {
    expect(isActionAllowedForStatuses("PAYMENT_RECEIVED", ["SOLD_AUCTION"])).toBe(true);
    expect(isActionAllowedForStatuses("PAYMENT_RECEIVED", ["SOLD"])).toBe(true);
    expect(isActionAllowedForStatuses("PAYMENT_RECEIVED", ["SOLD_AUCTION_PENDING_DETAILS"])).toBe(false);
  });

  it("restricts private progression by the requested matrix", () => {
    expect(isActionAllowedForStatuses("SOLD_PENDING_DISPATCH", ["NEGOTIATING"])).toBe(true);
    expect(isActionAllowedForStatuses("SOLD_PENDING_DISPATCH", ["SOLD_PENDING_DISPATCH"])).toBe(false);
    expect(isActionAllowedForStatuses("NEGOTIATING", ["SOLD_PENDING_DISPATCH"])).toBe(false);
    expect(isActionAllowedForStatuses("SOLD_PRIVATE", ["SOLD_PENDING_DISPATCH"])).toBe(true);
    expect(isActionAllowedForStatuses("NEGOTIATING", ["SOLD_AUCTION"])).toBe(false);
  });

  it("moves source lot to cancelled on reinvoiced", () => {
    const next = applyActionToStatuses("REINVOICED", ["NEGOTIATING"]);
    expect(next.resultingStatus).toBe("CANCELLED");
    expect(next.nextStatuses).toEqual(["CANCELLED"]);
    expect(isActionAllowedForStatuses("REINVOICED", ["NEGOTIATING"])).toBe(true);
    expect(isActionAllowedForStatuses("REINVOICED", ["CLOSED"])).toBe(false);
  });

  it("accepts multiple buyers for negotiating", () => {
    const multi = parseActionPayload("NEGOTIATING", {
      buyers: ["Party A", "Party B"],
      negotiation_date: "2026-02-10"
    });
    expect(multi.success).toBe(true);
    if (!multi.success) return;
    expect(multi.data.buyers).toEqual(["Party A", "Party B"]);
    expect(multi.data.negotiation_date).toBe("2026-02-10");

    const legacySingle = parseActionPayload("NEGOTIATING", {
      buyer: "Party C",
      negotiation_date: "2026-02-11"
    });
    expect(legacySingle.success).toBe(true);
    if (!legacySingle.success) return;
    expect(legacySingle.data.buyers).toEqual(["Party C"]);
    expect(legacySingle.data.negotiation_date).toBe("2026-02-11");
  });

  it("requires negotiation date for negotiating", () => {
    const missingDate = parseActionPayload("NEGOTIATING", {
      buyers: ["Party A"]
    });
    expect(missingDate.success).toBe(false);
  });

  it("allows reserve price action without point of contact", () => {
    const parsed = parseActionPayload("SET_RESERVE_PRICE", {
      reserve_price: 245,
      reserve_set_date: "2026-03-04"
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts live sold and finalize sold auction payloads", () => {
    const live = parseActionPayload("SOLD_AUCTION_LIVE", {
      sale_no: "12",
      sale_date: "2026-03-22",
      buyer_name: "Buyer A",
      hammer_price: 405
    });
    expect(live.success).toBe(true);

    const finalize = parseActionPayload("FINALIZE_SOLD_AUCTION", {
      settlement_due_date: "2026-03-29"
    });
    expect(finalize.success).toBe(true);
  });

  it("does not treat pending-details as auction-active for private conflict prompts", () => {
    expect(shouldRequireConflictAck("SOLD_PENDING_DISPATCH", "SOLD_AUCTION_PENDING_DETAILS")).toBe(false);
  });

  it("accepts legacy conflict prompt types temporarily", () => {
    expect(isConflictPromptTypeCompatible("CANCEL_PRINTING_GUIDANCE", "EARLY_STAGE_GUIDANCE")).toBe(true);
    expect(isConflictPromptTypeCompatible("CANCEL_PRINTING_GUIDANCE", "MIDDLE_STAGE_1_GUIDANCE")).toBe(true);
    expect(isConflictPromptTypeCompatible("WITHDRAW_GUIDANCE", "MIDDLE_STAGE_2_GUIDANCE")).toBe(true);
    expect(isConflictPromptTypeCompatible("WITHDRAW_GUIDANCE", "LATER_STAGE_GUIDANCE")).toBe(true);
    expect(normalizeConflictPromptTypeForAudit("CANCEL_PRINTING_GUIDANCE", null)).toBe("EARLY_STAGE_GUIDANCE");
    expect(normalizeConflictPromptTypeForAudit("WITHDRAW_GUIDANCE", null)).toBe("LATER_STAGE_GUIDANCE");
  });
});
