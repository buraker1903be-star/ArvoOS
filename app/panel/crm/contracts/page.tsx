import Link from "next/link";
import { belgeGonderimYolu } from "@/lib/belge-gonderim-yolu";
import { arvoKurumuMu } from "@/lib/arvo-kurumu";
import { getWhatsappStatus } from "@/lib/whatsapp-status";
import { waMeAdresi } from "@/lib/wa-me";
import { belgeAlicisi } from "../belge-alicisi";
import { WhatsappGonderDugmesi } from "../whatsapp-gonder-dugmesi";
import { ShareSendLink } from "../share-send-link";
import { daysSince, fetchLastContacts, waitingLabel } from "../last-contact";
import { resolvePublicHost } from "@/lib/public-host";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import {
  contractMessages,
  organizationBrandName,
} from "@/lib/customer-message-templates";
import { AKTIF_SOZLESME_GRUPLARI, SOZLESME_GRUP_ADLARI, type SozlesmeGrubu } from "@/lib/sozlesme-grubu";
import { CustomerCell, DateCell, LastContactCell, MobilSatir, RepresentativeCell, ServiceCell, kisaTarih } from "../table-cells";
import { OtomatikSecim } from "../otomatik-secim";
import { IstatistikKarti, degisimYazisi, kisaPara } from "../istatistik-karti";
import { aylikDilimler, oran } from "@/lib/liste-istatistik";
import { aramaDeseni, telefonAnahtari } from "@/lib/liste-arama";
import { aralikDisiMi, sayfaAraligi, sayfaNumarasi, sayfasizAdres, sonSayfaNo } from "@/lib/liste-sayfalama";
import { redirect } from "next/navigation";
import { simdi } from "../../os/genel-bakis";
import "../crm.css";
import "../kayit-detay/kayit-detay.css";
import { SatirTiklama } from "../satir-tiklama";
import { modulGerek } from "@/lib/modul-kapisi";

/*
  SÖZLEŞMELER LİSTESİ (2026-10): teklifler listesiyle aynı kalıp. Üstte
  başlık, altında durum şeridi (her sayı o duruma süzer, aktif
  sözleşmelerin değeri dahil); solda sözleşme tablosu (önceki sürümün
  sütunları), sağda istatistikler (imzalanma oranı, imza süresi, aylık
  imzalanan değer).

  Eskiden dört sayaç kutusu, ayrı süzgeç kartı, dokuz sütunlu tablo ve
  sayfanın en altında katlanmış bir arşiv vardı; arşivdeki operasyona
  devredilmiş sözleşmeler sözleşmeye değil Operasyon ana sayfasına
  gidiyordu. Artık her satır sözleşme detayına gider (orada "İşe git"
  var). Hangi sözleşmenin aktif sayılacağı kuralı lib/sozlesme-grubu.ts'te,
  testli; kural öncekiyle aynı.
*/

type Props = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    temsilci?: string;
    sayfa?: string;
    share?: string;
    doc_no?: string;
    customer_name?: string;
    title?: string;
    amount?: string;
    currency?: string;
  }>;
};
/* Görünümün satırı: sözleşme + fırsat + iş akışı alanları düz. */
type SozlesmeSatiri = {
  id: string;
  contract_no: string;
  title: string;
  amount: number;
  currency: string;
  due_date: string | null;
  status: string;
  sozlesme_grubu: SozlesmeGrubu;
  sent_at: string | null;
  signed_at: string | null;
  view_count: number;
  workflow_id: string | null;
  created_at: string;
  opportunity_id: string;
  customer_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  assigned_employee_id: string | null;
  request_details: Record<string, unknown> | null;
};
const GRUPLAR = Object.keys(SOZLESME_GRUP_ADLARI) as SozlesmeGrubu[];
const SERIT: SozlesmeGrubu[] = ["draft", "sent", "imzali", "operasyonda", "tamam"];

const GRUP_TONU: Record<SozlesmeGrubu, string> = { draft: "neutral", sent: "info", imzali: "warning", operasyonda: "success", tamam: "neutral", rejected: "danger", cancelled: "danger" };
const money = (v: number, c: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: c }).format(v / 100);

export default async function ContractsPage({ searchParams }: Props) {
  const p = await searchParams;
  const search = (p.search ?? "").trim().slice(0, 100);
  // Eski bağlantılar: ?status=signed imzalı tüm sözleşmeleri (iş açılmış ya da açılmamış) gösteriyordu.
  const status = p.status === "signed" || p.status === "arsiv" || p.status === "tumu" || GRUPLAR.includes(p.status as SozlesmeGrubu) ? p.status ?? "" : "";
  const temsilci = (p.temsilci ?? "").trim().slice(0, 80);
  const share = p.share ?? "";
  const docNo = p.doc_no ?? "";
  const customerName = p.customer_name ?? "";
  const { supabase, membership, organization, modules } = await getPanelContext();
  modulGerek(modules, "crm");

  /*
    LİSTE SUNUCUDA SÜZÜLÜYOR (11.10.2026) — teklif listesiyle aynı
    kalıp. Eskiden kurumun BÜTÜN sözleşmeleri fırsat kaydıyla çekilip
    bellekte süzülüyordu; üstüne bağlı iş akışlarının durumu ikinci bir
    sorguyla okunup grup hesaplanıyordu. Kayıt sayısı büyüdükçe
    yavaşlıyor, PostgREST'in satır tavanına çarptığında sessizce yanlış
    sayı gösteriyordu.

    crm_sozlesme_liste üçünü birleştiriyor ve grubu kendisi veriyor;
    istatistikler de veritabanında sayılıyor.
  */
  const sayfaNo = sayfaNumarasi(p.sayfa);
  const desen = aramaDeseni(search);
  const telefon = telefonAnahtari(search);

  /* Süzgeçler tek yerden: liste ve sayımlar aynı kümeyi görmeli. */
  const suzulmus = (sayarak = false) => {
    let q = sayarak
      ? supabase.from("crm_sozlesme_liste").select("id", { count: "exact", head: true })
          .eq("organization_id", membership.organization_id)
      : supabase.from("crm_sozlesme_liste").select("*", { count: "exact" })
          .eq("organization_id", membership.organization_id);
    if (desen) {
      q = q.or([
        `contract_no.ilike.*${desen}*`,
        `title.ilike.*${desen}*`,
        `customer_name.ilike.*${desen}*`,
        `contact_email.ilike.*${desen}*`,
        ...(telefon ? [`telefon_rakamlari.ilike.*${telefon}*`] : []),
      ].join(","));
    }
    if (temsilci === "atanmamis") q = q.is("assigned_employee_id", null);
    else if (temsilci) q = q.eq("assigned_employee_id", temsilci);
    return q;
  };

  /* Durum süzgeci: "tumu" hepsi, "arsiv" aktif OLMAYANLAR, "signed"
     eski bağlantılar için (imzalı + operasyonda), boş ise aktifler. */
  const grupSuzgeci = (q: ReturnType<typeof suzulmus>) =>
    status === "tumu" ? q
    : status === "arsiv" ? q.not("sozlesme_grubu", "in", `(${AKTIF_SOZLESME_GRUPLARI.join(",")})`)
    : status === "signed" ? q.in("sozlesme_grubu", ["imzali", "operasyonda"])
    : status ? q.eq("sozlesme_grubu", status)
    : q.in("sozlesme_grubu", AKTIF_SOZLESME_GRUPLARI);

  const sayim = async (grup: SozlesmeGrubu) =>
    (await suzulmus(true).eq("sozlesme_grubu", grup)).count ?? 0;

  const [
    { data, error, count: suzgecSayisi },
    { data: employeeData, error: employeeError },
    { data: ozetVerisi, error: ozetHatasi },
    ...seritSayilari
  ] = await Promise.all([
    grupSuzgeci(suzulmus())
      .order("created_at", { ascending: false })
      .range(...sayfaAraligi(sayfaNo)),
    supabase
      .from("hr_employees")
      .select("id,full_name,can_receive_sales_requests,employment_status")
      .eq("organization_id", membership.organization_id),
    /* Sağdaki kartın sayıları veritabanından; süzgeçten bağımsız
       (kurumun tamamı), o yüzden işleve süzgeç geçmiyor. */
    supabase.rpc("crm_sozlesme_istatistikleri", { p_organization_id: membership.organization_id }),
    ...SERIT.map((grup) => sayim(grup)),
  ]);
  /* Aralık dışı sayfa çökme değil: süzgeçler korunur, ilk sayfaya döner. */
  if (aralikDisiMi(error)) redirect(sayfasizAdres("/panel/crm/contracts", p));
  if (error) throw new Error("Sözleşmeler okunamadı: " + error.message);
  if (employeeError) throw new Error("Temsilciler okunamadı: " + employeeError.message);
  if (ozetHatasi) throw new Error("Sözleşme istatistikleri okunamadı: " + ozetHatasi.message);

  const representativeMap = new Map(((employeeData ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
  const rows = ((data ?? []) as unknown as SozlesmeSatiri[]).map((row) => ({ row, grup: row.sozlesme_grubu }));
  const sonSayfa = sonSayfaNo(suzgecSayisi, rows.length, sayfaNo);

  /* Şerit sayıları: süzgeçlerle aynı kümeden, durum süzgecinden
     bağımsız. Üstteki Aktif/Kapanan/Tümü da bunlardan türüyor —
     aynı kümeyi iki kez saymak iki farklı sayı göstermenin yoluydu. */
  const seritSayi = (grup: SozlesmeGrubu) => seritSayilari[SERIT.indexOf(grup)] ?? 0;
  const aktifSayisi = AKTIF_SOZLESME_GRUPLARI.reduce((toplam, grup) => toplam + seritSayi(grup), 0);
  const tumSayi = seritSayilari.reduce((toplam, adet) => toplam + adet, 0);

  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    [...new Set(rows.map(({ row }) => row.opportunity_id).filter(Boolean))],
  );

  /* İmza bağlantısı hazır şeridi: bağlantı oluşturulunca buraya ?share= ile
     dönülüyor (contract-actions.ts). Kendi numarasını bağlamamış kurumda
     WhatsApp eski usul (lib/belge-gonderim-yolu.ts). */
  let paylasim: React.ReactNode = null;
  if (share) {
    const waDurum = await getWhatsappStatus(membership.organization_id);
    const gonderimYolu = belgeGonderimYolu({
      kendiNumarasiBagli: waDurum.connected && waDurum.status !== "disabled",
      arvoKurumu: await arvoKurumuMu(supabase, membership.organization_id),
    });
    // Eski usul bağlantısının alıcısı; telefon URL'ye taşınmıyor (gerekçe: alici-telefonu.ts).
    const alici = await belgeAlicisi(supabase, membership.organization_id, "contract", share);
    const publicHost = await resolvePublicHost(supabase, membership.organization_id);
    const shareUrl = `https://${publicHost}/sozlesme/${share}`;
    const messages = contractMessages({
      organizationName: organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name }),
      customerName,
      documentNo: docNo,
      title: p.title,
      formattedAmount: p.amount ? money(Number(p.amount), p.currency || "TRY") : undefined,
      url: shareUrl,
    });
    paylasim = (
      <section className="teklif-paylasim" aria-label="İmza bağlantısı hazır">
        <span className="teklif-paylasim-ikon" aria-hidden="true">✓</span>
        <div className="teklif-paylasim-metin">
          <b>İmza bağlantısı hazır{docNo ? ` · ${docNo}` : ""}</b>
          <small title={shareUrl}>{shareUrl.replace(/^https:\/\//, "")}</small>
        </div>
        <div className="talep-iletisim">
          <ShareSendLink kind="contract" token={share} className="panel-primary" href={`mailto:${encodeURIComponent(alici.eposta ?? "")}?subject=${encodeURIComponent(messages.subject)}&body=${encodeURIComponent(messages.email)}`}>
            E-posta ile gönder
          </ShareSendLink>
          {gonderimYolu === "panel" ? (
            <WhatsappGonderDugmesi kind="contract" token={share} musteriAdi={customerName} />
          ) : (
            <ShareSendLink kind="contract" token={share} className="panel-secondary" newTab href={waMeAdresi(alici.telefon, messages.whatsapp)}>
              WhatsApp ile gönder
            </ShareSendLink>
          )}
          <a className="panel-secondary" target="_blank" rel="noreferrer" href={shareUrl}>Önizle</a>
          <Link className="panel-secondary" href="/panel/crm/contracts" aria-label="Kapat">✕</Link>
        </div>
      </section>
    );
  }

  /* Süzgeç değişince sayfa başa dönüyor: üçüncü sayfadayken "İmzalı"ya
     basan kullanıcı boş sayfaya düşüyordu. */
  const adres = (ek: { status?: string; temsilci?: string; sayfa?: number }) => {
    const q = new URLSearchParams();
    const d = ek.status ?? status;
    const t = ek.temsilci ?? temsilci;
    if (search) q.set("search", search);
    if (d) q.set("status", d);
    if (t) q.set("temsilci", t);
    if (ek.sayfa && ek.sayfa > 1) q.set("sayfa", String(ek.sayfa));
    const s = q.toString();
    return s ? `/panel/crm/contracts?${s}` : "/panel/crm/contracts";
  };
  /*
    İSTATİSTİKLER (sağ kart). Eskiden burada temsilcilere göre dağılım
    vardı; temsilci süzgeci listenin üstüne geldi. Sayılar tüm
    sözleşmelerden, süzgeçten bağımsız.
  */
  const an = simdi();
  /* Özet jsonb: ham sayılar veritabanından, etiketleme burada. */
  const ozet = (ozetVerisi ?? {}) as {
    toplam?: number; son30?: number; onceki30?: number; imzalanan?: number; kapanan?: number;
    imza_suresi_gun?: number | null; imza_suresi_adet?: number;
    imza_bekleyen?: number; imza_bekleyen_gec?: number; aktif_deger?: number;
    aylik?: { ay: string; adet: number; toplam: number }[];
    hizmetler?: { ad: string; adet: number }[];
    temsilciler?: string[];
  };
  const sayiAl = (deger: number | null | undefined) => Number(deger ?? 0);
  const son30 = sayiAl(ozet.son30);
  const onceki30 = sayiAl(ozet.onceki30);
  const degisim = onceki30 ? Math.round(((son30 - onceki30) / onceki30) * 100) : null;
  const imzalananSayisi = sayiAl(ozet.imzalanan);
  const kapananSayi = sayiAl(ozet.kapanan);
  const imzaOrani = oran(imzalananSayisi, imzalananSayisi + kapananSayi);
  /* Gün kesirli: çoğu sözleşme gönderildiği gün imzalanıyor, tam güne
     yuvarlanınca kart "0 gün" yazıyordu. Hiç ölçüm yoksa null. */
  const imzaSuresiAdet = sayiAl(ozet.imza_suresi_adet);
  const ortalamaImza = ozet.imza_suresi_gun === null || ozet.imza_suresi_gun === undefined
    ? null
    : Number(ozet.imza_suresi_gun);
  const imzaBekleyenSayisi = sayiAl(ozet.imza_bekleyen);
  const imzaBekleyenGec = sayiAl(ozet.imza_bekleyen_gec);
  const aylikImza = aylikDilimler(ozet.aylik ?? [], 6, an);
  const hizmetler = (ozet.hizmetler ?? []).map((satir) => [satir.ad, Number(satir.adet)] as [string, number]);
  /* Temsilci seçimi: satış talebi alabilen aktif personel ve
     sözleşmelerde adı geçen herkes — ikincisi de özetten. */
  const atananlar = new Set(ozet.temsilciler ?? []);
  const temsilciSecenekleri = ((employeeData ?? []) as { id: string; full_name: string; can_receive_sales_requests: boolean; employment_status: string }[])
    .filter((e) => (e.employment_status === "active" && e.can_receive_sales_requests) || atananlar.has(e.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
  const filtered = Boolean(search || temsilci || status);
  const seciliEtiket = status === "signed" ? "İmzalı" : GRUPLAR.includes(status as SozlesmeGrubu) ? SOZLESME_GRUP_ADLARI[status as SozlesmeGrubu] : null;

  return (
    <main className="talep cari ekip talepler teklifler liste-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CRM</small>
          <h1>Sözleşmeler</h1>
        </div>
        <div className="talep-bas-eylem">
          {/* Sözleşme tekliften ya da talepten hazırlanıyor; buradan oluşturulmuyor. */}
          <Link className="panel-secondary" href="/panel/crm/proposals">Tekliflere git</Link>
        </div>
      </header>

      {paylasim}

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {SERIT.map((grup) => (
            <div key={grup} className={status === grup ? "is-active" : undefined}>
              <dt>{SOZLESME_GRUP_ADLARI[grup]}</dt>
              <dd><Link href={adres({ status: grup })} aria-current={status === grup ? "page" : undefined}>{seritSayi(grup)}</Link></dd>
            </div>
          ))}
          {/* Geciken ve aktif değer artık özetten: ikisi de kurumun
              tamamına göre, şeritteki sayımlar ise süzgece göre. İkisini
              aynı kümeden hesaplamak için listeyi baştan sona okumak
              gerekiyordu. */}
          <div><dt>7+ gündür imza bekleyen</dt><dd className={imzaBekleyenGec ? "talep-uyari" : undefined}>{imzaBekleyenGec}</dd></div>
          <div className="cari-bakiye"><dt>Aktif sözleşme değeri</dt><dd>{money(sayiAl(ozet.aktif_deger), "TRY")}</dd></div>
        </dl>
      </nav>

      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Sözleşme listesi">
          <div className="ekip-suzgec talep-suzgec">
            <Link href={adres({ status: "" })} className={!status ? "is-active" : undefined}>Aktif <small>{aktifSayisi}</small></Link>
            <Link href={adres({ status: "arsiv" })} className={status === "arsiv" ? "is-active" : undefined}>Kapanan <small>{tumSayi - aktifSayisi}</small></Link>
            <Link href={adres({ status: "tumu" })} className={status === "tumu" ? "is-active" : undefined}>Tümü <small>{tumSayi}</small></Link>
            {seciliEtiket ? <span className="talep-suzgec-etiket">{seciliEtiket}</span> : null}
            {/* Temsilci süzgeci eskiden sağdaki temsilci kartındaydı; o kartın
                yerini istatistikler aldı, süzgeç buraya geldi. */}
            <form action="/panel/crm/contracts" className="talep-ara talep-ara--secimli" role="search">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <OtomatikSecim name="temsilci" defaultValue={temsilci} className="talep-temsilci-sec" label="Satış temsilcisi">
                <option value="">Tüm temsilciler</option>
                <option value="atanmamis">Atanmamış</option>
                {temsilciSecenekleri.map((e) => (
                  <option key={e.id} value={e.id}>{formatPersonName(e.full_name)}</option>
                ))}
              </OtomatikSecim>
              <input name="search" defaultValue={search} placeholder="Sözleşme no, müşteri, konu ara" aria-label="Sözleşme / müşteri ara" />
            </form>
          </div>

          {rows.length ? (
            /* Önceki sürümün sütunları; satırın tamamı ilk hücredeki
               bağlantıyla tıklanır (panel-premium.css). */
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="contracts">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Müşteri</th>
                    <th>Hizmet türü</th>
                    <th className="crm-col-rep">Temsilci</th>
                    <th className="crm-col-amount">Tutar</th>
                    <th>Durum</th>
                    <th className="crm-col-date">Teslim</th>
                    <th className="crm-col-contact">Son temas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, grup }) => {
                    const repId = row.assigned_employee_id;
                    const representativeName = repId ? (representativeMap.get(repId) ?? "Pasif personel") : null;
                    const gecikti = grup === "sent" && (daysSince(row.sent_at) ?? 0) >= 7;
                    const alt =
                      grup === "sent" ? (row.view_count ? `${waitingLabel(row.sent_at) ?? ""} · ${row.view_count} kez görüldü` : `${waitingLabel(row.sent_at) ?? ""} · açılmadı`)
                      : grup === "imzali" ? "İş akışı açılmadı"
                      : null;
                    return (
                      <tr key={row.id}>
                        <td className="crm-table-mono" data-label="Sözleşme No">
                          <Link className="crm-row-link" href={`/panel/crm/contracts/${row.id}`} aria-label={`${row.contract_no} sözleşmesini aç`}>{row.contract_no}</Link>
                        </td>
                        <CustomerCell name={row.customer_name ?? undefined} phone={row.contact_phone} email={row.contact_email} href={`/panel/crm/musteri/${row.opportunity_id}`} />
                        <ServiceCell service={String(row.request_details?.service_type ?? "")} />
                        <RepresentativeCell name={representativeName} />
                        <td data-label="Tutar" className="crm-col-amount">{money(Number(row.amount), row.currency || "TRY")}</td>
                        <td data-label="Durum">
                          <span className="status-pill" data-tone={GRUP_TONU[grup]}>{SOZLESME_GRUP_ADLARI[grup]}</span>
                          {alt ? <small className={gecikti || grup === "imzali" ? "crm-waiting is-late" : "crm-waiting"}>{alt}</small> : null}
                        </td>
                        <DateCell label="Teslim" value={row.due_date} />
                        <LastContactCell contact={lastContacts.get(row.opportunity_id)} />
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                        <MobilSatir
                          href={`/panel/crm/contracts/${row.id}`}
                          baslik={formatPersonName(row.customer_name) || "—"}
                          durum={{ etiket: SOZLESME_GRUP_ADLARI[grup], ton: GRUP_TONU[grup] }}
                          alt={[String(row.request_details?.service_type ?? "").trim() || "Hizmet belirtilmedi", representativeName ? formatPersonName(representativeName) : "Atanmamış"]}
                          isaretler={[
                            { metin: money(Number(row.amount), row.currency || "TRY"), ton: "guclu" },
                            { metin: row.contract_no, ton: "sessiz" },
                            alt ? { metin: alt, ton: gecikti || grup === "imzali" ? "uyari" : "bilgi" } : null,
                            row.due_date ? { metin: `Teslim ${kisaTarih(row.due_date)}`, ton: "sessiz" } : null,
                          ]}
                        />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
              {/* Sayfalayıcı: teklif ve posta listeleriyle aynı kalıp. */}
              {sonSayfa > 1 ? (
                <nav className="liste-sayfalar" aria-label="Sayfalar">
                  {sayfaNo > 1
                    ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo - 1 })}>← Önceki</Link>
                    : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
                  <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} sözleşme` : ""}</small>
                  {sayfaNo < sonSayfa
                    ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo + 1 })}>Sonraki →</Link>
                    : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
                </nav>
              ) : null}
            </div>
          ) : (
            <div className="crm-empty-state talep-bos-kutu">
              <h2>{tumSayi === 0 ? "Henüz sözleşme yok" : filtered ? "Eşleşen sözleşme yok" : "Aktif sözleşme yok"}</h2>
              <p>
                {tumSayi === 0
                  ? "Sözleşmeler kabul edilen bir tekliften “Sözleşmeye dönüştür” ile ya da talep sayfasındaki “Direkt sözleşme” ile hazırlanır."
                  : filtered
                    ? "Aramayı veya süzgeci değiştirip yeniden deneyin."
                    : "İmza bekleyen ya da işi açılmamış sözleşme yok. Operasyona devredilen, tamamlanan, reddedilen ve iptal edilenler “Kapanan”da."}
              </p>
              <div className="crm-empty-actions">
                {filtered ? <Link className="panel-secondary" href="/panel/crm/contracts">Süzgeci temizle</Link> : null}
                {tumSayi === 0 ? <Link className="panel-primary" href="/panel/crm/proposals">Tekliflere git</Link> : null}
              </div>
            </div>
          )}
        </section>

        <IstatistikKarti
          kapsam="tüm sözleşmeler"
          kutular={[
            { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni sözleşme", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
            { ad: "İmzalanma oranı", deger: imzaOrani === null ? "—" : `%${imzaOrani}`, alt: `${imzalananSayisi} imzalı · ${kapananSayi} red/iptal` },
            { ad: "Ortalama imza süresi", deger: ortalamaImza === null ? "—" : ortalamaImza < 1 ? "Aynı gün" : `${Math.round(ortalamaImza)} gün`, alt: `gönderimden imzaya · ${imzaSuresiAdet} sözleşme` },
            { ad: "İmza bekleyen", deger: String(imzaBekleyenSayisi), alt: imzaBekleyenGec ? `${imzaBekleyenGec} tanesi 7+ gündür` : "hepsi 7 günden yeni", ton: imzaBekleyenGec ? "uyari" : undefined },
          ]}
          gruplar={[
            { baslik: "Son 6 ay · imzalanan değer", satirlar: aylikImza.map((ay) => ({ ad: `${ay.ad} · ${ay.adet} sözleşme`, adet: ay.toplam, etiket: kisaPara(ay.toplam) })) },
            { baslik: "Hizmet türüne göre", satirlar: hizmetler.map(([ad, adet]) => ({ ad, adet })) },
          ]}
        />
      </div>
    </main>
  );
}
