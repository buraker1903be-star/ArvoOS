import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { postaGovdesiniGetir } from "@/lib/posta-esitleme";
import { konusmaDurumu, konusmayiUstlen } from "../actions";
import { istanbulTarihSaat } from "../bicim";
import "../posta.css";

/*
  KONUŞMA EKRANI.

  Üst veri veritabanından, gövdeler Gmail'den. Gövde HTML olarak
  basılmıyor: gelen kutusu dışarıdan gelen içerik ve gönderenin HTML'ini
  olduğu gibi göstermek, kurumun oturumu açıkken çalışan bir betik
  demek. lib/posta-ayristirma.ts düz metne indiriyor.
*/

export const dynamic = "force-dynamic";

type Mesaj = {
  message_id: string;
  gonderen_ad: string | null;
  gonderen_adres: string | null;
  alici: string | null;
  konu: string | null;
  tarih: string | null;
  yon: string;
  ekli_dosya: boolean;
};

export default async function KonusmaPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const { supabase, membership, userId, izin } = await getPanelContext();

  const [{ data: konusma, error: konusmaHatasi }, { data: mesajVerisi, error: mesajHatasi }] = await Promise.all([
    supabase.from("mail_threads")
      .select("thread_id,konu,durum,ilgilenen_user_id,mesaj_sayisi")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId).maybeSingle(),
    supabase.from("mail_messages")
      .select("message_id,gonderen_ad,gonderen_adres,alici,konu,tarih,yon,ekli_dosya")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId)
      .order("tarih", { ascending: true }),
  ]);
  if (konusmaHatasi) throw new Error("Konuşma okunamadı: " + konusmaHatasi.message);
  if (mesajHatasi) throw new Error("Mesajlar okunamadı: " + mesajHatasi.message);
  if (!konusma) notFound();

  const mesajlar = (mesajVerisi ?? []) as Mesaj[];

  /*
    Gövdeler paralel çekiliyor. Tek tek beklemek, on mesajlık bir
    konuşmada ekranı on ağ turu kadar geciktiriyordu. Biri düşerse
    yalnızca o mesaj sebebini yazar; konuşmanın tamamı kaybolmaz.
  */
  const govdeler = new Map(await Promise.all(mesajlar.map(async (mesaj) => {
    const sonuc = await postaGovdesiniGetir(membership.organization_id, mesaj.message_id);
    return [mesaj.message_id, typeof sonuc === "string" ? sonuc : `(Mesaj gövdesi okunamadı: ${sonuc.hata})`] as const;
  })));

  const yonetebilir = izin("posta.yonet");
  const bendeMi = konusma.ilgilenen_user_id === userId;

  return <div className="posta">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{konusma.konu || "(konu yok)"}</h1>
        <p>{mesajlar.length} mesaj</p>
      </div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/posta">← Gelen kutusu</Link></div>
    </div>

    {yonetebilir ? (
      <div className="posta-durum-cubugu">
        <form action={konusmayiUstlen}>
          <input type="hidden" name="thread_id" value={threadId} />
          <input type="hidden" name="kime" value={bendeMi ? "bosalt" : "ben"} />
          <button className="panel-secondary" type="submit">{bendeMi ? "İlgilenmeyi bırak" : "Ben ilgileniyorum"}</button>
        </form>
        {(["acik", "yanitlandi", "kapali"] as const).map((durum) => (
          <form key={durum} action={konusmaDurumu}>
            <input type="hidden" name="thread_id" value={threadId} />
            <input type="hidden" name="durum" value={durum} />
            <button className={konusma.durum === durum ? "panel-primary" : "panel-secondary"} type="submit">
              {durum === "acik" ? "Açık" : durum === "yanitlandi" ? "Yanıtlandı" : "Kapalı"}
            </button>
          </form>
        ))}
      </div>
    ) : null}

    <ol className="posta-mesajlar">
      {mesajlar.map((mesaj) => (
        <li key={mesaj.message_id} data-yon={mesaj.yon}>
          <header>
            <span>
              <b>{mesaj.gonderen_ad || mesaj.gonderen_adres || "Bilinmeyen gönderen"}</b>
              <small>{mesaj.gonderen_adres}{mesaj.alici ? ` → ${mesaj.alici}` : ""}</small>
            </span>
            <span className="posta-mesaj-yan">
              {mesaj.ekli_dosya ? <small>Ekli dosya var</small> : null}
              <small>{istanbulTarihSaat(mesaj.tarih)}</small>
            </span>
          </header>
          {/* Düz metin: gönderenin HTML'i panelde çalıştırılmıyor. */}
          <p className="posta-govde">{govdeler.get(mesaj.message_id) || "(boş mesaj)"}</p>
        </li>
      ))}
    </ol>

    <p className="posta-not">
      Yanıtlama henüz açık değil; bu aşamada kutu yalnızca okunuyor. Yanıt vermek için Gmail&apos;den devam edin.
      Ekli dosyalar da Gmail&apos;de — panelde yalnızca varlığı gösteriliyor.
    </p>
  </div>;
}
