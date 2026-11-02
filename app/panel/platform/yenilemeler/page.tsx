import { notFound, redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

/*
  YENİLEME TAKVİMİ ABONELİKLER'E TAŞINDI (02.11.2026, kurum sahibinin
  isteği): dönemi dolan abonelikler üç yerde listeleniyordu. Takvim artık
  Abonelikler'in sekmesi (billing/yenileme-takvimi.tsx). Adres
  yönlendirme olarak kalıyor: eski bağlantılar ve yer imleri kırılmasın.
*/
export default async function EskiYenilemeSayfasi({ searchParams }: { searchParams: Promise<{ gorunum?: string }> }) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { gorunum } = await searchParams;
  redirect(gorunum === "dikkat" ? "/panel/platform/billing?gorunum=takvim&filtre=dikkat" : "/panel/platform/billing?gorunum=takvim");
}
