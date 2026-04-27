import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { mapRowsToLotStructural, parseXlsxLots } from "@/server/services/xlsx-import";

describe("mapRowsToLotStructural", () => {
  it("maps and normalizes structural fields", () => {
    const rows = mapRowsToLotStructural([
      {
        Mark: " MK-1 ",
        "Invoice Number": " INV-22 ",
        Grade: "BOP",
        "Number of Bags": 10,
        "Net Weight": 510,
        Factory: "North Unit",
        "Date Created": "2026-02-24",
        Cancelled: "false"
      }
    ]);

    expect(rows[0].mark).toBe("MK-1");
    expect(rows[0].invoice_number).toBe("INV-22");
    expect(rows[0].is_cancelled).toBe(false);
  });

  it("keeps one lot record and marks cancelled when a reversal row exists", () => {
    const rows = mapRowsToLotStructural([
      {
        Mark: "Abhoyjan",
        "Invoice Number": "UKD0005",
        Grade: "BOP",
        "Number of Bags": 10,
        "Net Weight": 400,
        "Date Created": "2026-01-10"
      },
      {
        Mark: "Abhoyjan",
        "Invoice Number": "UKD0005",
        Grade: "BOP",
        "Number of Bags": 10,
        "Net Weight": -400,
        "Date Created": "2026-01-10"
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].mark).toBe("Abhoyjan");
    expect(rows[0].invoice_number).toBe("UKD0005");
    expect(rows[0].net_weight_kg).toBe(400);
    expect(rows[0].is_cancelled).toBe(true);
  });

  it("derives factory from mark when factory is missing", () => {
    const rows = mapRowsToLotStructural([
      {
        Mark: "Furkating Select",
        "Invoice Number": "C1234",
        Grade: "BOP",
        "Number of Bags": 5,
        "Net Weight": 180,
        "Date Created": "2026-02-01"
      }
    ]);

    expect(rows[0].factory).toBe("Furkating");
  });
});

describe("parseXlsxLots", () => {
  it("parses packing register format headers", () => {
    const aoa = [
      [null, null, null],
      [null, "Packing Register by Lot No."],
      [null],
      [null, "Teamark", "Lot No.", "Grade", "Packdate", null, null, null, null, null, "Kg/Bag", "Bags", "Lot Kgs"],
      [null, "FURKATING", "C0001", "BOP(SM)", new Date("2025-03-08"), null, 1, 7, "PP", null, 36, 7, 252]
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Packing");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    const parsed = parseXlsxLots(buffer);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.validRows[0]["Invoice Number"]).toBe("C0001");
    expect(parsed.validRows[0]["Number of Bags"]).toBe(7);
    expect(parsed.validRows[0]["Net Weight"]).toBe(252);
  });
});

type LotStructuralRow = {
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  factory: string | null;
  date_created: string;
  is_cancelled: boolean;
};

function buildStructuralRow(overrides: Partial<LotStructuralRow> = {}): LotStructuralRow {
  return {
    mark: overrides.mark ?? "ABHOYJAN",
    invoice_number: overrides.invoice_number ?? "INV-1001",
    grade: overrides.grade ?? "BOP",
    bags: overrides.bags ?? 10,
    net_weight_kg: overrides.net_weight_kg ?? 360,
    factory: overrides.factory ?? "Abhoyjan",
    date_created: overrides.date_created ?? "2026-04-01",
    is_cancelled: overrides.is_cancelled ?? false
  };
}

async function loadLotsRepoWithSupabaseMock(writeKinds: Array<"CREATED" | "UPDATED">) {
  vi.resetModules();
  let callIndex = 0;
  const rpc = vi.fn(async () => ({
    data: [{ lot_id: `lot-${callIndex + 1}`, write_kind: writeKinds[callIndex++] ?? "UPDATED" }],
    error: null
  }));
  const from = vi.fn();

  vi.doMock("@/lib/supabase", () => ({
    getSupabaseAdmin: () => ({ rpc, from })
  }));

  const lotsRepo = await import("@/server/repositories/lots-repo");
  return { lotsRepo, rpc, from };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("slice-1 import safety wiring", () => {
  it("existing active lot import does not reset status rows in app code", async () => {
    const { lotsRepo, rpc, from } = await loadLotsRepoWithSupabaseMock(["UPDATED"]);
    const row = buildStructuralRow({ is_cancelled: false });

    const result = await lotsRepo.upsertLotStructuralViaRpc([row]);

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "slice1_safe_upsert_lot_structural",
      expect.objectContaining({
        p_mark: row.mark,
        p_invoice_number: row.invoice_number
      })
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("existing cancelled lot import does not directly change is_cancelled in app code", async () => {
    const { lotsRepo, rpc, from } = await loadLotsRepoWithSupabaseMock(["UPDATED"]);
    const row = buildStructuralRow({ is_cancelled: true });

    await lotsRepo.upsertLotStructuralViaRpc([row]);

    expect(rpc).toHaveBeenCalledWith(
      "slice1_safe_upsert_lot_structural",
      expect.objectContaining({
        p_is_cancelled: true
      })
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("existing lot import does not create new status events in app code", async () => {
    const { lotsRepo, from } = await loadLotsRepoWithSupabaseMock(["UPDATED", "UPDATED"]);

    await lotsRepo.upsertLotStructuralViaRpc([
      buildStructuralRow({ invoice_number: "INV-2001" }),
      buildStructuralRow({ invoice_number: "INV-2002" })
    ]);

    expect(from).not.toHaveBeenCalled();
  });

  it("new lot import still goes through RPC create path for initial status/event ownership", async () => {
    const { lotsRepo, rpc, from } = await loadLotsRepoWithSupabaseMock(["CREATED"]);

    const result = await lotsRepo.upsertLotStructuralViaRpc([buildStructuralRow({ invoice_number: "INV-NEW-1" })]);

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("dry-run import does not call structural upsert writes", async () => {
    vi.resetModules();
    const requireRole = vi.fn(async () => ({ userId: "dev-user", role: "admin" }));
    const createSyncRun = vi.fn(async () => ({ id: "run-1" }));
    const insertSyncErrors = vi.fn(async () => undefined);
    const updateSyncRun = vi.fn(async () => undefined);
    const upsertLotStructuralViaRpc = vi.fn(async () => ({ created: 1, updated: 0 }));
    const parseXlsxLots = vi.fn(() => ({
      validRows: [
        {
          Mark: "ABHOYJAN",
          "Invoice Number": "INV-DRY-1",
          Grade: "BOP",
          "Number of Bags": 10,
          "Net Weight": 360,
          Factory: "Abhoyjan",
          "Date Created": "2026-04-01"
        }
      ],
      errors: []
    }));
    const mapRowsToLotStructural = vi.fn(() => [buildStructuralRow()]);

    vi.doMock("@/lib/authz", () => ({ requireRole }));
    vi.doMock("@/server/repositories/lots-repo", () => ({
      createSyncRun,
      insertSyncErrors,
      updateSyncRun,
      upsertLotStructuralViaRpc
    }));
    vi.doMock("@/server/services/xlsx-import", () => ({
      parseXlsxLots,
      mapRowsToLotStructural
    }));

    const { POST } = await import("@/app/api/import/xlsx/route");
    const formData = new FormData();
    formData.set("mode", "dry-run");
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "lots.xlsx"));

    const response = await POST(new Request("http://localhost/api/import/xlsx", { method: "POST", body: formData }) as never);
    const payload = await response.json();

    expect(upsertLotStructuralViaRpc).not.toHaveBeenCalled();
    expect(updateSyncRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "COMPLETED",
        error_count: 0
      })
    );
    expect(payload.counts).toEqual({
      total: 1,
      valid: 1,
      errors: 0
    });
  });
});
