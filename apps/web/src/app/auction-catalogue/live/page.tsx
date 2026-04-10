import { AppShell } from "@/components/app-shell";
import { AuctionSaleDeskClient } from "@/components/auction-sale-desk-client";

type PageSearchParams = Promise<{
  auctionCentre?: string | string[];
  saleNo?: string | string[];
}>;

function readSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }
  return String(value ?? "").trim();
}

export default async function AuctionSaleLivePage({ searchParams }: { searchParams: PageSearchParams }) {
  const resolvedSearchParams = await searchParams;
  const auctionCentre = readSingleValue(resolvedSearchParams.auctionCentre);
  const saleNo = readSingleValue(resolvedSearchParams.saleNo);

  return (
    <AppShell title="Live Auction Sale Desk">
      {auctionCentre && saleNo ? (
        <AuctionSaleDeskClient auctionCentre={auctionCentre} saleNo={saleNo} />
      ) : (
        <div>Please open the sale desk from the auction catalogue with a valid auction centre and sale number.</div>
      )}
    </AppShell>
  );
}
