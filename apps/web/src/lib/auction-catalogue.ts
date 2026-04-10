type CatalogueActionRow = {
  payload: Record<string, unknown> | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseSaleNo(payload: Record<string, unknown> | null): string {
  return normalizeText(payload?.sale_no) || normalizeText(payload?.target_sale_no) || "-";
}

export function resolveCatalogueSaleNo(actions: CatalogueActionRow[]): string {
  for (const action of actions) {
    const saleNo = parseSaleNo(action.payload ?? null);
    if (saleNo !== "-") return saleNo;
  }
  return "-";
}
