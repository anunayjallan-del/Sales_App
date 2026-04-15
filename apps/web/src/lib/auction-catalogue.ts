export type CatalogueActionRow = {
  payload: Record<string, unknown> | null;
};

export type CatalogueRow = {
  id: string;
  mark: string;
  invoice_number: string;
  grade: string;
  bags: number;
  net_weight_kg: number;
  date_created: string;
  auction_centre: string;
  sale_no: string;
  status: string;
  active_statuses?: string[];
  auction_lane_status?: string | null;
  private_lane_status?: string | null;
  is_sampled?: boolean;
  allowed_actions?: string[];
  reinvoiced_from_lot_id?: string | null;
  negotiating_buyers?: string[];
  last_negotiated_on?: string | null;
};

export type MarkGroup = {
  mark: string;
  rows: CatalogueRow[];
  totalBags: number;
  totalQuantity: number;
};

export type SaleGroup = {
  saleNo: string;
  markGroups: MarkGroup[];
  lotCount: number;
  markCount: number;
  totalBags: number;
  totalQuantity: number;
};

export type CentreGroup = {
  centre: string;
  saleGroups: SaleGroup[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseSaleNo(payload: Record<string, unknown> | null): string {
  return normalizeText(payload?.sale_no) || normalizeText(payload?.target_sale_no) || "-";
}

function normalizeSaleNo(value: string): string {
  return normalizeText(value) || "-";
}

function isNumericSaleNo(value: string): boolean {
  return /^\d+$/.test(value);
}

export function compareSaleNoDesc(left: string, right: string): number {
  const a = normalizeSaleNo(left);
  const b = normalizeSaleNo(right);

  if (a === "-" && b === "-") return 0;
  if (a === "-") return 1;
  if (b === "-") return -1;

  const aNumeric = isNumericSaleNo(a);
  const bNumeric = isNumericSaleNo(b);

  if (aNumeric && bNumeric) {
    return Number(b) - Number(a) || b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
  }

  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }

  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

export function resolveCatalogueSaleNo(actions: CatalogueActionRow[]): string {
  for (const action of actions) {
    const saleNo = parseSaleNo(action.payload ?? null);
    if (saleNo !== "-") return saleNo;
  }
  return "-";
}

export function groupCatalogueRows(rows: CatalogueRow[]): CentreGroup[] {
  const centreMap = new Map<string, Map<string, Map<string, CatalogueRow[]>>>();

  for (const row of rows) {
    const centre = normalizeText(row.auction_centre) || "-";
    const saleNo = normalizeSaleNo(row.sale_no);
    const mark = normalizeText(row.mark) || "-";

    const saleMap = centreMap.get(centre) ?? new Map<string, Map<string, CatalogueRow[]>>();
    const markMap = saleMap.get(saleNo) ?? new Map<string, CatalogueRow[]>();
    const lots = markMap.get(mark) ?? [];

    lots.push(row);
    markMap.set(mark, lots);
    saleMap.set(saleNo, markMap);
    centreMap.set(centre, saleMap);
  }

  return Array.from(centreMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([centre, saleMap]) => ({
      centre,
      saleGroups: Array.from(saleMap.entries())
        .sort((a, b) => compareSaleNoDesc(a[0], b[0]))
        .map(([saleNo, markMap]) => {
          const markGroups = Array.from(markMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mark, groupedRows]) => ({
              mark,
              rows: [...groupedRows].sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)),
              totalBags: groupedRows.reduce((sum, lot) => sum + Number(lot.bags ?? 0), 0),
              totalQuantity: groupedRows.reduce((sum, lot) => sum + Number(lot.net_weight_kg ?? 0), 0)
            }));

          return {
            saleNo,
            markGroups,
            lotCount: markGroups.reduce((sum, markGroup) => sum + markGroup.rows.length, 0),
            markCount: markGroups.length,
            totalBags: markGroups.reduce((sum, markGroup) => sum + markGroup.totalBags, 0),
            totalQuantity: markGroups.reduce((sum, markGroup) => sum + markGroup.totalQuantity, 0)
          };
        })
    }));
}

export function saleMatchesSearch(saleGroup: SaleGroup, query: string): boolean {
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) return true;

  if (saleGroup.saleNo.toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  return saleGroup.markGroups.some((markGroup) => markGroup.mark.toLowerCase().includes(normalizedQuery));
}

export function filterSaleGroups(saleGroups: SaleGroup[], query: string): SaleGroup[] {
  if (!normalizeText(query)) {
    return saleGroups;
  }

  return saleGroups.filter((saleGroup) => saleMatchesSearch(saleGroup, query));
}

export function resolveActiveCatalogueSelection(
  grouped: CentreGroup[],
  requestedCentre: string | null | undefined,
  requestedSaleNo: string | null | undefined
): { activeCentre: string | null; activeSaleNo: string | null } {
  if (!grouped.length) {
    return { activeCentre: null, activeSaleNo: null };
  }

  const preferredCentre = normalizeText(requestedCentre);
  const activeCentreGroup = grouped.find((group) => group.centre === preferredCentre) ?? grouped[0];
  const preferredSaleNo = normalizeSaleNo(requestedSaleNo ?? "");
  const activeSaleGroup =
    activeCentreGroup.saleGroups.find((saleGroup) => saleGroup.saleNo === preferredSaleNo) ?? activeCentreGroup.saleGroups[0] ?? null;

  return {
    activeCentre: activeCentreGroup?.centre ?? null,
    activeSaleNo: activeSaleGroup?.saleNo ?? null
  };
}
