import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { fetchLastContacts } from "./last-contact";
import { CustomerCell, DateCell, LastContactCell, RepresentativeCell, ServiceCell } from "./table-cells";
import { OtomatikSecim } from "./otomatik-secim";
import { IstatistikKarti, degisimYazisi } from "./istatistik-karti";
import { oran } from "@/lib/liste-istatistik";
import { aramaDeseni, telefonAnahtari } from "@/lib/liste-arama";
import { sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { RequestEntryForm } from "./request-entry-form";
import { CustomerLookupButton } from "./customer-lookup";
import { requestStageNames } from "./request-status";
import { EmptyNewRequestButton } from "./empty-new-request";
import { PostadanTalep } from "./postadan-talep";
import "./crm.css";
import "./request-page.css";
import "./kayit-detay/kayit-detay.css";
import { SatirTiklama } from "./satir-tiklama";

/*
  TALEPLER LİSTESİ (2026-10): ekip listesiyle aynı kalıp. Üstte başlık,
  "Müşteri sorgula" ve "Yeni talep"; altında aşama şeridi (her sayı o
  aşamaya süzer); solda talep tablosu, sağda istatistikler (son 30 gün,
  dönüşüm, hizmet türü ve kaynak dağılımı).

  Eskiden dört sayaç kutusu, ayrı bir süzgeç kartı ("Filtrele" /
  "Temizle") ve sekiz sütunlu tablo alt alta duruyordu. Süzgeç artık
  listenin üstünde tek satır (durum, temsilci, arama).
*/

type SearchParams = Promise<{
  arama?: string;
  durum?: string;
  temsilci?: string;
  sayfa?: string;
}>;
type Details = {
  service_type?: string;
  academic_level?: string;
  university?: string;
  department?: string;
  language?: string;
  scope?: string;
};
/* Görünümün satırı: fırsat + arama alanları (telefon anahtarı, hizmet
   türü, temsilci adı) + son yorum zamanı, hepsi düz. */
type TalepSatiri = {
  id: string;
  telefon_rakamlari: string | null;
  hizmet_turu: string | null;
  temsilci_adi: string | null;
  son_yorum_at: string | null;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  estimated_value: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  request_details: Details | null;
  assigned_employee_id: string | null;
  /** Arşiv sebebi; listede durum rozetinin altında görünür. */
  lost_reason: string | null;
  created_at: string;
};
type SalesRepresentative = {
  id: string;
  full_name: string;
  job_title: string | null;
};
const ASAMALAR = [
  { kod: "lead", ad: "Yeni talep" },
  { kod: "qualified", ad: "İnceleniyor" },
  { kod: "proposal", ad: "Teklife devredildi" },
  { kod: "lost", ad: "Arşivlendi" },
] as const;
/** Teklife ya da ötesine geçmiş talepler: dönüşüm oranının payı. */
const ILERLEYEN = new Set(["proposal", "contract", "won"]);
/*
  Kaynak adları: veritabanında serbest yazılmış ("INSTAGRAM", "WEB SİTESİ",
  aktarımdan gelen "arvocore_migration"). Küçük harfe indirip bilinenleri
  adlandırıyoruz; bilinmeyen değerin yalnızca ilk harfi büyük.
*/
const KAYNAK_ADLARI: Record<string, string> = { website: "Web sitesi", site: "Web sitesi", "web sitesi": "Web sitesi", manual: "Elle giriş", panel: "Elle giriş", whatsapp: "WhatsApp", instagram: "Instagram", phone: "Telefon", telefon: "Telefon", email: "E-posta", "e-posta": "E-posta", referral: "Tavsiye", tavsiye: "Tavsiye", arvocore_migration: "Eski sistemden aktarım" };
function kaynakAdi(kaynak: string | null) {
  const anahtar = (kaynak ?? "").trim().toLocaleLowerCase("tr");
  if (!anahtar) return "Belirtilmedi";
  return KAYNAK_ADLARI[anahtar] ?? anahtar.charAt(0).toLocaleUpperCase("tr") + anahtar.slice(1);
}
const clean = (v?: string) => (v ?? "").trim().slice(0, 100);
const active = new Set(["lead", "qualified"]);
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { arama, durum, temsilci, sayfa } = await searchParams;
  const search = clean(arama).toLocaleLowerCase("tr-TR");
  const selected = clean(durum);
  const selectedRepresentative = clean(temsilci);
  const { supabase, membership, modules, izin } = await getPanelContext();
  const canAssign = izin("crm.kayit.ata");
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  /*
    LİSTE SUNUCUDA SÜZÜLÜYOR (11.10.2026). Dört büyük listenin
    sonuncusu; talep tablosu en çok büyüyeni, her gelen istek bir
    satır. Eskiden kurumun bütün kayıtları çekilip bellekte
    süzülüyordu: arama, aşama, temsilci, şerit sayıları ve kartın altı
    sayısı hep o diziden.

    crm_talep_liste arama için gerekenleri düz veriyor (telefon
    anahtarı, hizmet türü, temsilci adı); kart da
    crm_talep_istatistikleri'nden. Aşama kümeleri işleve PARAMETRE
    olarak gidiyor — kural burada yaşıyor, SQL'e kopyalanmadı.
  */
  const sayfaNo = sayfaNumarasi(sayfa);
  const desen = aramaDeseni(arama ?? "");
  const telefon = telefonAnahtari(arama ?? "");

  const suzulmus = (sayarak = false) => {
    let q = sayarak
      ? supabase.from("crm_talep_liste").select("id", { count: "exact", head: true })
      : supabase.from("crm_talep_liste").select("*", { count: "exact" });
    q = q.eq("organization_id", membership.organization_id);
    if (desen) {
      q = q.or([
        `customer_name.ilike.*${desen}*`,
        `title.ilike.*${desen}*`,
        `contact_email.ilike.*${desen}*`,
        `hizmet_turu.ilike.*${desen}*`,
        `temsilci_adi.ilike.*${desen}*`,
        ...(telefon ? [`telefon_rakamlari.ilike.*${telefon}*`] : []),
      ].join(","));
    }
    if (selectedRepresentative === "atanmamis") q = q.is("assigned_employee_id", null);
    else if (selectedRepresentative) q = q.eq("assigned_employee_id", selectedRepresentative);
    return q;
  };

  /* Aşama süzgeci: "tumu" hepsi, seçili aşama tek, boşsa aktifler. */
  const asamaSuzgeci = (q: ReturnType<typeof suzulmus>) =>
    selected === "tumu" ? q
    : selected ? q.eq("stage", selected)
    : q.in("stage", [...active]);

  const sayim = async (asama: string) => (await suzulmus(true).eq("stage", asama)).count ?? 0;
  const SERIT_ASAMALARI = [...active, ...ILERLEYEN, "lost"];

  const [
    { data, error, count: suzgecSayisi },
    { data: stages, error: stageError },
    { data: employeeData, error: employeeError },
    { data: turData },
    { data: ozetVerisi, error: ozetHatasi },
    ...seritSayilari
  ] = await Promise.all([
    asamaSuzgeci(suzulmus())
      .order("updated_at", { ascending: false })
      .range(sayfaAraligi(sayfaNo)[0], sayfaAraligi(sayfaNo)[1]),
    supabase
      .from("organization_crm_stages")
      .select("code")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true),
    supabase
      .from("hr_employees")
      .select("id,full_name,job_title")
      .eq("organization_id", membership.organization_id)
      .eq("employment_status", "active")
      .eq("can_receive_sales_requests", true)
      .order("full_name"),
    // Çalışma türleri ("Yeni talep" formundaki seçim) aynı adımda.
    supabase
      .from("organization_step_template_sets")
      .select("code,name,is_default")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order")
      .order("code"),
    /* Kart süzgeçten bağımsız (kurumun tamamı); aşama kümeleri
       buradan gidiyor. */
    supabase.rpc("crm_talep_istatistikleri", {
      p_organization_id: membership.organization_id,
      p_aktif: [...active],
      p_ilerleyen: [...ILERLEYEN],
    }),
    ...SERIT_ASAMALARI.map((asama) => sayim(asama)),
  ]);
  if (error) throw new Error("Talepler okunamadı: " + error.message);
  if (stageError)
    throw new Error("Talep ayarları okunamadı: " + stageError.message);
  if (employeeError)
    throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  if (ozetHatasi) throw new Error("Talep istatistikleri okunamadı: " + ozetHatasi.message);
  const representatives = (employeeData ?? []) as SalesRepresentative[];
  const representativeMap = new Map(
    representatives.map((item) => [item.id, item.full_name]),
  );
  const academicMode = (stages ?? []).some((s) => s.code === "academic_review");
  const calismaTurleri = (turData ?? []) as { code: string; name: string; is_default: boolean }[];

  const rows = (data ?? []) as unknown as TalepSatiri[];
  const sonSayfa = sonSayfaNo(suzgecSayisi, rows.length, sayfaNo);
  /* Şerit sayıları: arama ve temsilci süzgeciyle aynı kümeden, aşama
     süzgecinden bağımsız. */
  const counts = (code: string) => seritSayilari[SERIT_ASAMALARI.indexOf(code)] ?? 0;

  /* Son temas yalnızca BU SAYFADAKİ kayıtlar için: eskiden aktif
     taleplerin tamamı için okunuyordu ("notsuz" sayacı onu istiyordu),
     o sayı artık veritabanından geliyor. */
  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    rows.map((item) => item.id),
  );
  // Boş liste: hiç kayıt yok mu, yoksa arama/filtre mi eşleşmedi?
  const filtered = Boolean(search || selectedRepresentative || (selected && selected !== "tumu"));
  /*
    Adres yardımcısı: bir süzgeci değiştirirken diğerleri korunur.
    Kullanıcı daraltılmış bir listeden aşama sayısına tıklayınca aramasını
    kaybetmesin (eski sayaç bağlantılarının kuralı). Süzgeç değişince
    sayfa başa dönüyor.
  */
  const adres = (ek: { durum?: string; temsilci?: string; sayfa?: number }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? selected;
    const t = ek.temsilci ?? selectedRepresentative;
    if (arama) q.set("arama", arama);
    if (d) q.set("durum", d);
    if (t) q.set("temsilci", t);
    if (ek.sayfa && ek.sayfa > 1) q.set("sayfa", String(ek.sayfa));
    const s = q.toString();
    return s ? `/panel/crm?${s}` : "/panel/crm";
  };

  /*
    İSTATİSTİKLER (sağ kart): kurumun tamamından, süzgeçten bağımsız —
    artık veritabanında sayılıyor (crm_talep_istatistikleri).
  */
  const ozet = (ozetVerisi ?? {}) as {
    toplam?: number; son30?: number; onceki30?: number; ilerleyen?: number; kaybedilen?: number;
    aktif?: number; atanmamis?: number; notsuz?: number; ortalama_yas?: number;
    hizmetler?: { ad: string; adet: number }[];
    kaynaklar?: { ad: string; adet: number }[];
    temsilciler?: string[];
  };
  const sayiAl = (deger: number | null | undefined) => Number(deger ?? 0);
  const son30 = sayiAl(ozet.son30);
  const onceki30 = sayiAl(ozet.onceki30);
  const degisim = onceki30 ? Math.round(((son30 - onceki30) / onceki30) * 100) : null;
  const ilerleyen = sayiAl(ozet.ilerleyen);
  const kaybedilen = sayiAl(ozet.kaybedilen);
  const donusum = oran(ilerleyen, ilerleyen + kaybedilen);
  const aktifSayisi = sayiAl(ozet.aktif);
  const atanmamis = sayiAl(ozet.atanmamis);
  const notsuz = sayiAl(ozet.notsuz);
  const ortalamaYas = sayiAl(ozet.ortalama_yas);
  const hizmetDagilimi = (ozet.hizmetler ?? []).map((satir) => ({ ad: satir.ad, adet: Number(satir.adet) }));
  /* Kaynak adları serbest yazılmış ("INSTAGRAM", "WEB SİTESİ"); ham
     değer veritabanından geliyor, okunur ada burada çevriliyor. */
  const kaynakDagilimi = (ozet.kaynaklar ?? []).map((satir) => ({ ad: kaynakAdi(satir.ad), adet: Number(satir.adet) }));
  const gorunumAdi = selected === "tumu" ? "Tüm kayıtlar" : selected ? requestStageNames[selected] ?? selected : "Aktif talepler";

  return (
    <main className="talep cari ekip talepler liste-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">CRM</small>
          <h1>Talepler</h1>
        </div>
        <div className="talep-bas-eylem">
          <CustomerLookupButton />
          {/* Postadaki "Talep aç" buraya adresle geliyor; aşağıdaki
              pencereyi ön doldurup açıyor. */}
          <PostadanTalep />
          <PanelDrawer
            triggerLabel="Yeni talep" kicker="YENİ KAYIT"
            // Müşteri sorgulamadaki "+ Bu müşteri için yeni talep" bu düğmeyi bulur
            triggerClassName="panel-primary crm-new-request-trigger"
            title={academicMode ? "Talep Girişi" : "Yeni talep"}
            description="Müşteri ve talep bilgilerini kaydedin."
          >
            <RequestEntryForm
              academicMode={academicMode}
              salesRepresentatives={representatives}
              canAssign={canAssign}
              calismaTurleri={calismaTurleri}
            />
          </PanelDrawer>
        </div>
      </header>

      {/*
        AŞAMA ŞERİDİ. Sayılar listeye götürüyor: varsayılan görünüm
        yalnızca aktif aşamaları gösteriyor ve arşive ulaşmanın tek yolu
        bir açılır menüyü bilmekti; sayıyı görüp tıklayamamak kayıtların
        yok sanılmasına yol açmıştı.
      */}
      <nav className="kayit-serit talep-serit" aria-label="Aşamaya göre süz">
        <dl>
          {ASAMALAR.map((asama) => (
            <div key={asama.kod} className={selected === asama.kod ? "is-active" : undefined}>
              <dt>{asama.ad}</dt>
              <dd><Link href={adres({ durum: asama.kod })} aria-current={selected === asama.kod ? "page" : undefined}>{counts(asama.kod)}</Link></dd>
            </div>
          ))}
          <div><dt>Atanmamış (aktif)</dt><dd><Link href={adres({ durum: "", temsilci: "atanmamis" })}>{atanmamis}</Link></dd></div>
        </dl>
      </nav>

      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Talep listesi">
          {/* Süzgeç tek satır: arama kutusu Enter ile gönderilir, durum
              ve temsilci seçimi gizli alanlarla korunur. */}
          <div className="ekip-suzgec talep-suzgec">
            <Link href={adres({ durum: "" })} className={!selected ? "is-active" : undefined}>Aktif <small>{aktifSayisi}</small></Link>
            <Link href={adres({ durum: "tumu" })} className={selected === "tumu" ? "is-active" : undefined}>Tümü <small>{sayiAl(ozet.toplam)}</small></Link>
            {selected && selected !== "tumu" ? <span className="talep-suzgec-etiket">{gorunumAdi}</span> : null}
            {/* Temsilci süzgeci eskiden sağ sütundaki temsilci kartındaydı;
                o kartın yerini "Takip bekleyenler" aldı, süzgeç buraya geldi. */}
            <form action="/panel/crm" className="talep-ara talep-ara--secimli" role="search">
              {selected ? <input type="hidden" name="durum" value={selected} /> : null}
              <OtomatikSecim name="temsilci" defaultValue={selectedRepresentative} className="talep-temsilci-sec" label="Satış temsilcisi">
                <option value="">Tüm temsilciler</option>
                <option value="atanmamis">Atanmamış</option>
                {representatives.map((rep) => (
                  <option key={rep.id} value={rep.id}>{formatPersonName(rep.full_name)}</option>
                ))}
              </OtomatikSecim>
              <input name="arama" defaultValue={arama ?? ""} placeholder="Müşteri, telefon, konu ara" aria-label="Müşteri / talep ara" />
            </form>
          </div>

          {rows.length ? (
            /* Tablo, önceki sürümdeki gibi başlıklı sütunlar: satırlar
               sütun sütun taranabiliyor. Satırın tamamı ilk hücredeki
               bağlantıyla tıklanır (panel-premium.css). */
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="requests">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Müşteri</th>
                    <th>Hizmet türü</th>
                    <th className="crm-col-rep">Temsilci</th>
                    <th>Durum</th>
                    <th className="crm-col-date">Teslim</th>
                    <th className="crm-col-contact">Son temas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const d = item.request_details ?? {};
                    const ownerName = item.assigned_employee_id
                      ? (representativeMap.get(item.assigned_employee_id) ?? "Pasif personel")
                      : null;
                    return (
                      <tr key={item.id}>
                        <td className="crm-table-mono" data-label="No">
                          <Link className="crm-row-link" href={`/panel/crm/requests/${item.id}`} aria-label={`${formatPersonName(item.customer_name)} talebini aç`}>
                            TLP-{item.id.slice(0, 8).toUpperCase()}
                          </Link>
                        </td>
                        <CustomerCell name={item.customer_name} phone={item.contact_phone} email={item.contact_email} href={`/panel/crm/musteri/${item.id}`} />
                        <ServiceCell service={d.service_type} />
                        <RepresentativeCell name={ownerName} />
                        <td data-label="Durum">
                          <span className="status-pill" data-tone={statusTone(item.stage)}>{requestStageNames[item.stage] ?? item.stage}</span>
                          {/* Arşiv sebebi listede de görünüyor: hepsi aynı
                              rozeti taşıyor, neden kapandığını görmek için tek
                              tek kayıt açmak gerekiyordu. */}
                          {item.stage === "lost" && item.lost_reason ? (
                            <small className="crm-liste-sebep" title={item.lost_reason}>{item.lost_reason}</small>
                          ) : null}
                        </td>
                        <DateCell label="Teslim" value={item.expected_close_date} />
                        <LastContactCell contact={lastContacts.get(item.id)} />
                        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SatirTiklama />
              {/* Sayfalayıcı: diğer üç listeyle aynı kalıp. */}
              {sonSayfa > 1 ? (
                <nav className="liste-sayfalar" aria-label="Sayfalar">
                  {sayfaNo > 1
                    ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo - 1 })}>← Önceki</Link>
                    : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
                  <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} talep` : ""}</small>
                  {sayfaNo < sonSayfa
                    ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo + 1 })}>Sonraki →</Link>
                    : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
                </nav>
              ) : null}
            </div>
          ) : sayiAl(ozet.toplam) === 0 ? (
            // Yeni kurum: filtre hatası gibi görünen "eşleşen yok" yerine
            // sürecin nereden başladığı anlatılır.
            <div className="crm-empty-state talep-bos-kutu">
              <h2>İlk talebinizi girin</h2>
              <p>Müşteriden gelen her iş buradan başlar. Talebi kaydedin, teklif hazırlayın, sözleşmeyi gönderin; müşteriniz süreci takip ekranından izlesin.</p>
              <ol className="crm-empty-steps" aria-label="Süreç">
                <li><b>1</b>Talep</li>
                <li><b>2</b>Teklif</li>
                <li><b>3</b>Sözleşme</li>
                <li><b>4</b>Müşteri takibi</li>
              </ol>
              <div className="crm-empty-actions"><EmptyNewRequestButton /></div>
            </div>
          ) : (
            <div className="crm-empty-state talep-bos-kutu">
              <h2>{filtered ? "Eşleşen talep bulunamadı" : "Aktif talep yok"}</h2>
              <p>
                {filtered
                  ? "Aramayı veya süzgeci değiştirip yeniden deneyin."
                  : "Yeni ve incelenen talepler burada görünür. Teklif ve sonraki aşamalardaki kayıtlar için tüm kayıtları açın."}
              </p>
              <div className="crm-empty-actions">
                {filtered ? <Link className="panel-secondary" href="/panel/crm">Süzgeci temizle</Link> : null}
                {selected !== "tumu" ? <Link className="panel-secondary" href="/panel/crm?durum=tumu">Tüm kayıtları göster</Link> : null}
              </div>
            </div>
          )}
        </section>

        <IstatistikKarti
          kapsam="tüm kayıtlar"
          kutular={[
            { ad: "Son 30 gün", deger: String(son30), alt: degisimYazisi(degisim) ?? "yeni talep", ton: degisim !== null && degisim < 0 ? "uyari" : degisim !== null ? "arti" : undefined },
            { ad: "Teklife dönüşüm", deger: donusum === null ? "—" : `%${donusum}`, alt: `${ilerleyen} ilerledi · ${kaybedilen} arşiv` },
            { ad: "Aktif taleplerin yaşı", deger: `${ortalamaYas} gün`, alt: `ortalama · ${aktifSayisi} aktif` },
            { ad: "Notsuz aktif talep", deger: String(notsuz), alt: "hiç not girilmemiş", ton: notsuz ? "uyari" : undefined },
          ]}
          gruplar={[
            { baslik: "Hizmet türüne göre", satirlar: hizmetDagilimi },
            { baslik: "Kaynağa göre", satirlar: kaynakDagilimi },
          ]}
        />
      </div>
    </main>
  );
}
