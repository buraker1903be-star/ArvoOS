import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { istanbulTarihSaat } from "../posta/bicim";

/*
  TALEBİN POSTA YAZIŞMASI.

  Bağ iki yönlü olmalıydı ama tek yönlü kalmıştı: posta ekranından
  müşteri kaydına gidiliyordu, kayıttan yazışmaya gidilemiyordu. "Bu
  müşteriye ne yazmıştık" sorusu CRM'de duruyor ve cevabı postadaydı.

  Modülü kapalı olana hiç çizilmiyor: boş bir başlık, olmayan bir
  yetkiyi varmış gibi gösterir. RLS zaten kapatıyor (mail_threads
  politikası posta modülünü soruyor), bu yalnızca ekranı temiz tutuyor.
*/

type Konusma = {
  thread_id: string;
  konu: string | null;
  son_gonderen_ad: string | null;
  son_gonderen_adres: string | null;
  son_mesaj_at: string | null;
  mesaj_sayisi: number;
  durum: string;
  okunmamis: boolean;
};

const DURUM_ADI: Record<string, string> = { acik: "Açık", yanitlandi: "Yanıtlandı", kapali: "Kapalı" };

export async function TalepPostalari({ opportunityId }: { opportunityId: string }) {
  const { supabase, membership, izin } = await getPanelContext();
  if (!izin("posta.gor")) return null;

  const { data } = await supabase
    .from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,mesaj_sayisi,durum,okunmamis")
    .eq("organization_id", membership.organization_id)
    .eq("opportunity_id", opportunityId)
    .order("son_mesaj_at", { ascending: false })
    .limit(20);
  const konusmalar = (data ?? []) as Konusma[];
  if (!konusmalar.length) return null;

  return (
    <section className="panel-card">
      <header className="panel-card-head">
        <div>
          <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
          <h2>Bu müşteriyle yazışmalar</h2>
        </div>
        <Link className="panel-secondary" href="/panel/posta">Gelen kutusu</Link>
      </header>
      <ul className="posta-liste">
        {konusmalar.map((konusma) => (
          <li key={konusma.thread_id} data-okunmamis={konusma.okunmamis ? "evet" : undefined}>
            <Link href={`/panel/posta/${konusma.thread_id}`}>
              <span className="posta-kisi">
                <b>{konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen"}</b>
                <small>{konusma.son_gonderen_adres}</small>
              </span>
              <span className="posta-icerik">
                <b>{konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? ` (${konusma.mesaj_sayisi})` : ""}</b>
                <small>{DURUM_ADI[konusma.durum] ?? konusma.durum}</small>
              </span>
              <span className="posta-yan"><small>{istanbulTarihSaat(konusma.son_mesaj_at)}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
