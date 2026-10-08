import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { phoneSearchTerms } from "@/lib/format-phone";
import { fetchLastContacts } from "./last-contact";
import { CustomerCell, DateCell, LastContactCell, RepresentativeCell, ServiceCell } from "./table-cells";
import { OtomatikSecim } from "./otomatik-secim";
import { IstatistikKarti, degisimYazisi } from "./istatistik-karti";
import { enCok, gunOnce, oran, son30Degisim } from "@/lib/liste-istatistik";
import { simdi } from "../os/genel-bakis";
import { formatPersonName } from "@/lib/format-name";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { RequestEntryForm } from "./request-entry-form";
import { CustomerLookupButton } from "./customer-lookup";
import { requestStageNames } from "./request-status";
import { EmptyNewRequestButton } from "./empty-new-request";
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
}>;
type Details = {
  service_type?: string;
  academic_level?: string;
  university?: string;
  department?: string;
  language?: string;
  scope?: string;
};
type Opportunity = {
  id: string;
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
  const { arama, durum, temsilci } = await searchParams;
  const search = clean(arama).toLocaleLowerCase("tr-TR");
  const selected = clean(durum);
  const selectedRepresentative = clean(temsilci);
  const { supabase, membership, modules, izin } = await getPanelContext();
  const canAssign = izin("crm.kayit.ata");
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  const [
    { data, error },
    { data: stages, error: stageError },
    { data: employeeData, error: employeeError },
  ] = await Promise.all([
    supabase
      .from("crm_opportunities")
      .select(
        "id,title,customer_name,contact_email,contact_phone,stage,estimated_value,expected_close_date,source,notes,request_details,assigned_employee_id,lost_reason,created_at",
      )
      .eq("organization_id", membership.organization_id)
      .order("updated_at", { ascending: false }),
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
  ]);
  if (error) throw new Error("Talepler okunamadı: " + error.message);
  if (stageError)
    throw new Error("Talep ayarları okunamadı: " + stageError.message);
  if (employeeError)
    throw new Error("Satış temsilcileri okunamadı: " + employeeError.message);
  const representatives = (employeeData ?? []) as SalesRepresentative[];
  const representativeMap = new Map(
    representatives.map((item) => [item.id, item.full_name]),
  );
  const academicMode = (stages ?? []).some((s) => s.code === "academic_review");
  // Çalışma türleri: "Yeni talep" formundaki seçim bunlardan geliyor.
  const { data: turData } = await supabase
    .from("organization_step_template_sets")
    .select("code,name,is_default")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  const calismaTurleri = (turData ?? []) as { code: string; name: string; is_default: boolean }[];

  const all = (data ?? []) as Opportunity[];
  const rows = all.filter((i) => {
    const hay = [
      i.customer_name,
      i.title,
      i.contact_email,
      phoneSearchTerms(i.contact_phone),
      i.request_details?.service_type,
      representativeMap.get(i.assigned_employee_id ?? ""),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    const representativeMatches =
      !selectedRepresentative ||
      (selectedRepresentative === "atanmamis"
        ? !i.assigned_employee_id
        : i.assigned_employee_id === selectedRepresentative);
    return (
      (!search || hay.includes(search)) &&
      (selected === "tumu"
        ? true
        : selected
          ? i.stage === selected
          : active.has(i.stage)) &&
      representativeMatches
    );
  });
  // Son not hem görünen satırlar hem "Takip bekleyenler" kartı (tüm aktif talepler) için.
  const visibleOpportunityIds = [...new Set([...rows, ...all.filter((item) => active.has(item.stage))].map((item) => item.id))];
  const lastContacts = await fetchLastContacts(
    supabase,
    membership.organization_id,
    visibleOpportunityIds,
  );
  const counts = (code: string) => all.filter((i) => i.stage === code).length;
  // Boş liste: hiç kayıt yok mu, yoksa arama/filtre mi eşleşmedi?
  const filtered = Boolean(search || selectedRepresentative || (selected && selected !== "tumu"));
  /*
    Adres yardımcısı: bir süzgeci değiştirirken diğerleri korunur.
    Kullanıcı daraltılmış bir listeden aşama sayısına tıklayınca aramasını
    kaybetmesin (eski sayaç bağlantılarının kuralı).
  */
  const adres = (ek: { durum?: string; temsilci?: string }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? selected;
    const t = ek.temsilci ?? selectedRepresentative;
    if (arama) q.set("arama", arama);
    if (d) q.set("durum", d);
    if (t) q.set("temsilci", t);
    const s = q.toString();
    return s ? `/panel/crm?${s}` : "/panel/crm";
  };
  const aktifler = all.filter((item) => active.has(item.stage));
  const atanmamis = aktifler.filter((item) => !item.assigned_employee_id).length;
  /*
    İSTATİSTİKLER (sağ kart). Eskiden burada temsilcilere göre dağılım
    vardı; temsilci süzgeci listenin üstünde. Sayılar tüm kayıtlardan
    (sınırsız sorgu), süzgeçten bağımsız: kart kurumun genel tablosu.
  */
  const an = simdi();
  const { son30, degisim } = son30Degisim(all.map((item) => item.created_at), an);
  const ilerleyen = all.filter((item) => ILERLEYEN.has(item.stage)).length;
  const kaybedilen = counts("lost");
  const donusum = oran(ilerleyen, ilerleyen + kaybedilen);
  const notsuz = aktifler.filter((item) => !lastContacts.get(item.id)).length;
  const ortalamaYas = aktifler.length ? Math.round(aktifler.reduce((s, item) => s + gunOnce(item.created_at, an), 0) / aktifler.length) : 0;
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
            <Link href={adres({ durum: "" })} className={!selected ? "is-active" : undefined}>Aktif <small>{aktifler.length}</small></Link>
            <Link href={adres({ durum: "tumu" })} className={selected === "tumu" ? "is-active" : undefined}>Tümü <small>{all.length}</small></Link>
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
            </div>
          ) : all.length === 0 ? (
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
            { ad: "Aktif taleplerin yaşı", deger: `${ortalamaYas} gün`, alt: `ortalama · ${aktifler.length} aktif` },
            { ad: "Notsuz aktif talep", deger: String(notsuz), alt: "hiç not girilmemiş", ton: notsuz ? "uyari" : undefined },
          ]}
          gruplar={[
            { baslik: "Hizmet türüne göre", satirlar: enCok(all.map((item) => item.request_details?.service_type?.trim() || "Belirtilmedi"), 5).map(([ad, adet]) => ({ ad, adet })) },
            { baslik: "Kaynağa göre", satirlar: enCok(all.map((item) => kaynakAdi(item.source)), 4).map(([ad, adet]) => ({ ad, adet })) },
          ]}
        />
      </div>
    </main>
  );
}
