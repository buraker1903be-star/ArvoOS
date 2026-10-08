import Link from "next/link";
import { statusTone } from "@/lib/status-tone";
import { formatPhone, phoneSearchTerms } from "@/lib/format-phone";
import { formatSubject, initials } from "@/lib/table-format";
import { fetchLastContacts, relativeTime } from "./last-contact";
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

/*
  TALEPLER LİSTESİ (2026-10): ekip listesiyle aynı kalıp. Üstte başlık,
  "Müşteri sorgula" ve "Yeni talep"; altında aşama şeridi (her sayı o
  aşamaya süzer); solda talepler, sağda temsilcilere göre dağılım.

  Eskiden dört sayaç kutusu, ayrı bir süzgeç kartı ("Filtrele" /
  "Temizle") ve sekiz sütunlu tablo alt alta duruyordu. Süzgeç artık
  listenin üstünde tek satır; temsilci süzgeci sağ sütundaki adlara
  tıklayarak da seçiliyor.
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
/** Satırın alt yazısı; boşlar atlanır, aynı metin (büyük/küçük harf farkıyla) bir kez yazılır. */
function altSatir(...parcalar: (string | null | undefined)[]) {
  const goruldu = new Set<string>();
  const sonuc: string[] = [];
  for (const parca of parcalar) {
    const metin = parca?.trim();
    const anahtar = metin?.toLocaleLowerCase("tr");
    if (!metin || !anahtar || goruldu.has(anahtar)) continue;
    goruldu.add(anahtar);
    sonuc.push(metin);
  }
  return sonuc.join(" · ");
}
const teslim = (value: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : null;
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
        "id,title,customer_name,contact_email,contact_phone,stage,estimated_value,expected_close_date,source,notes,request_details,assigned_employee_id,lost_reason",
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
  const visibleOpportunityIds = rows.map((item) => item.id);
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
  // Temsilci dağılımı aktif talepler (yeni + inceleniyor) üzerinden.
  const aktifler = all.filter((item) => active.has(item.stage));
  const temsilciSayisi = (id: string | null) => aktifler.filter((item) => item.assigned_employee_id === id).length;
  const atanmamis = temsilciSayisi(null);
  const gorunumAdi = selected === "tumu" ? "Tüm kayıtlar" : selected ? requestStageNames[selected] ?? selected : "Aktif talepler";

  return (
    <main className="talep cari ekip talepler">
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
            {selectedRepresentative ? (
              <Link className="ekip-suzgec-dep" href={adres({ temsilci: "" })}>
                {selectedRepresentative === "atanmamis" ? "Atanmamış" : formatPersonName(representativeMap.get(selectedRepresentative) ?? "Temsilci")} ✕
              </Link>
            ) : null}
            <form action="/panel/crm" className="talep-ara" role="search">
              {selected ? <input type="hidden" name="durum" value={selected} /> : null}
              {selectedRepresentative ? <input type="hidden" name="temsilci" value={selectedRepresentative} /> : null}
              <input name="arama" defaultValue={arama ?? ""} placeholder="Müşteri, telefon, konu ara" aria-label="Müşteri / talep ara" />
            </form>
          </div>

          {rows.length ? (
            <ul className="ekip-liste">
              {rows.map((item) => {
                const d = item.request_details ?? {};
                const ownerName = item.assigned_employee_id
                  ? formatPersonName(representativeMap.get(item.assigned_employee_id) ?? "Pasif personel")
                  : null;
                const musteri = formatPersonName(item.customer_name) || "—";
                const temas = lastContacts.get(item.id);
                const tarih = teslim(item.expected_close_date);
                return (
                  <li key={item.id}>
                    <Link href={`/panel/crm/requests/${item.id}`}>
                      <span className="talep-avatar" aria-hidden="true">{initials(musteri)}</span>
                      <span className="cari-hareket-metin">
                        <b>{musteri}</b>
                        {/* Konu çoğu kayıtta hizmet türüyle aynı ("ANSYS Analiz · ANSYS Analiz"); aynıysa bir kez. */}
                        <small>{altSatir(formatSubject(item.title), d.service_type, formatPhone(item.contact_phone))}</small>
                      </span>
                      <span className="talep-satir-yan">
                        <span className={ownerName ? undefined : "is-bos"}>{ownerName ?? "Atanmamış"}</span>
                        <small title={temas?.preview}>{temas ? `Not ${relativeTime(temas.at)}` : "Not yok"}{tarih ? ` · teslim ${tarih}` : ""}</small>
                      </span>
                      <span className="talep-satir-durum">
                        <span className="status-pill" data-tone={statusTone(item.stage)}>{requestStageNames[item.stage] ?? item.stage}</span>
                        {/* Arşiv sebebi listede de görünüyor: hepsi aynı
                            rozeti taşıyor, neden kapandığını görmek için tek
                            tek kayıt açmak gerekiyordu. */}
                        {item.stage === "lost" && item.lost_reason ? <small title={item.lost_reason}>{item.lost_reason}</small> : null}
                      </span>
                      <span className="ekip-ok" aria-hidden="true">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
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

        <section className="panel-card talep-musteri" aria-label="Temsilciler">
          <div className="cari-baslik">
            <h2>Temsilciler</h2>
            <small>aktif talep</small>
          </div>
          <ul className="cari-hareketler">
            {representatives.map((rep) => (
              <li key={rep.id}>
                {/* Ada tıklamak listeyi o temsilciye süzer. */}
                <Link href={adres({ temsilci: selectedRepresentative === rep.id ? "" : rep.id })} className={selectedRepresentative === rep.id ? "is-active" : undefined}>
                  <span className="ekip-dep-kod">{initials(formatPersonName(rep.full_name))}</span>
                  <span className="cari-hareket-metin"><b>{formatPersonName(rep.full_name)}</b><small>{rep.job_title || "Satış temsilcisi"}</small></span>
                  <strong>{temsilciSayisi(rep.id)}</strong>
                </Link>
              </li>
            ))}
            <li>
              <Link href={adres({ temsilci: selectedRepresentative === "atanmamis" ? "" : "atanmamis" })} className={selectedRepresentative === "atanmamis" ? "is-active" : undefined}>
                <span className="ekip-dep-kod" data-pasif="">—</span>
                <span className="cari-hareket-metin"><b>Atanmamış</b><small>Temsilci bekleyen talepler</small></span>
                <strong className={atanmamis ? "talep-uyari" : undefined}>{atanmamis}</strong>
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
