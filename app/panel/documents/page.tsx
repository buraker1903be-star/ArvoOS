import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { CustomerCell, DateCell } from "../crm/table-cells";
import { OtomatikSecim } from "../crm/otomatik-secim";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../crm/istatistik-karti";
import { aylik, enCok, oran, son30Degisim } from "@/lib/liste-istatistik";
import { simdi } from "../os/genel-bakis";
import { SatirTiklama } from "../crm/satir-tiklama";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";

/*
  BELGE MERKEZİ (10.10.2026): panelin liste kalıbında. Üstte başlık,
  altında sayaç şeridi (her sayı süzgeç), solda belge tablosu, sağda
  istatistikler.

  Eskiden üç ayrı tasarım dili bir aradaydı: panel-pagehead başlığı,
  module-tabs sekmeleri, crm-metrics kutuları, ayrı bir süzgeç kartı ve
  her belgeyi ayrı bir KART olarak çizen crm-record-list. Dört düğmeli
  kartlar ekranda yalnızca üç belge gösteriyordu; aynı işi yapan öteki
  listeler (teklifler, sözleşmeler) tabloya geçeli bir hafta olmuştu.

  SAYILAR SORGUDAN, LİSTEDEN DEĞİL. Önceki sürüm kurumun BÜTÜN teklif ve
  sözleşmelerini çekip JavaScript'te süzüyordu: sayfa her açılışta iki
  sınırsız sorgu demekti ve "filtrelenen değer" de o listeden
  toplanıyordu. Artık sayımlar head sorgusuyla, liste sayfalanarak
  geliyor; para toplamı ise SON 30 GÜNle sınırlı, çünkü sayfalanmış bir
  listenin toplamını "filtrelenen değer" diye göstermek sayfa boyunu
  toplam sanmak olurdu (AGENTS.md · rakam denetimi).
*/

export const dynamic = "force-dynamic";

const SAYFA_BOYU = 50;
const AY = 30 * 86_400_000;

type Iliski = { customer_name: string | null };
type BelgeSatiri = {
  id: string;
  title: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  opportunity_id: string | null;
  crm_opportunities: Iliski | Iliski[] | null;
  // teklif
  proposal_no?: string;
  revision_no?: number | null;
  superseded_by?: string | null;
  // sözleşme
  contract_no?: string;
  signed_at?: string | null;
  workflow_id?: string | null;
};

const para = (kurus: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(Number(kurus || 0) / 100);

const TEKLIF_DURUMU: Record<string, { ad: string; ton: string }> = {
  draft: { ad: "Taslak", ton: "neutral" },
  sent: { ad: "Gönderildi", ton: "warning" },
  accepted: { ad: "Kabul edildi", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
  expired: { ad: "Süresi doldu", ton: "neutral" },
  archived: { ad: "Arşiv", ton: "neutral" },
};
const SOZLESME_DURUMU: Record<string, { ad: string; ton: string }> = {
  draft: { ad: "Taslak", ton: "neutral" },
  sent: { ad: "İmza bekliyor", ton: "warning" },
  signed: { ad: "İmzalandı", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
  cancelled: { ad: "İptal", ton: "neutral" },
  completed: { ad: "Tamamlandı", ton: "success" },
};

const musteriAdi = (iliski: Iliski | Iliski[] | null) => {
  const kayit = Array.isArray(iliski) ? iliski[0] : iliski;
  return kayit?.customer_name ?? null;
};

export default async function BelgelerSayfasi({ searchParams }: {
  searchParams: Promise<{ tab?: string; status?: string; search?: string; sayfa?: string }>;
}) {
  const params = await searchParams;
  const sekme = params.tab === "sozlesmeler" ? "sozlesmeler" : "teklifler";
  const sozlesmeMi = sekme === "sozlesmeler";
  const tablo = sozlesmeMi ? "crm_contracts" : "crm_proposals";
  const noSutunu = sozlesmeMi ? "contract_no" : "proposal_no";
  const durumlar = sozlesmeMi ? SOZLESME_DURUMU : TEKLIF_DURUMU;

  const durum = (params.status ?? "").trim();
  const arama = (params.search ?? "").trim().slice(0, 80);
  const sayfaNo = Math.max(1, Number.parseInt(params.sayfa ?? "1", 10) || 1);

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => ["documents", "crm"].includes(modul.code))) {
    throw new Error("Belge Merkezi'ne erişiminiz yok.");
  }

  /*
    Müşteri adıyla arama: ad belgede değil bağlı fırsatta duruyor ve
    PostgREST gömülü ilişkide ilike süzemiyor. Önce eşleşen fırsatlar
    bulunuyor, sonra belge sorgusuna "ya numarası/konusu ya da şu
    fırsatlardan biri" diye giriyor. Eskiden arama bütün belgeler
    çekilip JavaScript'te yapılıyordu.
  */
  const firsatIdleri = arama
    ? ((await supabase.from("crm_opportunities").select("id")
        .eq("organization_id", membership.organization_id)
        .ilike("customer_name", `%${arama}%`).limit(200)).data ?? []).map((satir) => (satir as { id: string }).id)
    : [];

  const sutunlar = sozlesmeMi
    ? "id,contract_no,title,amount,currency,status,signed_at,workflow_id,created_at,opportunity_id,crm_opportunities(customer_name)"
    : "id,proposal_no,title,amount,currency,status,revision_no,superseded_by,created_at,opportunity_id,crm_opportunities(customer_name)";

  let liste = supabase.from(tablo).select(sutunlar, { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false })
    .range((sayfaNo - 1) * SAYFA_BOYU, sayfaNo * SAYFA_BOYU - 1);
  if (durum && durumlar[durum]) liste = liste.eq("status", durum);
  if (arama) {
    const kosullar = [`${noSutunu}.ilike.*${arama}*`, `title.ilike.*${arama}*`];
    if (firsatIdleri.length) kosullar.push(`opportunity_id.in.(${firsatIdleri.join(",")})`);
    liste = liste.or(kosullar.join(","));
  }

  /* Sayımlar ayrı ve SINIRSIZ: sayfadaki satırları saymak sayfa boyunu
     toplam sanmak olurdu. */
  const say = (hedefTablo: string, durumKodu?: string) => {
    let q = supabase.from(hedefTablo).select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id);
    if (durumKodu) q = q.eq("status", durumKodu);
    return q;
  };

  /* İstatistik penceresi SON 6 AY: kurumun bütün geçmişini her açılışta
     çekmek, sayfanın asıl maliyetiydi. Kartın kapsamı da bunu yazıyor. */
  const pencereBasi = new Date(simdi() - 6 * AY).toISOString();

  const [
    { data: satirVerisi, error: listeHatasi, count: suzgecSayisi },
    { count: teklifSayisi },
    { count: sozlesmeSayisi },
    { count: kabulSayisi },
    { count: imzaliSayisi },
    { count: bekleyenSayisi },
    { data: pencereVerisi, error: pencereHatasi },
  ] = await Promise.all([
    liste,
    say("crm_proposals"),
    say("crm_contracts"),
    say("crm_proposals", "accepted"),
    say("crm_contracts", "signed"),
    say(tablo, "sent"),
    /* SINIR YOK, bilerek: kartın bütün sayıları bu pencereden
       türetiliyor ve .limit() koymak sınıra ulaşıldığı gün toplamı
       sessizce eksiltirdi (AGENTS.md · rakam denetimi). Pencere zaten
       altı ayla sınırlı ve üç sütun okunuyor. */
    supabase.from(tablo).select("amount,status,created_at")
      .eq("organization_id", membership.organization_id)
      .gte("created_at", pencereBasi)
      .order("created_at", { ascending: false }),
  ]);
  if (listeHatasi) throw new Error("Belgeler okunamadı: " + listeHatasi.message);
  if (pencereHatasi) throw new Error("Belge istatistikleri okunamadı: " + pencereHatasi.message);

  const satirlar = (satirVerisi ?? []) as unknown as BelgeSatiri[];
  const pencere = (pencereVerisi ?? []) as { amount: number; status: string; created_at: string }[];
  const sonSayfa = typeof suzgecSayisi === "number"
    ? Math.max(1, Math.ceil(suzgecSayisi / SAYFA_BOYU))
    : satirlar.length === SAYFA_BOYU ? sayfaNo + 1 : sayfaNo;

  const an = simdi();
  const { son30, degisim } = son30Degisim(pencere.map((satir) => satir.created_at), an);
  const son30Deger = pencere
    .filter((satir) => an - Date.parse(satir.created_at) < 30 * 86_400_000)
    .reduce((toplam, satir) => toplam + Number(satir.amount), 0);
  const olumlu = sozlesmeMi ? "signed" : "accepted";
  const donusumOrani = oran(pencere.filter((satir) => satir.status === olumlu).length, pencere.length);
  const aylikBelge = aylik(pencere.map((satir) => ({ tarih: satir.created_at, tutar: Number(satir.amount) })), 6, an);
  const durumDagilimi = enCok(pencere.map((satir) => durumlar[satir.status]?.ad ?? satir.status), 6);

  const adres = (degisen: { tab?: string; status?: string; search?: string; sayfa?: string }) => {
    const p = new URLSearchParams();
    const al = (ad: "tab" | "status" | "search" | "sayfa", simdiki: string) =>
      (ad in degisen ? degisen[ad] : simdiki) || "";
    const t = al("tab", sekme), d = al("status", durum), a = al("search", arama), s = al("sayfa", "");
    if (t !== "teklifler") p.set("tab", t);
    if (d) p.set("status", d);
    if (a) p.set("search", a);
    if (s) p.set("sayfa", s);
    return p.size ? `/panel/documents?${p}` : "/panel/documents";
  };

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

    {/* Şerit hem sayaç hem süzgeç: panelin öteki listelerinde de rakama
        tıklanıyor, belge merkezi ayrı davranmasın. */}
    <nav className="kayit-serit talep-serit" aria-label="Belge türü ve durum">
      <dl>
        <div className={!sozlesmeMi ? "is-active" : undefined}>
          <dt>Teklifler</dt>
          <dd><Link href={adres({ tab: "teklifler", status: "", sayfa: "" })}>{teklifSayisi ?? 0}</Link></dd>
        </div>
        <div className={sozlesmeMi ? "is-active" : undefined}>
          <dt>Sözleşmeler</dt>
          <dd><Link href={adres({ tab: "sozlesmeler", status: "", sayfa: "" })}>{sozlesmeSayisi ?? 0}</Link></dd>
        </div>
        <div>
          <dt>{sozlesmeMi ? "İmzalı" : "Kabul edilen"}</dt>
          <dd><Link href={adres({ status: sozlesmeMi ? "signed" : "accepted", sayfa: "" })}>{(sozlesmeMi ? imzaliSayisi : kabulSayisi) ?? 0}</Link></dd>
        </div>
        <div className={durum === "sent" ? "is-active" : undefined}>
          <dt>{sozlesmeMi ? "İmza bekleyen" : "Gönderilen"}</dt>
          <dd><Link href={adres({ status: "sent", sayfa: "" })}>{bekleyenSayisi ?? 0}</Link></dd>
        </div>
        <div className="cari-bakiye">
          <dt>Son 30 gün · belge değeri</dt>
          <dd>{para(son30Deger, "TRY")}</dd>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Belge listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ status: "", sayfa: "" })} className={!durum ? "is-active" : undefined}>
            Tümü <small>{(sozlesmeMi ? sozlesmeSayisi : teklifSayisi) ?? 0}</small>
          </Link>
          {/* Durum süzgeci seçimle uygulanıyor; sekme ve arama korunuyor. */}
          <form action="/panel/documents" className="talep-ara talep-ara--secimli" role="search">
            {sozlesmeMi ? <input type="hidden" name="tab" value="sozlesmeler" /> : null}
            <OtomatikSecim name="status" defaultValue={durum} className="talep-temsilci-sec" label="Durum">
              <option value="">Tüm durumlar</option>
              {Object.entries(durumlar).map(([kod, etiket]) => (
                <option key={kod} value={kod}>{etiket.ad}</option>
              ))}
            </OtomatikSecim>
            <input name="search" defaultValue={arama}
              placeholder={sozlesmeMi ? "SOZ no, müşteri, konu ara" : "TKF no, müşteri, konu ara"}
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
                  const etiket = durumlar[satir.status] ?? { ad: satir.status, ton: "neutral" };
                  const altMetin = sozlesmeMi
                    ? satir.title || "Konusuz sözleşme"
                    : `${satir.title || "Konusuz teklif"}${satir.revision_no ? ` · R${satir.revision_no}` : ""}${satir.superseded_by ? " · eski sürüm" : ""}`;
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
                      <CustomerCell name={musteriAdi(satir.crm_opportunities) ?? "Müşteri"} href={satir.opportunity_id ? `/panel/crm/musteri/${satir.opportunity_id}` : null} />
                      <td data-label="Durum"><span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span></td>
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
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{durum || arama
              ? "Eşleşen belge yok"
              : sozlesmeMi ? "Henüz sözleşme belgesi yok" : "Henüz teklif belgesi yok"}</h2>
            <p>{durum || arama
              ? "Aramayı veya durum süzgecini değiştirip yeniden deneyin."
              : sozlesmeMi
                ? "Sözleşmeler CRM'de kabul edilen tekliften ya da talepten hazırlanır; her sözleşme burada önizleme, imza durumu ve yaşam döngüsüyle listelenir."
                : "Teklifler CRM'de bir talepten hazırlanır; her teklif ve revizyonu burada önizleme ve PDF ile listelenir."}</p>
            <div className="crm-empty-actions">
              {durum || arama
                ? <Link className="panel-secondary" href={adres({ status: "", search: "", sayfa: "" })}>Süzgeci temizle</Link>
                : <Link className="panel-primary" href={sozlesmeMi ? "/panel/crm/contracts" : "/panel/crm"}>{sozlesmeMi ? "Sözleşmelere git" : "Taleplere git"}</Link>}
            </div>
          </div>
        )}

        {sonSayfa > 1 ? (
          <nav className="liste-sayfalar" aria-label="Sayfalar">
            {sayfaNo > 1
              ? <Link href={adres({ sayfa: sayfaNo === 2 ? "" : String(sayfaNo - 1) })}>← Önceki</Link>
              : <span aria-hidden="true">← Önceki</span>}
            <b>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} belge` : ""}</b>
            {sayfaNo < sonSayfa
              ? <Link href={adres({ sayfa: String(sayfaNo + 1) })}>Sonraki →</Link>
              : <span aria-hidden="true">Sonraki →</span>}
          </nav>
        ) : null}
      </section>

      <IstatistikKarti
        kapsam={`son 6 ay · ${sozlesmeMi ? "sözleşmeler" : "teklifler"}`}
        kutular={[
          { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni belge", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
          { ad: sozlesmeMi ? "İmzalanma oranı" : "Kabul oranı", deger: donusumOrani === null ? "—" : `%${donusumOrani}`, alt: `${pencere.length} belge içinde` },
          { ad: "Son 30 gün değeri", deger: kisaPara(son30Deger), alt: son30 ? `${son30} belge` : "yeni belge yok" },
          { ad: sozlesmeMi ? "İmza bekleyen" : "Yanıt bekleyen", deger: String(bekleyenSayisi ?? 0), alt: "gönderilmiş, sonuçlanmamış", ton: (bekleyenSayisi ?? 0) ? "uyari" : undefined },
        ]}
        gruplar={[
          { baslik: "Son 6 ay · belge değeri", satirlar: aylikBelge.map((ay) => ({ ad: ay.ad, adet: Math.max(0, ay.toplam), etiket: kisaPara(ay.toplam) })) },
          { baslik: "Duruma göre", satirlar: durumDagilimi.map(([ad, adet]) => ({ ad, adet })) },
        ]}
      />
    </div>
  </main>;
}
