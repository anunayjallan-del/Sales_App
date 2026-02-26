import { describe, expect, it } from "vitest";
import {
  lifecycleToLegacyMasterStatus,
  resolveLifecycleStatus,
  shouldPromptAutoWithdraw
} from "@/server/services/status-engine";

describe("resolveLifecycleStatus", () => {
  it("prioritizes SOLD_PENDING_DISPATCH over auction sold", () => {
    const result = resolveLifecycleStatus({
      isCancelled: false,
      privateStatuses: ["SOLD_PENDING_DISPATCH"],
      auctionStatus: "SOLD_AUCTION"
    });
    expect(result).toBe("SOLD_PENDING_DISPATCH");
  });

  it("returns PENDING when no closure signals", () => {
    const result = resolveLifecycleStatus({ isCancelled: false, privateStatuses: [], auctionStatus: null });
    expect(result).toBe("PENDING");
  });

  it("returns CANCELLED when lot is cancelled regardless of other statuses", () => {
    const result = resolveLifecycleStatus({
      isCancelled: true,
      privateStatuses: ["SOLD_PENDING_DISPATCH"],
      auctionStatus: "SOLD_AUCTION"
    });
    expect(result).toBe("CANCELLED");
  });
});

describe("lifecycleToLegacyMasterStatus", () => {
  it("maps PENDING and CANCELLED to ACTIVE legacy value", () => {
    expect(lifecycleToLegacyMasterStatus("PENDING")).toBe("ACTIVE");
    expect(lifecycleToLegacyMasterStatus("CANCELLED")).toBe("ACTIVE");
  });
});

describe("shouldPromptAutoWithdraw", () => {
  it("returns true for sold pending dispatch with active auction status", () => {
    expect(
      shouldPromptAutoWithdraw({
        nextPrivateStatus: "SOLD_PENDING_DISPATCH",
        auctionStatus: "AWR_PENDING"
      })
    ).toBe(true);
  });

  it("returns false when deal is not sold pending dispatch", () => {
    expect(
      shouldPromptAutoWithdraw({
        nextPrivateStatus: "NEGOTIATING",
        auctionStatus: "AWR_PENDING"
      })
    ).toBe(false);
  });
});
