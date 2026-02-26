import { describe, expect, it } from "vitest";
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
