import * as XLSX from "xlsx";
import { z } from "zod";

const rowSchema = z.object({
  Mark: z.string().min(1),
  "Invoice Number": z.string().min(1),
  Grade: z.string().min(1),
  "Number of Bags": z.coerce.number().int().nonnegative(),
  "Net Weight": z.coerce.number(),
  Factory: z.string().optional(),
  "Date Created": z.string().min(1),
  Cancelled: z.union([z.string(), z.boolean()]).optional()
});

export type ImportRow = z.infer<typeof rowSchema>;

const templateHeaderMap: Record<string, keyof ImportRow> = {
  mark: "Mark",
  invoicenumber: "Invoice Number",
  grade: "Grade",
  numberofbags: "Number of Bags",
  netweight: "Net Weight",
  factory: "Factory",
  datecreated: "Date Created",
  cancelled: "Cancelled"
};

const packingHeaderMap: Record<string, keyof ImportRow> = {
  teamark: "Mark",
  lotno: "Invoice Number",
  grade: "Grade",
  packdate: "Date Created",
  bags: "Number of Bags",
  lotkgs: "Net Weight"
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMark(value: string): string {
  return value.trim().toUpperCase();
}

function deriveFactory(mark: string): string | null {
  const normalized = normalizeMark(mark);
  if (normalized === "ABHOYJAN" || normalized === "ABHOYBARII") return "Abhoyjan";
  if (normalized === "FURKATING" || normalized === "FURKATING SELECT" || normalized === "ALL MY TEA") {
    return "Furkating";
  }
  return null;
}

function isTruthyCancelled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "y" || v === "1";
  }
  return false;
}

function dateToIso(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }

  return String(value ?? "").trim();
}

function isLikelyHeaderRow(row: unknown[], headerMap: Record<string, keyof ImportRow>, required: string[]) {
  const normalized = row.map(normalizeHeader);
  const keys = new Set(Object.keys(headerMap));
  const present = normalized.filter((cell) => keys.has(cell));
  if (!present.length) return false;
  return required.every((r) => present.includes(r));
}

function mapRowByHeader(
  row: unknown[],
  headers: unknown[],
  headerMap: Record<string, keyof ImportRow>
): Partial<ImportRow> {
  const canonical: Partial<ImportRow> = {};
  headers.forEach((headerCell, index) => {
    const key = headerMap[normalizeHeader(headerCell)];
    if (!key) return;
    const value = row[index];
    if (value === undefined || value === null) return;
    if (key === "Date Created") {
      canonical[key] = dateToIso(value);
    } else {
      canonical[key] = value as never;
    }
  });
  return canonical;
}

export function parseXlsxLots(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });

  const validRows: ImportRow[] = [];
  const errors: Array<{ row_number: number; message: string }> = [];
  const requiredTemplateHeaders = ["mark", "invoicenumber", "grade", "numberofbags", "netweight", "datecreated"];
  const requiredPackingHeaders = ["teamark", "lotno", "grade", "packdate", "bags", "lotkgs"];

  let headerIndex = -1;
  let activeHeaderMap = templateHeaderMap;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (isLikelyHeaderRow(row, templateHeaderMap, requiredTemplateHeaders)) {
      headerIndex = i;
      activeHeaderMap = templateHeaderMap;
      break;
    }
    if (isLikelyHeaderRow(row, packingHeaderMap, requiredPackingHeaders)) {
      headerIndex = i;
      activeHeaderMap = packingHeaderMap;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      validRows: [],
      errors: [
        {
          row_number: 1,
          message:
            "Could not detect import headers. Expected either template headers (Mark, Invoice Number...) or packing headers (Teamark, Lot No., Packdate, Bags, Lot Kgs)."
        }
      ]
    };
  }

  const headers = rows[headerIndex] ?? [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const canonical = mapRowByHeader(row, headers, activeHeaderMap);

    const isEmptyRow =
      !canonical.Mark &&
      !canonical["Invoice Number"] &&
      !canonical.Grade &&
      (canonical["Number of Bags"] === undefined || canonical["Number of Bags"] === null) &&
      (canonical["Net Weight"] === undefined || canonical["Net Weight"] === null);
    if (isEmptyRow) continue;

    const mark = String(canonical.Mark ?? "").trim();
    const invoice = String(canonical["Invoice Number"] ?? "").trim();
    const bags = Number(canonical["Number of Bags"] ?? Number.NaN);
    const netWeight = Number(canonical["Net Weight"] ?? Number.NaN);
    // Report-format sheets can include subtotal/footer rows; skip rows that do not resemble a lot record.
    if (!mark || !invoice || !Number.isFinite(bags) || !Number.isFinite(netWeight)) {
      continue;
    }

    const parsed = rowSchema.safeParse(canonical);
    if (!parsed.success) {
      errors.push({
        row_number: i + 1,
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
      });
      continue;
    }
    validRows.push(parsed.data);
  }

  return { validRows, errors };
}

export function mapRowsToLotStructural(rows: ImportRow[]) {
  const grouped = new Map<
    string,
    {
      first: ImportRow;
      firstPositive: ImportRow | null;
      hasNegativeWeight: boolean;
      hasCancelledFlag: boolean;
    }
  >();

  for (const row of rows) {
    const mark = row.Mark.trim();
    const invoice = row["Invoice Number"].trim();
    const key = `${normalizeMark(mark)}|||${invoice.toUpperCase()}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        first: row,
        firstPositive: row["Net Weight"] > 0 ? row : null,
        hasNegativeWeight: row["Net Weight"] < 0,
        hasCancelledFlag: isTruthyCancelled(row.Cancelled)
      });
      continue;
    }

    if (!existing.firstPositive && row["Net Weight"] > 0) {
      existing.firstPositive = row;
    }
    if (row["Net Weight"] < 0) existing.hasNegativeWeight = true;
    if (isTruthyCancelled(row.Cancelled)) existing.hasCancelledFlag = true;
  }

  return Array.from(grouped.values()).map((entry) => {
    const base = entry.firstPositive ?? entry.first;
    const positiveNetWeight = entry.firstPositive
      ? entry.firstPositive["Net Weight"]
      : Math.abs(base["Net Weight"]);
    const factoryFromFile = base.Factory?.trim() || null;
    const derivedFactory = deriveFactory(base.Mark);

    return {
      mark: base.Mark.trim(),
      invoice_number: base["Invoice Number"].trim(),
      grade: base.Grade.trim(),
      bags: Math.abs(base["Number of Bags"]),
      net_weight_kg: Math.abs(positiveNetWeight),
      factory: derivedFactory ?? factoryFromFile,
      date_created: base["Date Created"],
      is_cancelled: entry.hasCancelledFlag || entry.hasNegativeWeight
    };
  });
}
