import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { CustomerCell, DateCell } from "../crm/table-cells";
import { OtomatikSecim } from "../crm/otomatik-secim";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../crm/istatistik-karti";
import { aylikDilimler, oran } from "@/lib/liste-istatistik";
import { aramaDeseni, telefonAnahtari } from "@/lib/liste-arama";
import { sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";
import { TEKLIF_GRUP_ADLARI, type TeklifGrubu } from "@/lib/teklif-grubu";
import { SOZLESME_GRUP_ADLARI, type SozlesmeGrubu } from "@/lib/sozlesme-grubu";
import { simdi } from "../os/genel-bakis";
import { SatirTiklama } from "../crm/satir-tiklama";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";

/*
  BELGE MERKEZİ (10.10.2026): panelin liste kalıbında. Üstte başlık,
  altında sayaç şeridi (her sayı süzgeç), solda belge tablosu, sağda
  istatistikler.

  12.10.2026: Teklifler ve Sözleşmeler listeleriyle AYNI veri katmanı.
  Eskiden tablolar doğrudan okunuyor ve HAM durum yazılıyordu: kararlanan
  teklif veritabanında "archived" olarak saklandığı için 105 teklifin
  102'si "Arşiv" görünüyor, "Kabul edilen" 0 ve kabul oranı %0
  çıkıyordu. Müşteri sütununda iletişim okunmadığı için her satır
  "İletişim yok" diyordu; müşteri adı araması en fazla 200 fırsata
  bakıyor, telefonla arama hiç yoktu; kartın sayıları altı aylık sınırsız
  bir okumadan hesaplanıyordu.

  Artık:
  - liste crm_teklif_liste / crm_sozlesme_liste görünümünden; durum
    teklif_grubu / sozlesme_grubu (gerçek sonuç),
  - arama sunucuda: no, konu, müşteri adı, e-posta ve telefon rakamları
    (lib/liste-arama),
  - şerit ve süzgeç sayıları head sorgularından, listeyle aynı süzgeç
    kümesinden; kart sayıları özet işlevlerinden
    (crm_teklif_istatistikleri / crm_sozlesme_istatistikleri).
*/

export const dynamic = "force-dynamic";

type BelgeSatiri = {
  id: string;
  title: string | null;
  amount: number;
  currency: string;
  created_at: string;
  opportunity_id: string | null;
  customer_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  // teklif
  proposal_no?: string;
  revision_no?: number | null;
  teklif_grubu?: TeklifGrubu;
  // sözleşme
  contract_no?: string;
  signed_at?: string | null;
  sozlesme_grubu?: SozlesmeGrubu;
};

type Ozet = {
  toplam?: number; son30?: number; onceki30?: number; aktif_deger?: number;
  kabul?: number; karara?: number; bekleyen?: number; bekleyen_gec?: number;
  imzalanan?: number; kapanan?: number; imza_bekleyen?: number; imza_bekleyen_gec?: number;
  aylik?: { ay: string; adet: number; toplam: number }[];
};

const para = (kurus: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(Number(kurus || 0) / 100);

/* Teklifler ve Sözleşmeler sayfalarındaki tonlar: aynı grup her ekranda aynı renk. */
const TEKLIF_TONU: Record<TeklifGrubu, string> = { draft: "neutral", sent: "info", accepted: "success", rejected: "danger", expired: "warning", eski: "neutral", arsiv: "neutral" };
const SOZLESME_TONU: Record<SozlesmeGrubu, string> = { draft: "neutral", sent: "info", imzali: "warning", operasyonda: "success", tamam: "neutral", rejected: "danger", cancelled: "danger" };
const TEKLIF_GRUPLARI = Object.keys(TEKLIF_GRUP_ADLARI) as TeklifGrubu[];
const SOZLESME_GRUPLARI = Object.keys(SOZLESME_GRUP_ADLARI) as SozlesmeGrubu[];
/** Sözleşmede "imzalı" süzgeci: imzalanmış her sözleşme (iş açılmamış, operasyonda, tamamlanmış). */
const IMZALI_GRUPLAR: SozlesmeGrubu[] = ["imzali", "operasyonda", "tamam"];

export default async function BelgelerSayfasi({ searchParams }: {
  searchParams: Promise<{ tab?: string; status?: string; search?: string; sayfa?: string }>;
}) {
  const params = await searchParams;
  const sozlesmeMi = params.tab === "sozlesmeler";
  const gorunum = sozlesmeMi ? "crm_sozlesme_liste" : "crm_teklif_liste";
  const grupSutunu = sozlesmeMi ? "sozlesme_grubu" : "teklif_grubu";
  const noSutunu = sozlesmeMi ? "contract_no" : "proposal_no";
  const gruplar: string[] = sozlesmeMi ? SOZLESME_GRUPLARI : TEKLIF_GRUPLARI;
  const grupAdi = (grup: string) => (sozlesmeMi ? SOZLESME_GRUP_ADLARI[grup as SozlesmeGrubu] : TEKLIF_GRUP_ADLARI[grup as TeklifGrubu]) ?? grup;
  const grupTonu = (grup: string) => (sozlesmeMi ? SOZLESME_TONU[grup as SozlesmeGrubu] : TEKLIF_TONU[grup as TeklifGrubu]) ?? "neutral";

  // Eski bağlantılar (?status=signed, ?status=accepted) çalışmaya devam ediyor.
  const istenen = (params.status ?? "").trim();
  const durum = gruplar.includes(istenen) || (sozlesmeMi && istenen === "signed") ? istenen : "";
  const arama = (params.search ?? "").trim().slice(0, 100);
  const sayfaNo = sayfaNumarasi(params.sayfa);

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => ["documents", "crm"].includes(modul.code))) {
    throw new Error("Belge Merkezi'ne erişiminiz yok.");
  }
  const org = membership.organization_id;

  /* Süzgeç tek yerden: liste ve rozet sayıları aynı kümeyi görmeli. */
  const desen = aramaDeseni(arama);
  const telefon = telefonAnahtari(arama);
  const suzulmus = (sayarak = false) => {
    let q = sayarak
      ? supabase.from(gorunum).select("id", { count: "exact", head: true }).eq("organization_id", org)
      : supabase.from(gorunum).select(
          sozlesmeMi
            ? "id,contract_no,title,amount,currency,signed_at,created_at,opportunity_id,customer_name,contact_email,contact_phone,sozlesme_grubu"
            : "id,proposal_no,title,amount,currency,revision_no,created_at,opportunity_id,customer_name,contact_email,contact_phone,teklif_grubu",
          { count: "exact" },
        ).eq("organization_id", org);
    if (desen) {
      q = q.or([
        `${noSutunu}.ilike.*${desen}*`,
        `title.ilike.*${desen}*`,
        `customer_name.ilike.*${desen}*`,
        `contact_email.ilike.*${desen}*`,
        ...(telefon ? [`telefon_rakamlari.ilike.*${telefon}*`] : []),
      ].join(","));
    }
    return q;
  };
  const durumSuzgeci = <Q extends ReturnType<typeof suzulmus>>(q: Q) =>
    durum === "signed" ? q.in(grupSutunu, IMZALI_GRUPLAR)
    : durum ? q.eq(grupSutunu, durum)
    : q;
  const tumunuSay = (hedef: string) => supabase.from(hedef).select("id", { count: "exact", head: true }).eq("organization_id", org);

  const [
    { data: satirVerisi, error: listeHatasi, count: suzgecSayisi },
    { count: teklifSayisi, error: teklifSayimHatasi },
    { count: sozlesmeSayisi, error: sozlesmeSayimHatasi },
    { data: ozetVerisi, error: ozetHatasi },
    ...grupSayimlari
  ] = await Promise.all([
    durumSuzgeci(suzulmus()).order("created_at", { ascending: false }).range(...sayfaAraligi(sayfaNo)),
    tumunuSay("crm_teklif_liste"),
    tumunuSay("crm_sozlesme_liste"),
    supabase.rpc(sozlesmeMi ? "crm_sozlesme_istatistikleri" : "crm_teklif_istatistikleri", { p_organization_id: org }),
    ...gruplar.map((grup) => suzulmus(true).eq(grupSutunu, grup)),
  ]);
  if (listeHatasi) throw new Error("Belgeler okunamadı: " + listeHatasi.message);
  // Sayım hatası "0" değildir: rozetteki sayı yanlış olurdu.
  const sayimHatasi = teklifSayimHatasi ?? sozlesmeSayimHatasi ?? grupSayimlari.find((sonuc) => sonuc.error)?.error;
  if (sayimHatasi) throw new Error("Belge sayıları okunamadı: " + sayimHatasi.message);
  if (ozetHatasi) throw new Error("Belge istatistikleri okunamadı: " + ozetHatasi.message);

  const satirlar = (satirVerisi ?? []) as unknown as BelgeSatiri[];
  const sonSayfa = sonSayfaNo(suzgecSayisi, satirlar.length, sayfaNo);
  const grupSayisi = (grup: string) => grupSayimlari[gruplar.indexOf(grup)]?.count ?? 0;
  const tumSayi = gruplar.reduce((toplam, grup) => toplam + grupSayisi(grup), 0);
  const imzaliSayisi = IMZALI_GRUPLAR.reduce((toplam, grup) => toplam + grupSayisi(grup), 0);

  /* Kart: özet işlevinin ham sayıları, etiketleme burada (Teklifler ve
     Sözleşmeler sayfalarıyla aynı). */
  const ozet = (ozetVerisi ?? {}) as Ozet;
  const sayi = (deger: number | undefined) => Number(deger ?? 0);
  const an = simdi();
  const son30 = sayi(ozet.son30);
  const onceki30 = sayi(ozet.onceki30);
  const degisim = onceki30 ? Math.round(((son30 - onceki30) / onceki30) * 100) : null;
  const aktifDeger = sayi(ozet.aktif_deger);
  const aylikDeger = aylikDilimler(ozet.aylik ?? [], 6, an);
  const bekleyen = sozlesmeMi ? sayi(ozet.imza_bekleyen) : sayi(ozet.bekleyen);
  const bekleyenGec = sozlesmeMi ? sayi(ozet.imza_bekleyen_gec) : sayi(ozet.bekleyen_gec);
  const olumluOran = sozlesmeMi
    ? oran(sayi(ozet.imzalanan), sayi(ozet.imzalanan) + sayi(ozet.kapanan))
    : oran(sayi(ozet.kabul), sayi(ozet.karara));
  const durumDagilimi = gruplar.map((grup) => ({ ad: grupAdi(grup), adet: grupSayisi(grup) })).filter((satir) => satir.adet > 0);

  const adres = (degisen: { tab?: string; status?: string; search?: string; sayfa?: string }) => {
    const p = new URLSearchParams();
    const al = (ad: "tab" | "status" | "search" | "sayfa", simdiki: string) => (ad in degisen ? degisen[ad] : simdiki) || "";
    const t = al("tab", sozlesmeMi ? "sozlesmeler" : ""), d = al("status", durum), a = al("search", arama), s = al("sayfa", "");
    if (t === "sozlesmeler") p.set("tab", t);
    if (d) p.set("status", d);
    if (a) p.set("search", a);
    if (s) p.set("sayfa", s);
    return p.size ? `/panel/documents?${p}` : "/panel/documents";
  };
  const seritKutusu = (ad: string, deger: number, kod: string) => (
    <div className={durum === kod ? "is-active" : undefined}>
      <dt>{ad}</dt>
      <dd><Link href={adres({ status: kod, sayfa: "" })} aria-current={durum === kod ? "page" : undefined}>{deger}</Link></dd>
    </div>
  );
  const filtreli = Boolean(durum || arama);

  return <main className="talep cari ekip talepler teklifler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">DOKÜMANLAR</small>
        <h1>Belge Merkezi</h1>
      </div>
      <div className="talep-bas-eylem">
        {/* Belge burada oluşturulmuyor: teklif talepten, sözleşme kabul
            edilen tekliften hazırlanıyor. */}
        <Link className="panel-secondary" href={sozlesmeMi ? "/panel/crm/contracts" : "/panel/crm/proposals"}>
          {sozlesmeMi ? "Sözleşmelere git" : "Tekliflere git"}
        </Link>
      </div>
    </header>

    {/* Şerit hem sayaç hem süzgeç: belge türü, türün iki ana durumu ve
        süren belgelerin değeri. */}
    <nav className="kayit-serit talep-serit" aria-label="Belge türü ve durum">
      <dl>
        <div className={!sozlesmeMi ? "is-active" : undefined}>
          <dt>Teklifler</dt>
          <dd><Link href={adres({ tab: "", status: "", sayfa: "" })}>{teklifSayisi ?? 0}</Link></dd>
        </div>
        <div className={sozlesmeMi ? "is-active" : undefined}>
          <dt>Sözleşmeler</dt>
          <dd><Link href={adres({ tab: "sozlesmeler", status: "", sayfa: "" })}>{sozlesmeSayisi ?? 0}</Link></dd>
        </div>
        {sozlesmeMi ? <>
          {seritKutusu("İmza bekleyen", grupSayisi("sent"), "sent")}
          {seritKutusu("İmzalı", imzaliSayisi, "signed")}
        </> : <>
          {seritKutusu("Yanıt bekleyen", grupSayisi("sent"), "sent")}
          {seritKutusu("Kabul edilen", grupSayisi("accepted"), "accepted")}
        </>}
        <div className="cari-bakiye">
          <dt>{sozlesmeMi ? "Süren sözleşmelerin değeri" : "Aktif teklif değeri"}</dt>
          <dd>{para(aktifDeger, "TRY")}</dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Belge listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ status: "", sayfa: "" })} className={!durum ? "is-active" : undefined}>
            Tümü <small>{tumSayi}</small>
          </Link>
          {/* Durum süzgeci seçimle uygulanıyor; sekme ve arama korunuyor. */}
          <form action="/panel/documents" className="talep-ara talep-ara--secimli" role="search">
            {sozlesmeMi ? <input type="hidden" name="tab" value="sozlesmeler" /> : null}
            <OtomatikSecim name="status" defaultValue={durum} className="talep-temsilci-sec" label="Durum">
              <option value="">Tüm durumlar</option>
              {sozlesmeMi ? <option value="signed">İmzalı (tümü)</option> : null}
              {gruplar.map((grup) => (
                <option key={grup} value={grup}>{grupAdi(grup)} ({grupSayisi(grup)})</option>
              ))}
            </OtomatikSecim>
            <input name="search" defaultValue={arama}
              placeholder={sozlesmeMi ? "Sözleşme no, müşteri, telefon ara" : "Teklif no, müşteri, telefon ara"}
              aria-label="Belge / müşteri ara" />
          </form>
        </div>

        {satirlar.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="belgeler">
              <thead><tr>
                <th>Belge</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th className="crm-col-amount">Tutar</th>
                <th className="crm-col-date">{sozlesmeMi ? "İmza" : "Oluşturuldu"}</th>
                <th></th>
              </tr></thead>
              <tbody>
                {satirlar.map((satir) => {
                  const no = (sozlesmeMi ? satir.contract_no : satir.proposal_no) ?? "—";
                  const grup = (sozlesmeMi ? satir.sozlesme_grubu : satir.teklif_grubu) ?? "draft";
                  const altMetin = sozlesmeMi
                    ? satir.title || "Konusuz sözleşme"
                    : `${satir.title || "Konusuz teklif"}${satir.revision_no ? ` · R${satir.revision_no}` : ""}`;
                  const tur = sozlesmeMi ? "contract" : "proposal";
                  return (
                    <tr key={satir.id}>
                      {/* Satırın tamamı bu bağlantıyla tıklanır (kayit-detay.css, ilk hücre);
                          belgenin yaşam döngüsü sayfası açılır. */}
                      <td data-label="Belge">
                        <Link className="crm-row-link" href={`/panel/documents/${tur}/${satir.id}`} aria-label={`${no} belgesini aç`}>
                          <span className="crm-table-title" title={no}>{no}</span>
                          <span className="crm-table-sub" title={altMetin}>{altMetin}</span>
                        </Link>
                      </td>
                      <CustomerCell name={satir.customer_name ?? "Müşteri"} phone={satir.contact_phone} email={satir.contact_email} href={satir.opportunity_id ? `/panel/crm/musteri/${satir.opportunity_id}` : null} />
                      <td data-label="Durum"><span className="status-pill" data-tone={grupTonu(grup)}>{grupAdi(grup)}</span></td>
                      <td data-label="Tutar" className="crm-table-mono">{para(satir.amount, satir.currency)}</td>
                      <DateCell label={sozlesmeMi ? "İmza" : "Oluşturuldu"} value={sozlesmeMi ? satir.signed_at : satir.created_at} />
                      <td className="crm-table-actions">
                        {/* Önizleme satırda kalıyor: belgeyi görmek en sık yapılan iş,
                            yaşam döngüsü sayfasına uğramayı şart koşmak bir adım fazlaydı. */}
                        <Link className="panel-secondary" href={`/panel/documents/${tur}/${satir.id}/preview`}>Önizle</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
            {/* Sayfalayıcı Teklifler ve Sözleşmeler listeleriyle aynı. */}
            {sonSayfa > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfaNo > 1
                  ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}>← Önceki</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
                <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} belge` : ""}</small>
                {sayfaNo < sonSayfa
                  ? <Link className="panel-secondary" href={adres({ sayfa: String(sayfaNo + 1) })}>Sonraki →</Link>
                  : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{filtreli
              ? "Eşleşen belge yok"
              : sozlesmeMi ? "Henüz sözleşme belgesi yok" : "Henüz teklif belgesi yok"}</h2>
            <p>{filtreli
              ? "Aramayı veya durum süzgecini değiştirip yeniden deneyin."
              : sozlesmeMi
                ? "Sözleşmeler CRM'de kabul edilen tekliften ya da talepten hazırlanır; her sözleşme burada önizleme, imza durumu ve yaşam döngüsüyle listelenir."
                : "Teklifler CRM'de bir talepten hazırlanır; her teklif ve revizyonu burada önizleme ve PDF ile listelenir."}</p>
            <div className="crm-empty-actions">
              {filtreli
                ? <Link className="panel-secondary" href={adres({ status: "", search: "", sayfa: "" })}>Süzgeci temizle</Link>
                : <Link className="panel-primary" href={sozlesmeMi ? "/panel/crm/contracts" : "/panel/crm"}>{sozlesmeMi ? "Sözleşmelere git" : "Taleplere git"}</Link>}
            </div>
          </div>
        )}
      </section>

      <IstatistikKarti
        kapsam={sozlesmeMi ? "tüm sözleşmeler" : "tüm teklifler"}
        kutular={[
          { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni belge", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
          sozlesmeMi
            ? { ad: "İmzalanma oranı", deger: olumluOran === null ? "—" : `%${olumluOran}`, alt: `${sayi(ozet.imzalanan)} imzalı · ${sayi(ozet.kapanan)} kapanan` }
            : { ad: "Kabul oranı", deger: olumluOran === null ? "—" : `%${olumluOran}`, alt: `${sayi(ozet.kabul)} kabul · ${sayi(ozet.karara) - sayi(ozet.kabul)} red/süre` },
          { ad: sozlesmeMi ? "Süren değer" : "Aktif değer", deger: kisaPara(aktifDeger), alt: sozlesmeMi ? "taslak, imza bekleyen, iş açılmamış" : "taslak ve gönderilmiş" },
          { ad: sozlesmeMi ? "İmza bekleyen" : "Yanıt bekleyen", deger: String(bekleyen), alt: bekleyenGec ? `${bekleyenGec} tanesi 7+ gündür` : "hepsi 7 günden yeni", ton: bekleyenGec ? "uyari" : undefined },
        ]}
        gruplar={[
          { baslik: "Son 6 ay · belge değeri", satirlar: aylikDeger.map((ay) => ({ ad: `${ay.ad} · ${ay.adet} belge`, adet: ay.toplam, etiket: kisaPara(ay.toplam) })) },
          { baslik: "Duruma göre", satirlar: durumDagilimi },
        ]}
      />
    </div>
  </main>;
}
