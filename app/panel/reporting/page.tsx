import { redirect } from "next/navigation";

// Raporlar, Finans modülünün sekmesi oldu (/panel/finance/raporlar).
// Eski bağlantılar dönem filtresiyle birlikte yeni adrese gider.
export default async function ReportingRedirectPage({ searchParams }: { searchParams: Promise<{ aralik?: string; baslangic?: string; bitis?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.aralik) query.set("aralik", params.aralik);
  if (params.baslangic) query.set("baslangic", params.baslangic);
  if (params.bitis) query.set("bitis", params.bitis);
  redirect(`/panel/finance/raporlar${query.size ? `?${query.toString()}` : ""}`);
}
