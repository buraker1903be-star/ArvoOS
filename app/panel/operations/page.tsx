import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { musteriMesajGondereni } from "@/lib/musteri-mesaji";
import { formatSubject } from "@/lib/table-format";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, seriBaslangici, simdi, yeniMi } from "../os/genel-bakis";
import { relativeTime } from "../crm/last-contact";
import { activeStatuses, addDaysKey, dueBadge, stepProgress, todayIstanbul, workflowStatusNames } from "./ops-shared";
import "../crm/crm.css";
import "./operations.css";

// Operasyon genel bakış: operasyoncunun günlük ekranı. Ana ekranla aynı
// şablon (os/genel-bakis.tsx, 2026-10): son 14 günde tamamlanan aşamalar
// grafiği ve dört liste: yaklaşan aşamalar, yeni gelen işler, devam eden
// işler (termin rozetiyle), müşteri mesajları. Eskiden beş sayı kartı ve
// ayrı bir "teslim tarihi yaklaşan" kartı vardı.
// Veri, işler tablosuyla aynı kapsamda: kurum filtresi + RLS (yönetici
// değilse yalnızca sorumlusu olduğu işler).

type Workflow = {
  id: string;
  title: string;
  customer_name: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_employee_id: string | null;
  operation_steps: OverviewStep[] | null;
};
type OverviewStep = {
  id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  sort_order: number;
  assigned_employee_id: string | null;
};
type MessageRow = {
  id: string;
  workflow_id: string;
  sender_name: string | null;
  body: string;
  created_at: string;
  operation_workflows: { id: string; title: string; customer_name: string | null; status: string } | { id: string; title: string; customer_name: string | null; status: string }[] | null;
};
/* Mesaj ÖNİZLEME penceresi. Kutucuktaki toplam buradan gelmiyor; ayrı ve
   sınırsız bir sayım sorgusundan geliyor. */
const MESAJ_ONIZLEME = 500;
const ISLER = "/panel/operations/isler";

export default async function OperationsOverviewPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string }> }) {
  // Eski bağlantılar (/panel/operations?arama=…&durum=…) işler tablosuna gider
  const params = await searchParams;
  const legacy = new URLSearchParams();
  if (params.arama) legacy.set("arama", params.arama);
  if (params.durum) legacy.set("durum", params.durum);
  if (legacy.size) redirect(`${ISLER}?${legacy.toString()}`);

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const today = todayIstanbul();
  const weekEnd = addDaysKey(today, 7);

  const [{ data, error }, { data: employeeData, error: employeeError }, { data: messageData, error: messageError }, { count: okunmamisSayisi }, { data: tamamlananData, error: tamamlananError }] = await Promise.all([
    supabase.from("operation_workflows")
      // Adımın kendi alanları da geliyor: "yaklaşan aşamalar" kartı AŞAMA
      // düzeyinde, işin termini düzeyinde değil.
      .select("id,title,customer_name,status,priority,due_date,created_at,updated_at,assigned_employee_id,operation_steps(id,title,due_date,is_completed,sort_order,assigned_employee_id)")
      .eq("organization_id", organizationId)
      .in("status", [...activeStatuses])
      .order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", organizationId).eq("employment_status", "active"),
    // !inner: mesajın işi RLS'te görünmüyorsa (başkasının işi) mesaj da gelmez
    supabase.from("customer_file_messages")
      .select("id,workflow_id,sender_name,body,created_at,operation_workflows!inner(id,title,customer_name,status)")
      .eq("organization_id", organizationId)
      .eq("sender_type", "customer")
      .is("read_at", null)
      .neq("operation_workflows.status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(MESAJ_ONIZLEME),
    /*
      Okunmamış mesaj sayısı AYRI ve sınırsız sorguda. Yukarıdaki liste
      önizleme için sınırlı; sayısını ondan almak, sınır aşıldığında
      kutucuğun sessizce "500"de donması demekti (aynı sayfada arşiv sayısı
      zaten bu teknikle alınıyor).
    */
    supabase.from("customer_file_messages")
      .select("id,operation_workflows!inner(id)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("sender_type", "customer")
      .is("read_at", null)
      .neq("operation_workflows.status", "cancelled"),
    /* Grafik: son 28 günde tamamlanan aşamalar (14 gün + önceki 14 günle
       kıyas). Sınırsız: sayı bu satırlardan çıkıyor. RLS, yönetici
       olmayana yalnızca kendi işlerinin aşamalarını verir. */
    supabase.from("operation_steps").select("completed_at")
      .eq("organization_id", organizationId).eq("is_completed", true).gte("completed_at", seriBaslangici()),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (messageError) throw new Error("Müşteri mesajları okunamadı: " + messageError.message);
  /* Grafik okunamazsa sayfa düşmez; uyarı satırı söyler. */
  const uyarilar = tamamlananError ? ["Tamamlanan aşamalar"] : [];
  const seri = gunlukSeri(((tamamlananData ?? []) as { completed_at: string | null }[]).map((row) => row.completed_at ?? ""), simdi());

  const workflows = (data ?? []) as Workflow[];
  const employeeName = new Map(((employeeData ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, formatPersonName(row.full_name)]));
  const assigneeOf = (workflow: Workflow) => (workflow.assigned_employee_id ? employeeName.get(workflow.assigned_employee_id) ?? "Pasif personel" : null);

  // Kartlar
  const planned = workflows.filter((workflow) => workflow.status === "planned");
  const unassignedPlanned = planned.filter((workflow) => !workflow.assigned_employee_id).length;
  // Atanmamış yeni işler üstte, sonra en yeni
  const plannedList = [...planned].sort((a, b) => Number(Boolean(a.assigned_employee_id)) - Number(Boolean(b.assigned_employee_id)) || b.created_at.localeCompare(a.created_at));

  const ongoing = workflows.filter((workflow) => workflow.status === "in_progress" || workflow.status === "blocked");
  const blockedCount = ongoing.filter((workflow) => workflow.status === "blocked").length;
  const ongoingList = [...ongoing].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || b.updated_at.localeCompare(a.updated_at));

  /*
    YAKLAŞAN AŞAMALAR — operasyoncunun kendi cümlesiyle "hangi maddenin
    tarihi yaklaşıyor". Bu sayfa şimdiye kadar yalnızca İŞİN terminine
    bakıyordu; oysa sekiz aşamalı bir işte asıl kaçırılan, işin termini
    daha uzakken gecikmiş olan ara teslim. İkisi ayrı kartlarda duruyor:
    biri "iş ne zaman teslim edilecek", diğeri "şu an hangi maddeye
    yetişmek gerekiyor".

    Pencere işin terminiyle aynı: bugüne kadar gecikmişler + önümüzdeki
    7 gün.
  */
  const yaklasanAsamalar = workflows
    .flatMap((workflow) =>
      (workflow.operation_steps ?? [])
        .filter((step) => step.due_date && !step.is_completed && step.due_date <= weekEnd)
        .map((step) => ({
          id: step.id,
          baslik: step.title,
          tarih: step.due_date!,
          isId: workflow.id,
          isBasligi: workflow.title,
          musteri: workflow.customer_name || "Kurum içi iş",
          // Adımın kendi sorumlusu yoksa işin sorumlusu (panodaki kuralla aynı).
          sorumlu: step.assigned_employee_id
            ? employeeName.get(step.assigned_employee_id) ?? "Pasif personel"
            : assigneeOf(workflow),
        })),
    )
    .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.baslik.localeCompare(b.baslik, "tr"));
  const gecikenAsama = yaklasanAsamalar.filter((asama) => asama.tarih < today).length;

  const dueList = workflows.filter((workflow) => workflow.due_date && workflow.due_date <= weekEnd).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const overdueCount = dueList.filter((workflow) => workflow.due_date! < today).length;
  const dueSoonCount = dueList.length - overdueCount;

  const messages = ((messageData ?? []) as unknown as MessageRow[]).map((row) => ({ ...row, workflow: Array.isArray(row.operation_workflows) ? row.operation_workflows[0] : row.operation_workflows }));
  // İş başına tek satır: en son mesaj + o işteki okunmamış sayısı.
  const threads = new Map<string, { latest: (typeof messages)[number]; count: number }>();
  /*
    tuzak-tamam: bu sayı bilerek ÖNİZLEME penceresinden (son MESAJ_ONIZLEME
    mesaj) geliyor. Kutucuktaki TOPLAM artık ayrı ve sınırsız bir sayım
    sorgusundan; buradaki liste ve iş başına sayı yalnızca en yeni mesajları
    göstermek için. Pencere dolduğunda "kaç işte" metni "en az" diye
    yazılıyor, sayı kesinmiş gibi sunulmuyor.
  */
  for (const message of messages) {
    const thread = threads.get(message.workflow_id);
    if (thread) thread.count += 1;
    else threads.set(message.workflow_id, { latest: message, count: 1 });
  }
  const threadList = [...threads.values()];
  /*
    Kutucuktaki sayı kesin sorgudan; liste yalnızca önizleme. Sayım
    alınamazsa listeden düşülüyor — en azından eldeki kadarını söylemek,
    hiç söylememekten iyi.
  */
  const unreadTotal = okunmamisSayisi ?? messages.length;
  /* Liste sınıra dayandıysa "kaç işte" sayısı da alt sınırdır. */
  const onizlemeKesildi = messages.length >= MESAJ_ONIZLEME;
  const isSayisiMetni = `${onizlemeKesildi ? "en az " : ""}${threads.size} işte okunmamış`;

  return (
    <GenelBakis
      gizliBaslik="Operasyon genel bakış"
      uyari={uyarilar}
    >
      <SeriKarti baslik="Tamamlanan aşamalar" alt="Son 14 gün" seri={seri} adet="aşama" />

      <ListeIzgarasi etiket="Operasyon işleri">
        {/*
          YAKLAŞAN AŞAMALAR: "hangi maddenin tarihi yaklaşıyor". İşin termini
          daha uzakken gecikmiş ara teslim asıl kaçırılan şey; gecikmeler en
          üstte (tarih sırası).
        */}
        <ListeKarti baslik="Yaklaşan aşamalar" alt={gecikenAsama ? `${gecikenAsama} aşamanın teslimi gecikti` : "Önümüzdeki 7 gün içinde teslim edilecek"} bos="Yaklaşan aşama yok. Aşama tarihleri iş detayında “Tarihleri dağıt” ile doldurulabilir." href="/panel/operations/takvim" hrefEtiket="Takvimde gör" sayi={yaklasanAsamalar.length}>
          {yaklasanAsamalar.slice(0, GENEL_BAKIS_SATIR).map((asama) => {
            const rozet = dueBadge(asama.tarih, today);
            return (
              <ListeSatiri
                key={asama.id}
                href={`/panel/operations/${asama.isId}`}
                baslik={formatSubject(asama.baslik)}
                baslikIpucu={asama.baslik}
                alt={`${asama.musteri} · ${asama.sorumlu ?? "Atanmamış"}`}
                sag={<span className="status-pill" data-tone={rozet.tone}>{rozet.label}</span>}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Yeni gelen işler" alt={unassignedPlanned ? `${unassignedPlanned} iş sorumlu bekliyor` : "Planlanan, henüz başlamamış işler"} bos="Yeni iş yok. Sözleşmesi onaylanan işler burada belirir." href={`${ISLER}?durum=planned`} hrefEtiket="Tümünü gör" sayi={plannedList.length}>
          {plannedList.slice(0, GENEL_BAKIS_SATIR).map((workflow) => {
            const sorumlu = assigneeOf(workflow);
            return (
              <ListeSatiri
                key={workflow.id}
                href={`/panel/operations/${workflow.id}`}
                baslik={formatSubject(workflow.title)}
                baslikIpucu={workflow.title}
                alt={`${workflow.customer_name || "Kurum içi iş"} · ${relativeTime(workflow.created_at)}`}
                sag={sorumlu ? <span className="status-pill" data-tone="neutral" title={sorumlu}>{sorumlu.split(" ")[0]}</span> : <span className="status-pill" data-tone="gold">Atanmamış</span>}
                yeni={yeniMi(workflow.created_at)}
              />
            );
          })}
        </ListeKarti>

        {/* Termin bilgisi (eski "Teslim tarihi yaklaşan" kartı) burada rozet olarak. */}
        <ListeKarti baslik="Devam eden işler" alt={blockedCount ? `${blockedCount} iş beklemede` : overdueCount || dueSoonCount ? `${overdueCount ? `${overdueCount} geciken, ` : ""}bu hafta ${dueSoonCount} teslim` : "Üzerinde çalışılan işler"} bos="Şu an devam eden iş yok." href={`${ISLER}?durum=devam`} hrefEtiket="Tümünü gör" sayi={ongoingList.length}>
          {ongoingList.slice(0, GENEL_BAKIS_SATIR).map((workflow) => {
            const ilerleme = stepProgress(workflow.operation_steps);
            const rozet = dueBadge(workflow.due_date, today, workflow.status);
            return (
              <ListeSatiri
                key={workflow.id}
                href={`/panel/operations/${workflow.id}`}
                baslik={formatSubject(workflow.title)}
                baslikIpucu={workflow.title}
                alt={`${workflow.customer_name || "Kurum içi iş"} · %${ilerleme.percentage} · ${workflowStatusNames[workflow.status] ?? workflow.status}`}
                sag={workflow.due_date ? <span className="status-pill" data-tone={rozet.tone}>{rozet.label}</span> : null}
                yeni={yeniMi(workflow.updated_at)}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Müşteri mesajları" alt={unreadTotal ? isSayisiMetni : "Takip ekranından yazılanlar"} bos="Okunmamış müşteri mesajı yok." href={`${ISLER}?mesaj=yeni`} hrefEtiket="Tümünü gör" sayi={threadList.length}>
          {threadList.slice(0, GENEL_BAKIS_SATIR).map(({ latest, count }) => (
            <ListeSatiri
              key={latest.workflow_id}
              href={`/panel/operations/${latest.workflow_id}?pencere=mesajlar`}
              baslik={formatPersonName(musteriMesajGondereni(latest.workflow?.customer_name, latest.sender_name))}
              alt={latest.body}
              onizleme
              sag={count > 1 ? <span className="status-pill" data-tone="danger">{count}</span> : null}
              zaman={relativeTime(latest.created_at)}
              okunmamis
              yeni={yeniMi(latest.created_at)}
            />
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
