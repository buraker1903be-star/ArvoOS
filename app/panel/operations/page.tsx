import { redirect } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { musteriMesajGondereni } from "@/lib/musteri-mesaji";
import { formatSubject } from "@/lib/table-format";
import { gunlukSeriDilimler } from "@/lib/gunluk-seri";
import { GENEL_BAKIS_SATIR, GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, simdi, yeniMi } from "../os/genel-bakis";
import { relativeTime } from "../crm/last-contact";
import { activeStatuses, addDaysKey, adimIlerlemesi, dueBadge, surenStatuses, todayIstanbul, workflowStatusNames } from "./ops-shared";
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
  due_date: string | null;
  created_at: string;
  updated_at: string;
  assigned_employee_id: string | null;
};
/* Süren işler kartı adım sayılarını da gösteriyor: görünümden hazır
   geliyor (operasyon_is_liste), adımların kendisi okunmuyor. */
type SurenIs = Workflow & { adim_toplam: number; adim_tamam: number };
/* Yaklaşan aşama: adım + işinin görünen alanları (gömülü). */
type AsamaSatiri = {
  id: string;
  title: string;
  due_date: string;
  assigned_employee_id: string | null;
  operation_workflows: { id: string; title: string; customer_name: string | null; assigned_employee_id: string | null }
    | { id: string; title: string; customer_name: string | null; assigned_employee_id: string | null }[]
    | null;
};
/* Özet işlevinin döndürdüğü sayılar (operasyon_genel_bakis_ozeti). */
type Ozet = {
  planlanan: number; planlanan_atanmamis: number; suren: number; tikali: number;
  termin_gecmis: number; termin_yakin: number; asama_gecmis: number; asama_yakin: number;
  seri: { gun: string; adet: number }[];
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

  /*
    SAYILAR VERİTABANINDAN, LİSTELER ALTI SATIRLIK (11.10.2026).

    Eskiden kurumun BÜTÜN aktif işleri, her birinin aşamalarıyla
    birlikte (gömülü operation_steps) çekiliyordu — panelin en ağır
    okuması. Kartların sayıları da o diziden geliyordu; PostgREST'in
    satır tavanına çarpıldığı gün hepsi sessizce eksilirdi (AGENTS.md
    "Rakam denetimi"). Artık her kart yalnızca gösterdiği altı satırı
    okuyor, sayılar operasyon_genel_bakis_ozeti'nden.

    Planlanan işler İKİ sorgu: atanmamışlar üstte, sonra en yeniler.
    PostgREST ifadeye göre sıralayamıyor ("atanmış mı" bir sütun
    değil); tek sorguda assigned_employee_id'ye göre sıralamak
    atanmışları kimlik sırasına dizerdi.

    Süren işler GÖRÜNÜMDEN: kart adım yüzdesini gösteriyor, görünüm
    adim_toplam/adim_tamam'ı hazır veriyor. Planlanan ve aşama
    sorguları yüzde göstermiyor, onlar tabloyu okuyor — görünümün yan
    sorguları boşuna işlemesin.
  */
  const IS_SUTUNLARI = "id,title,customer_name,status,due_date,created_at,updated_at,assigned_employee_id";
  const [
    { data: planlananAtanmamisData, error: planlananAtanmamisError },
    { data: planlananAtanmisData, error: planlananAtanmisError },
    { data: surenData, error: surenError },
    { data: asamaData, error: asamaError },
    { data: employeeData, error: employeeError },
    { data: messageData, error: messageError },
    { count: okunmamisSayisi },
    { data: ozetVerisi, error: ozetError },
  ] = await Promise.all([
    supabase.from("operation_workflows").select(IS_SUTUNLARI)
      .eq("organization_id", organizationId).eq("status", "planned").is("assigned_employee_id", null)
      .order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    supabase.from("operation_workflows").select(IS_SUTUNLARI)
      .eq("organization_id", organizationId).eq("status", "planned").not("assigned_employee_id", "is", null)
      .order("created_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    // Termini en yakın olan üstte; tarihi olmayanlar sonda.
    supabase.from("operasyon_is_liste").select(`${IS_SUTUNLARI},adim_toplam,adim_tamam`)
      .eq("organization_id", organizationId).in("status", [...surenStatuses])
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false }).limit(GENEL_BAKIS_SATIR),
    /*
      YAKLAŞAN AŞAMALAR — operasyoncunun kendi cümlesiyle "hangi
      maddenin tarihi yaklaşıyor". Bu sayfa bir zamanlar yalnızca İŞİN
      terminine bakıyordu; oysa sekiz aşamalı bir işte asıl kaçırılan,
      işin termini daha uzakken gecikmiş olan ara teslim. Pencere işin
      terminiyle aynı: bugüne kadar gecikmişler + önümüzdeki 7 gün.
      !inner: adımın işi RLS'te görünmüyorsa adım da gelmez.
    */
    supabase.from("operation_steps")
      .select("id,title,due_date,assigned_employee_id,operation_workflows!inner(id,title,customer_name,assigned_employee_id,status)")
      .eq("organization_id", organizationId).eq("is_completed", false)
      .not("due_date", "is", null).lte("due_date", weekEnd)
      .in("operation_workflows.status", [...activeStatuses])
      .order("due_date", { ascending: true }).order("title").limit(GENEL_BAKIS_SATIR),
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
      kutucuğun sessizce "500"de donması demekti.
    */
    supabase.from("customer_file_messages")
      .select("id,operation_workflows!inner(id)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("sender_type", "customer")
      .is("read_at", null)
      .neq("operation_workflows.status", "cancelled"),
    supabase.rpc("operasyon_genel_bakis_ozeti", {
      p_organization_id: organizationId,
      p_aktif: [...activeStatuses],
      p_suren: [...surenStatuses],
    }),
  ]);
  if (planlananAtanmamisError || planlananAtanmisError || surenError)
    throw new Error("İş akışları okunamadı: " + (planlananAtanmamisError ?? planlananAtanmisError ?? surenError)!.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (messageError) throw new Error("Müşteri mesajları okunamadı: " + messageError.message);
  /* Grafik ya da aşama listesi okunamazsa sayfa düşmez; uyarı satırı söyler. */
  const uyarilar = [
    ...(ozetError ? ["Operasyon sayıları"] : []),
    ...(asamaError ? ["Yaklaşan aşamalar"] : []),
  ];
  const ozet = (ozetVerisi ?? {}) as Partial<Ozet>;
  const sayi = (deger: number | undefined) => Number(deger ?? 0);
  const seri = gunlukSeriDilimler(ozet.seri ?? [], simdi());

  const employeeName = new Map(((employeeData ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, formatPersonName(row.full_name)]));
  const personAdi = (id: string | null) => (id ? employeeName.get(id) ?? "Pasif personel" : null);
  const assigneeOf = (workflow: { assigned_employee_id: string | null }) => personAdi(workflow.assigned_employee_id);

  // Kartlar: atanmamış yeni işler üstte, sonra en yeni.
  const plannedList = [
    ...((planlananAtanmamisData ?? []) as Workflow[]),
    ...((planlananAtanmisData ?? []) as Workflow[]),
  ].slice(0, GENEL_BAKIS_SATIR);
  const unassignedPlanned = sayi(ozet.planlanan_atanmamis);
  const ongoingList = (surenData ?? []) as unknown as SurenIs[];
  const blockedCount = sayi(ozet.tikali);

  const yaklasanAsamalar = ((asamaData ?? []) as unknown as AsamaSatiri[]).map((satir) => {
    const is = Array.isArray(satir.operation_workflows) ? satir.operation_workflows[0] : satir.operation_workflows;
    return {
      id: satir.id,
      baslik: satir.title,
      tarih: satir.due_date,
      isId: is?.id ?? "",
      musteri: is?.customer_name || "Kurum içi iş",
      // Adımın kendi sorumlusu yoksa işin sorumlusu (panodaki kuralla aynı).
      sorumlu: satir.assigned_employee_id ? personAdi(satir.assigned_employee_id) : personAdi(is?.assigned_employee_id ?? null),
    };
  });
  const gecikenAsama = sayi(ozet.asama_gecmis);
  const asamaToplami = gecikenAsama + sayi(ozet.asama_yakin);

  const overdueCount = sayi(ozet.termin_gecmis);
  const dueSoonCount = sayi(ozet.termin_yakin);

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
        <ListeKarti baslik="Yaklaşan aşamalar" alt={gecikenAsama ? `${gecikenAsama} aşamanın teslimi gecikti` : "Önümüzdeki 7 gün içinde teslim edilecek"} bos="Yaklaşan aşama yok. Aşama tarihleri iş detayında “Tarihleri dağıt” ile doldurulabilir." href="/panel/operations/takvim" hrefEtiket="Takvimde gör" sayi={asamaToplami}>
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

        <ListeKarti baslik="Yeni gelen işler" alt={unassignedPlanned ? `${unassignedPlanned} iş sorumlu bekliyor` : "Planlanan, henüz başlamamış işler"} bos="Yeni iş yok. Sözleşmesi onaylanan işler burada belirir." href={`${ISLER}?durum=planned`} hrefEtiket="Tümünü gör" sayi={sayi(ozet.planlanan)}>
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
        <ListeKarti baslik="Devam eden işler" alt={blockedCount ? `${blockedCount} iş beklemede` : overdueCount || dueSoonCount ? `${overdueCount ? `${overdueCount} geciken, ` : ""}bu hafta ${dueSoonCount} teslim` : "Üzerinde çalışılan işler"} bos="Şu an devam eden iş yok." href={`${ISLER}?durum=devam`} hrefEtiket="Tümünü gör" sayi={sayi(ozet.suren)}>
          {ongoingList.slice(0, GENEL_BAKIS_SATIR).map((workflow) => {
            const ilerleme = adimIlerlemesi(Number(workflow.adim_tamam), Number(workflow.adim_toplam));
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
