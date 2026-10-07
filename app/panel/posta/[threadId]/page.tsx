import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { postaGovdesiniGetir } from "@/lib/posta-esitleme";
import { konusmaDurumu, konusmayaYanitla, konusmayiKayitBagla, konusmayiOkundu, konusmayiUstlen } from "../actions";
import { OkunduIsaretle } from "../okundu-isaretle";
import { istanbulTarihSaat } from "../bicim";
import { yanitAlicisi } from "@/lib/posta-gonderim";
import { postaDurumu } from "@/lib/posta-hesabi";
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
      .select("thread_id,konu,durum,ilgilenen_user_id,mesaj_sayisi,opportunity_id,okunmamis")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId).maybeSingle(),
    supabase.from("mail_messages")
      .select("message_id,gonderen_ad,gonderen_adres,alici,konu,tarih,yon,ekli_dosya")
      .eq("organization_id", membership.organization_id).eq("thread_id", threadId)
      .order("tarih", { ascending: true }),
  ]);
  if (konusmaHatasi) throw new Error("Konuşma okunamadı: " + konusmaHatasi.message);
  if (mesajHatasi) throw new Error("Mesajlar okunamadı: " + mesajHatasi.message);
  if (!konusma) notFound();
  const kutuAdi = (await postaDurumu(membership.organization_id)).adres ?? "ortak kutu";

  /*
    Bağlanabilecek kayıtlar: en son dokunulan 100 fırsat. Kurumun bütün
    geçmişini açılır listeye koymak, listeyi kullanılamaz yapardı; elle
    bağlama zaten istisna, asıl bağ eşleşmeyle kuruluyor.
  */
  const { data: firsatVerisi } = izin("posta.yonet")
    ? await supabase.from("crm_opportunities")
        .select("id,customer_name,title,contact_email")
        .eq("organization_id", membership.organization_id)
        .order("updated_at", { ascending: false }).limit(100)
    : { data: [] };
  const firsatlar = (firsatVerisi ?? []) as { id: string; customer_name: string | null; title: string | null; contact_email: string | null }[];
  const bagliFirsat = firsatlar.find((firsat) => firsat.id === konusma.opportunity_id) ?? null;

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
  /* Yanıt son GELEN mesajın göndereneine gider; son giden mesaja bakmak
     kendi adresimize cevap yazdırırdı. */
  const yanitlanacakAdres = yanitAlicisi(mesajlar.map((mesaj) => ({
    gonderenAdres: mesaj.gonderen_adres,
    yon: mesaj.yon,
    tarih: mesaj.tarih ? new Date(mesaj.tarih) : null,
  })));
  const bendeMi = konusma.ilgilenen_user_id === userId;

  return <div className="posta">
    {/*
      Konuşma açılınca okundu olur. Sunucuda değil tarayıcıda: Next
      listedeki bağlantıları önden yüklüyor ve bu sayfayı çalıştırıyor;
      render sırasında işaretleseydik kutuda kaydıran personel hiç
      açmadığı postaları okundu yapardı.
    */}
    <OkunduIsaretle threadId={threadId} okunmamis={Boolean(konusma.okunmamis)} isaretle={konusmayiOkundu} />
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{konusma.konu || "(konu yok)"}</h1>
        <p>{mesajlar.length} mesaj</p>
      </div>
      <div className="panel-page-actions"><Link className="panel-secondary" href="/panel/posta">← Gelen kutusu</Link></div>
    </div>

    {yonetebilir ? (
      <form className="posta-bag" action={konusmayiKayitBagla}>
        <input type="hidden" name="thread_id" value={threadId} />
        <label htmlFor="posta-firsat">
          <b>Müşteri kaydı</b>
          <small>{konusma.opportunity_id
            ? (bagliFirsat
                ? `Bağlı: ${bagliFirsat.customer_name ?? "adsız"}${bagliFirsat.title ? ` · ${bagliFirsat.title}` : ""}`
                : "Bağlı kayıt bu listede değil (eski kayıt olabilir)")
            : "Bağlı kayıt yok. Gönderen adresi bir fırsatın iletişim adresiyle eşleşirse bağ kendiliğinden kurulur."}</small>
        </label>
        <div className="posta-bag-alt">
          <select id="posta-firsat" name="opportunity_id" defaultValue={konusma.opportunity_id ?? ""}>
            <option value="">— Bağ yok —</option>
            {firsatlar.map((firsat) => (
              <option key={firsat.id} value={firsat.id}>
                {firsat.customer_name ?? "Adsız müşteri"}{firsat.title ? ` · ${firsat.title}` : ""}
              </option>
            ))}
          </select>
          <button className="panel-secondary" type="submit">Kaydet</button>
          {konusma.opportunity_id ? <Link className="panel-secondary" href={`/panel/crm/requests/${konusma.opportunity_id}`}>Kaydı aç</Link> : null}
        </div>
      </form>
    ) : null}

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

    {izin("posta.yanitla") && yanitlanacakAdres ? (
      <form className="posta-yanit" action={konusmayaYanitla}>
        <input type="hidden" name="thread_id" value={threadId} />
        <label htmlFor="posta-yanit-metni">
          <b>Yanıt yaz</b>
          <small>{yanitlanacakAdres} adresine, {kutuAdi} adına gidecek.</small>
        </label>
        <textarea id="posta-yanit-metni" name="govde" rows={6} required maxLength={20000} placeholder="Yanıtınızı yazın…" />
        <div className="posta-yanit-alt">
          <small>Düz metin olarak gönderilir. Ekli dosya için Gmail&apos;den devam edin.</small>
          <button className="panel-primary" type="submit">Yanıtı gönder</button>
        </div>
      </form>
    ) : (
      <p className="posta-not">
        {yanitlanacakAdres
          ? "Bu kutudan yanıt yazma yetkiniz yok."
          : "Bu konuşmada yanıtlanacak bir gönderen yok (yalnızca giden mesajlar var)."}
      </p>
    )}

    <p className="posta-not">Ekli dosyalar Gmail&apos;de kalıyor; panelde yalnızca varlığı gösteriliyor.</p>
  </div>;
}
