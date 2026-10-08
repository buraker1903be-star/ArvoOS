import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { postaDurumu } from "@/lib/posta-hesabi";
import { postaAramaDeseni } from "@/lib/posta-ayristirma";
import { istanbulTarihSaat } from "./bicim";
import { SatirTiklama } from "../crm/satir-tiklama";
import "../crm/kayit-detay/kayit-detay.css";
import "./posta.css";

/*
  ORTAK GELEN KUTUSU — konuşma listesi.

  Liste veritabanından okunuyor, Gmail'den değil: her sayfa açılışında
  Gmail'e gitmek hem yavaş hem kota yakıyor, üstelik ekibin ortak durumu
  (ilgilenen, yanıtlandı) zaten bizde. Gmail'e yalnızca bir konuşma
  AÇILDIĞINDA gidiliyor, gövdeyi okumak için.
*/

export const dynamic = "force-dynamic";

type Konusma = {
  thread_id: string;
  konu: string | null;
  son_gonderen_ad: string | null;
  son_gonderen_adres: string | null;
  son_mesaj_at: string | null;
  ozet: string | null;
  mesaj_sayisi: number;
  okunmamis: boolean;
  durum: string;
  ilgilenen_user_id: string | null;
  opportunity_id: string | null;
  /* Gömülü ilişki: PostgREST tek kayıtta nesne, bazı sürümlerde dizi
     döndürüyor — ikisini de karşılayan tip. */
  crm_opportunities: { customer_name: string | null } | { customer_name: string | null }[] | null;
};

/** Bağlı CRM kaydının müşteri adı; yoksa null. */
function musteriAdi(konusma: Konusma): string | null {
  const bag = konusma.crm_opportunities;
  const kayit = Array.isArray(bag) ? bag[0] : bag;
  return kayit?.customer_name ?? null;
}

/*
  KUTULAR. Bir konuşma ikisinde birden görünebilir: müşteri yazmış, biz
  cevaplamışsak o yazışma hem gelen hem gönderilen kutusuna aittir.
  Gmail de böyle davranıyor; "gönderilenler" ayrı bir yığın değil, bir
  süzgeç.
*/
const KUTULAR = [
  { anahtar: "gelen", ad: "Gelen kutusu", sutun: "gelen_var" as const },
  { anahtar: "giden", ad: "Gönderilenler", sutun: "giden_var" as const },
];

const DURUM_ETIKETI: Record<string, { ad: string; ton: string }> = {
  acik: { ad: "Açık", ton: "warning" },
  yanitlandi: { ad: "Yanıtlandı", ton: "success" },
  kapali: { ad: "Kapalı", ton: "neutral" },
};

export default async function PostaPage({ searchParams }: { searchParams: Promise<{ durum?: string; q?: string; kutu?: string }> }) {
  const { durum: suzgec, q: aranan, kutu } = await searchParams;
  const { supabase, membership, userId, izin } = await getPanelContext();
  const hesap = await postaDurumu(membership.organization_id);

  let sorgu = supabase
    .from("mail_threads")
    .select("thread_id,konu,son_gonderen_ad,son_gonderen_adres,son_mesaj_at,ozet,mesaj_sayisi,okunmamis,durum,ilgilenen_user_id,opportunity_id,crm_opportunities(customer_name)")
    .eq("organization_id", membership.organization_id)
    .order("son_mesaj_at", { ascending: false })
    .limit(100);
  if (suzgec && DURUM_ETIKETI[suzgec]) sorgu = sorgu.eq("durum", suzgec);

  const secilenKutu = KUTULAR.find((aday) => aday.anahtar === kutu);
  if (secilenKutu) sorgu = sorgu.eq(secilenKutu.sutun, true);

  /*
    ARAMA. Binlerce konuşmanın biriktiği bir kutuda liste tek başına
    kullanılamaz hâle geliyor; "geçen ay şu müşteri ne yazmıştı" sorusunun
    cevabı yoktu.

    Gmail'in arama ucuna değil KENDİ üst verimize soruluyor: liste zaten
    buradan çiziliyor, Gmail'e gitmek her tuşta bir ağ turu ve kota
    demekti. Karşılığında arama gövdede değil konu, gönderen ve özette.
  */
  const desen = postaAramaDeseni(aranan ?? "");
  if (desen) {
    sorgu = sorgu.or(
      `konu.ilike.*${desen}*,son_gonderen_ad.ilike.*${desen}*,son_gonderen_adres.ilike.*${desen}*,ozet.ilike.*${desen}*`,
    );
  }

  const { data, error } = await sorgu;
  if (error) throw new Error("Konuşmalar okunamadı: " + error.message);
  const konusmalar = (data ?? []) as Konusma[];

  // Ekip adları: "ilgilenen" sütunu kullanıcı kimliği tutuyor, ekranda ad gerekiyor.
  const ilgilenenler = [...new Set(konusmalar.map((satir) => satir.ilgilenen_user_id).filter(Boolean))] as string[];
  const { data: personeller } = ilgilenenler.length
    ? await supabase.from("hr_employees").select("user_id,full_name")
        .eq("organization_id", membership.organization_id).in("user_id", ilgilenenler)
    : { data: [] };
  const adlar = new Map(((personeller ?? []) as { user_id: string; full_name: string }[]).map((satir) => [satir.user_id, satir.full_name]));

  const okunmamisSayisi = konusmalar.filter((satir) => satir.okunmamis).length;

  /* Süzgeçler birbirini silmesin: biri değişirken diğer ikisi korunuyor.
     Elle dizilen adreslerde bu üç kez unutulmuştu. */
  const adresEki = (degisen: { durum?: string; q?: string; kutu?: string }) => {
    const p = new URLSearchParams();
    const al = (ad: "durum" | "q" | "kutu", simdiki: string | undefined) =>
      (ad in degisen ? degisen[ad] : simdiki) || "";
    const d = al("durum", suzgec), a = al("q", desen ?? undefined), k = al("kutu", kutu);
    if (d) p.set("durum", d);
    if (a) p.set("q", a);
    if (k) p.set("kutu", k);
    return p.size ? `?${p}` : "";
  };

  const sayi = {
    tumu: konusmalar.length,
    okunmamis: okunmamisSayisi,
    acik: konusmalar.filter((satir) => satir.durum === "acik").length,
    yanitlandi: konusmalar.filter((satir) => satir.durum === "yanitlandi").length,
  };

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">ORTAK POSTA KUTUSU</small>
        <h1>{hesap.adres ?? "Posta"}</h1>
      </div>
      <div className="talep-bas-eylem">
        {izin("posta.yanitla") ? <Link className="panel-primary" href="/panel/posta/yeni">Yeni posta</Link> : null}
      </div>
    </header>

    {/* Sayaç şeridi aynı zamanda süzgeç: panelin diğer listelerinde de
        rakama tıklanıyor, posta ayrı davranmasın. */}
    <nav className="kayit-serit talep-serit" aria-label="Posta kutusu ve durum">
      <dl>
        <div className={!secilenKutu ? "is-active" : undefined}>
          <dt>Tümü</dt>
          <dd><Link href={`/panel/posta${adresEki({ kutu: "" })}`}>{sayi.tumu}</Link></dd>
        </div>
        {KUTULAR.map((kutuSecenegi) => (
          <div key={kutuSecenegi.anahtar} className={secilenKutu?.anahtar === kutuSecenegi.anahtar ? "is-active" : undefined}>
            <dt>{kutuSecenegi.ad}</dt>
            <dd><Link href={`/panel/posta${adresEki({ kutu: kutuSecenegi.anahtar })}`} aria-current={secilenKutu?.anahtar === kutuSecenegi.anahtar ? "page" : undefined}>{kutuSecenegi.anahtar === "gelen" ? sayi.acik + sayi.yanitlandi : sayi.tumu}</Link></dd>
          </div>
        ))}
        <div className={suzgec === "acik" ? "is-active" : undefined}>
          <dt>Açık</dt>
          <dd><Link href={`/panel/posta${adresEki({ durum: suzgec === "acik" ? "" : "acik" })}`}>{sayi.acik}</Link></dd>
        </div>
        <div>
          <dt>Okunmamış</dt>
          <dd className={sayi.okunmamis ? "talep-uyari" : undefined}>{sayi.okunmamis}</dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Posta listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={`/panel/posta${adresEki({ durum: "" })}`} className={!suzgec ? "is-active" : undefined}>Tümü <small>{sayi.tumu}</small></Link>
          {Object.entries(DURUM_ETIKETI).map(([anahtar, etiket]) => (
            <Link key={anahtar} href={`/panel/posta${adresEki({ durum: anahtar })}`} className={suzgec === anahtar ? "is-active" : undefined}>{etiket.ad}</Link>
          ))}
          {/* Arama sunucuda: GET formu kendi sayfasına gönderiyor, sonuç
              paylaşılabilir bir adres oluyor ve geri tuşu çalışıyor. */}
          <form className="talep-ara" method="get" action="/panel/posta" role="search">
            {suzgec ? <input type="hidden" name="durum" value={suzgec} /> : null}
            {kutu ? <input type="hidden" name="kutu" value={kutu} /> : null}
            <input name="q" defaultValue={aranan ?? ""} placeholder="Konu, gönderen ara" aria-label="Postalarda ara" />
          </form>
        </div>

        {konusmalar.length === 0 ? (
          <div className="crm-empty-state talep-bos-kutu">
            <p>{desen ? `"${desen}" için sonuç yok.` : "Bu süzgeçte yazışma yok."}</p>
            <small>Kutu birkaç dakikada bir eşitleniyor; yeni bağladıysanız ilk eşitlemeyi bekleyin.</small>
          </div>
        ) : (
          <div className="talep-tablo">
            <table className="crm-data-table">
              <thead><tr><th>Gönderen</th><th>Konu</th><th>Müşteri</th><th>Durum</th><th>İlgilenen</th><th className="crm-col-date">Son mesaj</th><th></th></tr></thead>
              <tbody>
                {konusmalar.map((konusma) => {
                  const etiket = DURUM_ETIKETI[konusma.durum] ?? DURUM_ETIKETI.acik;
                  const ilgilenen = konusma.ilgilenen_user_id ? adlar.get(konusma.ilgilenen_user_id) ?? "Ekipten biri" : null;
                  const gonderen = konusma.son_gonderen_ad || konusma.son_gonderen_adres || "Bilinmeyen gönderen";
                  return (
                    <tr key={konusma.thread_id} data-okunmamis={konusma.okunmamis ? "evet" : undefined}>
                      <td data-label="Gönderen">
                        <Link className="crm-row-link" href={`/panel/posta/${konusma.thread_id}`} aria-label={`${konusma.konu || "konusuz"} yazışmasını aç`}>
                          <span className="crm-table-title" title={gonderen}>{gonderen}</span>
                          <span className="crm-table-sub">{konusma.son_gonderen_adres}</span>
                        </Link>
                      </td>
                      <td data-label="Konu">
                        <span className="crm-table-title" title={konusma.konu ?? ""}>
                          {konusma.konu || "(konu yok)"}{konusma.mesaj_sayisi > 1 ? ` (${konusma.mesaj_sayisi})` : ""}
                        </span>
                        <span className="crm-table-sub">{konusma.ozet}</span>
                      </td>
                      <td data-label="Müşteri">{musteriAdi(konusma) ?? <span className="talep-bos">—</span>}</td>
                      <td data-label="Durum"><span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span></td>
                      <td data-label="İlgilenen">
                        {ilgilenen
                          ? <span className="crm-table-sub">{konusma.ilgilenen_user_id === userId ? "Siz" : ilgilenen}</span>
                          : <span className="talep-bos">—</span>}
                      </td>
                      <td data-label="Son mesaj" className="crm-table-mono">{istanbulTarihSaat(konusma.son_mesaj_at)}</td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        )}
      </section>

      <IstatistikKarti hesap={hesap} sayi={sayi} />
    </div>
  </main>;
}

/* Kutunun durumu listenin yanında: eşitleme durduğunda liste eskiyor ve
   bunu ancak Ayarlar'a giden fark ediyordu. */
function IstatistikKarti({ hesap, sayi }: {
  hesap: Awaited<ReturnType<typeof postaDurumu>>;
  sayi: { tumu: number; okunmamis: number; acik: number; yanitlandi: number };
}) {
  return (
    <section className="panel-card talep-musteri talep-istatistik" aria-label="Kutu durumu">
      <h2>Kutu durumu</h2>
      <dl className="istat-kutular">
        <div><dt>Açık</dt><dd>{sayi.acik}</dd></div>
        <div><dt>Yanıtlandı</dt><dd>{sayi.yanitlandi}</dd></div>
        <div><dt>Okunmamış</dt><dd>{sayi.okunmamis}</dd></div>
        <div><dt>Listelenen</dt><dd>{sayi.tumu}</dd></div>
      </dl>
      <dl className="stg-list posta-durum-listesi">
        <div><dt>Adres</dt><dd>{hesap.adres ?? "—"}</dd></div>
        <div><dt>Son eşitleme</dt><dd>{istanbulTarihSaat(hesap.sonEsitleme)}</dd></div>
        <div><dt>Geçmiş</dt><dd>{hesap.gecmisBitti ? "tamamlandı" : `iniyor (${hesap.gecmisMesajSayisi})`}</dd></div>
      </dl>
      {hesap.sonHata ? <p className="posta-uyari">Son eşitleme hatası: {hesap.sonHata}</p> : null}
    </section>
  );
}
