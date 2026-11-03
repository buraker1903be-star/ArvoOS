import { KonusmaGorunumu } from "../konusma-gorunumu";
import "../../crm/kayit-detay/kayit-detay.css";
import "../posta.css";

/*
  KONUŞMA EKRANI (tam ekran). Çizim konusma-gorunumu.tsx'te: aynı
  bileşen gelen kutusunun okuma bölmesinde de kullanılıyor.
*/

export const dynamic = "force-dynamic";

export default async function KonusmaPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  return <main className="talep cari posta-konusma"><KonusmaGorunumu threadId={threadId} /></main>;
}
