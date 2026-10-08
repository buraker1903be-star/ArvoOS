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

export async function TalepPostalari({ opportunityId, musteriAdresi, konu, gorunum = "kart" }: {
  opportunityId: string;
  /*
    AKIŞ GÖRÜNÜMÜ (talep detayının "Postalar" sekmesi): sekme zaten
    "Postalar" diyor; "Ortak posta kutusu / Bu müşteriyle yazışmalar"
    başlığı tekrar ediyordu. Başlık yerine tek satırlık araç çubuğu.
  */
  gorunum?: "kart" | "akis";
  /* CRM kaydındaki iletişim adresi: "Posta gönder" bağlantısını
     doldurmak için. Adres yoksa bağlantı hiç çizilmiyor — boş bir
     alıcıyla açılan form, kullanıcıya adresi başka yerden aratır. */
  musteriAdresi?: string | null;
  konu?: string | null;
}) {
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

  const yeniPostaBaglantisi = izin("posta.yanitla") && musteriAdresi
    ? `/panel/posta/yeni?alici=${encodeURIComponent(musteriAdresi)}&firsat=${encodeURIComponent(opportunityId)}${konu ? `&konu=${encodeURIComponent(konu)}` : ""}`
    : null;

  /* Yazışma da yoksa ve gönderilecek adres de yoksa bölüm hiç çizilmiyor. */
  if (!konusmalar.length && !yeniPostaBaglantisi) return null;

  if (gorunum === "akis") {
    return (
      <section className="posta-akis">
        <div className="posta-akis-arac">
          <p>{konusmalar.length ? `${konusmalar.length} yazışma` : "Bu müşteriyle henüz yazışma yok."}</p>
          <div>
            <Link className="panel-secondary" href="/panel/posta">Gelen kutusu</Link>
            {yeniPostaBaglantisi ? <Link className="panel-primary" href={yeniPostaBaglantisi}>Posta gönder</Link> : null}
          </div>
        </div>
        {konusmalar.length ? <ul className="posta-akis-liste">
          {konusmalar.map((konusma) => (
            <li key={konusma.thread_id} className={konusma.okunmamis ? "is-unread" : undefined}>
              <Link href={`/panel/posta/${konusma.thread_id}`}>
                <span className="posta-akis-metin">
                  <b>{konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? ` (${konusma.mesaj_sayisi})` : ""}</b>
                  <small>{konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen"} · {DURUM_ADI[konusma.durum] ?? konusma.durum}</small>
                </span>
                <small className="posta-akis-zaman">{istanbulTarihSaat(konusma.son_mesaj_at)}</small>
              </Link>
            </li>
          ))}
        </ul> : null}
      </section>
    );
  }

  return (
    <section className="panel-card">
      <header className="panel-card-head">
        <div>
          <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
          <h2>Bu müşteriyle yazışmalar</h2>
        </div>
        <div className="panel-page-actions">
          {yeniPostaBaglantisi ? <Link className="panel-primary" href={yeniPostaBaglantisi}>Posta gönder</Link> : null}
          <Link className="panel-secondary" href="/panel/posta">Gelen kutusu</Link>
        </div>
      </header>
      {konusmalar.length === 0
        ? <p className="posta-not">Bu müşteriyle henüz yazışma yok.</p>
        : null}
      {konusmalar.length ? <ul className="posta-liste">
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
      </ul> : null}
    </section>
  );
}
