import { describe, expect, it } from "vitest";
import { derivePrivatePaymentFields } from "@/server/services/payment";

describe("derivePrivatePaymentFields", () => {
  it("uses sold date as due date for CD", () => {
    const result = derivePrivatePaymentFields({
      soldDate: "2026-02-24",
      paymentTerm: "CD",
      paymentReceivedDate: "2026-02-24"
    });

    expect(result.dueDate).toBe("2026-02-24");
    expect(result.daysDelayed).toBe(0);
  });

  it("adds payment days for DUE", () => {
    const result = derivePrivatePaymentFields({
      soldDate: "2026-02-24",
      paymentTerm: "DUE",
      paymentTermDays: 7,
      paymentReceivedDate: "2026-03-05"
    });

    expect(result.dueDate).toBe("2026-03-03");
    expect(result.daysDelayed).toBe(2);
  });
});
