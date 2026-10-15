import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { gunlukSeriDilimler } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, simdi, yeniMi } from "../../os/genel-bakis";
import { daysSince, relativeTime, waitingLabel } from "../last-contact";
import "../crm.css";
import { modulGerek } from "@/lib/modul-kapisi";

/*
  CRM genel bakış: satışçının günlük ekranı. Ana ekranla aynı şablon
  (os/genel-bakis.tsx, 2026-10): son 14 günün talep grafiği ve dört liste —
  yeni talepler, yanıt bekleyen teklifler, imza bekleyen sözleşmeler, son
  imzalananlar. Eskiden üstte beş sayı kartı ve 30 günlük satış hunisi
  vardı; huni raporlarda (Finans → Raporlar).
  Veri, CRM listeleriyle aynı kapsamda: kurum filtresi + RLS.
*/

type Opportunity = { id: string; title: string; customer_name: string; assigned_employee_id: string | null; created_at: string };
type Customer = { customer_name: string } | { customer_name: string }[] | null;
type Proposal = {
  id: string; amount: number; currency: string; valid_until: string | null; sent_at: string | null;
  view_count: number; crm_opportunities: Customer;
};
type Contract = {
  id: string; contract_no: string; amount: number; currency: string;
  sent_at: string | null; view_count: number; signed_at: string | null; crm_opportunities: Customer;
};
type Representative = { id: string; full_name: string };
/* Özet işlevinin döndürdüğü sayılar (crm_genel_bakis_ozeti). */
type Ozet = {
  yeni_talep: number; atanmamis: number;
  bekleyen_teklif: number; bekleyen_teklif_degeri: number; suresi_dolan: number;
  bekleyen_sozlesme: number; geciken_sozlesme: number;
  imzali_toplam: number; bu_ay_imza: number; bu_ay_imza_degeri: number;
  seri: { gun: string; adet: number }[];
};

const TZ = "Europe/Istanbul";
/* Teklif öncesi aşamalar (genel ve akademik kurumlar) ve imzalı sayılan
   sözleşme durumları. İkisi de özet işlevine PARAMETRE olarak gidiyor:
   kural burada yaşıyor, SQL'e kopyalanmadı (AGENTS.md "Liste sayfaları"). */
const NEW_STAGES = ["lead", "qualified", "pre_review", "academic_review"] as const;
const IMZALI = ["signed", "completed"] as const;

const money = (amount: number, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0) / 100);
const dayKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));
const customerOf = (value: Customer) => formatPersonName(Array.isArray(value) ? value[0]?.customer_name : value?.customer_name) || "Müşteri";

/* Saat bileşen gövdesinde okunmaz (react-hooks/purity): gün anahtarı
   burada, Türkiye saatiyle üretiliyor. */
const bugununAnahtari = () => dayKey(Date.now());

/** Geçerlilik tarihine kalan gün (bugün = 0, geçmişse negatif). */
const daysUntil = (dateKey: string, today: string) => Math.round((Date.parse(dateKey) - Date.parse(today)) / 86400000);

export default async function CrmOverviewPage() {
  const { supabase, membership, modules } = await getPanelContext();
  modulGerek(modules, "crm");
  const organizationId = membership.organization_id;
  const bugun = bugununAnahtari();

  /*
    SAYILAR VERİTABANINDAN, LİSTELER ALTI SATIRLIK (11.10.2026).

    Eskiden kurumun BÜTÜN talepleri, teklifleri ve sözleşmeleri zaman
    sınırı olmadan çekilip her sayı bellekte hesaplanıyordu. Kayıt
    sayısı büyüdükçe yavaşlamakla kalmıyor; PostgREST'in satır tavanına
    çarpıldığı gün kartlardaki sayılar ve grafik sessizce eksiliyor
    (AGENTS.md "Rakam denetimi"). Dört kartın her biri artık yalnızca
    gösterdiği altı satırı okuyor, sayılar crm_genel_bakis_ozeti'nden.

    Yeni talepler İKİ sorgu: atanmamışlar üstte, sonra en yeniler.
    PostgREST ifadeye göre sıralayamıyor ("atanmış mı" bir sütun
    değil); tek sorguda assigned_employee_id'ye göre sıralamak
    atanmışları kimlik sırasına dizerdi.
  */
  const [
    { data: atanmamisData, error: atanmamisError },
    { data: atanmisData, error: atanmisError },
    { data: teklifData, error: teklifError },
    { data: sozlesmeData, error: sozlesmeError },
    { data: imzaData, error: imzaError },
    { data: employeeData, error: employeeError },
    { data: ozetVerisi, error: ozetError },
  ] = await Promise.all([
    supabase.from("crm_opportunities").select("id,title,customer_name,assigned_employee_id,created_at")
      .eq("organization_id", organizationId).in("stage", [...NEW_STAGES]).is("assigned_employee_id", null)
      .order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    supabase.from("crm_opportunities").select("id,title,customer_name,assigned_employee_id,created_at")
      .eq("organization_id", organizationId).in("stage", [...NEW_STAGES]).not("assigned_employee_id", "is", null)
      .order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    // Süresi en yakın olan üstte; tarihi olmayanlar en sonda.
    supabase.from("crm_proposals").select("id,amount,currency,valid_until,sent_at,view_count,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).eq("status", "sent").is("superseded_by", null)
      .order("valid_until", { ascending: true, nullsFirst: false })
      .order("sent_at", { ascending: true, nullsFirst: true }).limit(GENEL_BAKIS_SATIR),
    // En uzun bekleyen üstte.
    supabase.from("crm_contracts").select("id,contract_no,amount,currency,sent_at,view_count,signed_at,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).eq("status", "sent")
      .order("sent_at", { ascending: true, nullsFirst: true }).limit(GENEL_BAKIS_SATIR),
    supabase.from("crm_contracts").select("id,contract_no,amount,currency,sent_at,view_count,signed_at,crm_opportunities(customer_name)")
      .eq("organization_id", organizationId).in("status", [...IMZALI]).not("signed_at", "is", null)
      .order("signed_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    supabase.from("hr_employees").select("id,full_name")
      .eq("organization_id", organizationId).eq("employment_status", "active").order("full_name"),
    supabase.rpc("crm_genel_bakis_ozeti", {
      p_organization_id: organizationId,
      p_yeni_asamalar: [...NEW_STAGES],
      p_imzali: [...IMZALI],
    }),
  ]);
  if (atanmamisError || atanmisError) throw new Error("Talepler okunamadı: " + (atanmamisError ?? atanmisError)!.message);
  if (teklifError) throw new Error("Teklifler okunamadı: " + teklifError.message);
  if (sozlesmeError || imzaError) throw new Error("Sözleşmeler okunamadı: " + (sozlesmeError ?? imzaError)!.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (ozetError) throw new Error("CRM özeti okunamadı: " + ozetError.message);

  const ozet = (ozetVerisi ?? {}) as Partial<Ozet>;
  const sayi = (deger: number | undefined) => Number(deger ?? 0);
  const employees = (employeeData ?? []) as Representative[];
  const employeeName = new Map(employees.map((row) => [row.id, formatPersonName(row.full_name)]));

  /* Atanmamışlar üstte: iki sorgunun birleşimi, kartın altı satırı. */
  const newRequests = [...((atanmamisData ?? []) as Opportunity[]), ...((atanmisData ?? []) as Opportunity[])];
  const pendingProposals = (teklifData ?? []) as unknown as Proposal[];
  const pendingContracts = (sozlesmeData ?? []) as unknown as Contract[];
  const recentSigned = (imzaData ?? []) as unknown as Contract[];

  const unassignedCount = sayi(ozet.atanmamis);
  const pendingProposalValue = sayi(ozet.bekleyen_teklif_degeri);
  const expiringCount = sayi(ozet.suresi_dolan);
  const lateContracts = sayi(ozet.geciken_sozlesme);
  const signedThisMonth = sayi(ozet.bu_ay_imza);
  const signedThisMonthValue = sayi(ozet.bu_ay_imza_degeri);

  // ---- Grafik: son 14 günde girilen talepler (önceki 14 günle kıyas);
  // günlük sayım veritabanında, Türkiye gününe göre.
  const seri = gunlukSeriDilimler(ozet.seri ?? [], simdi());

  return (
    <GenelBakis
      gizliBaslik="CRM genel bakış"
    >
      <SeriKarti baslik="Yeni talepler" alt="Son 14 gün" seri={seri} adet="talep" bos="Son 14 günde yeni talep yok. Talep girildiğinde günlük dağılım burada çizilir." />

      <ListeIzgarasi etiket="Satış işleri">
        <ListeKarti baslik="Yeni talepler" alt={unassignedCount ? `${unassignedCount} talep temsilci bekliyor` : "Teklif öncesi aşamadaki talepler"} bos="Yeni talep yok. Girilen talepler burada belirir." href="/panel/crm" hrefEtiket="Tüm talepler" sayi={sayi(ozet.yeni_talep)}>
          {newRequests.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const assignee = row.assigned_employee_id ? employeeName.get(row.assigned_employee_id) ?? "Pasif personel" : null;
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/requests/${row.id}`}
                baslik={formatPersonName(row.customer_name) || "Müşteri"}
                alt={`${formatSubject(row.title)} · ${relativeTime(row.created_at)}`}
                sag={assignee ? <span className="status-pill" data-tone="neutral" title={assignee}>{assignee.split(" ")[0]}</span> : <span className="status-pill" data-tone="gold">Atanmamış</span>}
                yeni={yeniMi(row.created_at)}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Yanıt bekleyen teklifler" alt={expiringCount ? `${expiringCount} teklifin süresi 3 gün içinde doluyor` : sayi(ozet.bekleyen_teklif) ? `${money(pendingProposalValue)} teklif değeri` : "Müşteriye gönderilmiş, karar bekleyen"} bos="Yanıt bekleyen teklif yok." href="/panel/crm/proposals?status=sent" hrefEtiket="Tüm teklifler" sayi={sayi(ozet.bekleyen_teklif)}>
          {pendingProposals.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const left = row.valid_until ? daysUntil(row.valid_until, bugun) : null;
            const badge = left !== null && left < 0 ? { tone: "danger", label: "Süresi doldu" }
              : left !== null && left <= 3 ? { tone: "warning", label: left === 0 ? "Son gün" : `Son ${left} gün` }
              : !row.view_count ? { tone: "info", label: "Açılmadı" }
              : { tone: "success", label: "Görüldü" };
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/proposals/${row.id}`}
                baslik={customerOf(row.crm_opportunities)}
                alt={`${money(row.amount, row.currency)} · ${waitingLabel(row.sent_at) ?? "gönderildi"}`}
                sag={<span className="status-pill" data-tone={badge.tone}>{badge.label}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="İmza bekleyen sözleşmeler" alt={lateContracts ? `${lateContracts} sözleşme 7 günden uzun süredir bekliyor` : "Müşteriye gönderilmiş, imzalanmamış"} bos="İmza bekleyen sözleşme yok." href="/panel/crm/contracts?status=sent" hrefEtiket="Tüm sözleşmeler" sayi={sayi(ozet.bekleyen_sozlesme)}>
          {pendingContracts.slice(0, GENEL_BAKIS_SATIR).map((row) => {
            const late = (daysSince(row.sent_at) ?? 0) >= 7;
            const badge = late ? { tone: "danger", label: "Gecikti" } : !row.view_count ? { tone: "info", label: "Açılmadı" } : { tone: "success", label: "Görüldü" };
            return (
              <ListeSatiri
                key={row.id}
                href={`/panel/crm/contracts/${row.id}`}
                baslik={customerOf(row.crm_opportunities)}
                alt={`${money(row.amount, row.currency)} · ${waitingLabel(row.sent_at) ?? "gönderildi"}`}
                sag={<span className="status-pill" data-tone={badge.tone}>{badge.label}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Son imzalanan sözleşmeler" alt={signedThisMonth ? `Bu ay ${signedThisMonth} imza · ${money(signedThisMonthValue)}` : "Bu ay henüz imza yok"} bos="İmzalanmış sözleşme yok." href="/panel/crm/contracts" hrefEtiket="Sözleşmelere git" sayi={sayi(ozet.imzali_toplam)}>
          {recentSigned.slice(0, GENEL_BAKIS_SATIR).map((row) => (
            <ListeSatiri
              key={row.id}
              href={`/panel/crm/contracts/${row.id}`}
              baslik={customerOf(row.crm_opportunities)}
              alt={`${row.contract_no} · ${money(row.amount, row.currency)}`}
              zaman={relativeTime(row.signed_at!)}
              yeni={yeniMi(row.signed_at)}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
