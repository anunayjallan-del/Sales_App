import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lotsClientPath = path.resolve(process.cwd(), "src/components/lots-client.tsx");
const lotsClientSource = fs.readFileSync(lotsClientPath, "utf8");

describe("lots-client expected_lot_updated_at wiring", () => {
  it("requires expected lot timestamp for SAMPLING and NEGOTIATING only", () => {
    expect(lotsClientSource).toContain("const actionsRequiringExpectedLotUpdatedAt = new Set<ActionName>([\"SAMPLING\", \"NEGOTIATING\"])");
  });

  it("builds action request body with expected_lot_updated_at from resolved value", () => {
    expect(lotsClientSource).toContain("expected_lot_updated_at: expectedLotUpdatedAt || undefined");
  });

  it("passes expectedLotUpdatedAt through single-lot Manage Lot submission", () => {
    expect(lotsClientSource).toContain("const expectedLotUpdatedAt = resolveExpectedLotUpdatedAt(selectedAction, selectedLotRow.updated_at);");
    expect(lotsClientSource).toContain("expectedLotUpdatedAt: expectedLotUpdatedAt || undefined");
  });

  it("passes expectedLotUpdatedAt through bulk Manage Lot submission", () => {
    expect(lotsClientSource).toContain("const expectedLotUpdatedAt = resolveExpectedLotUpdatedAt(payload.action, lot.updated_at);");
    expect(lotsClientSource).toContain("if (actionRequiresExpectedLotUpdatedAt(payload.action) && !expectedLotUpdatedAt)");
  });
});
