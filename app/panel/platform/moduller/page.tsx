import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

/*
  MODÜL MATRİSİ ÜRÜNLER'E TAŞINDI (02.11.2026, kurum sahibinin isteği):
  matris artık Ürünler'in "Modül matrisi" sekmesi (urunler/modul-matrisi.tsx).
  Adres yönlendirme olarak kalıyor: eski bağlantılar ve yer imleri kırılmasın.
*/
export default async function EskiModulSayfasi({ searchParams }: { searchParams: Promise<{ suzgec?: string }> }) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { suzgec } = await searchParams;
  const ek = suzgec === "kapali" || suzgec === "bagimsiz" ? `&suzgec=${suzgec}` : "";
  redirect(`/panel/platform/urunler?gorunum=moduller${ek}`);
}
