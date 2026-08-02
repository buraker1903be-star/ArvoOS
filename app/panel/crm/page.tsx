import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { createOpportunity, moveOpportunity } from "./actions";
import "./crm.css";

const defaultColumns = [
  { code: "lead", name: "Yeni Talep", probability: 10, is_terminal: false },
  { code: "qualified", name: "Görüşme", probability: 25, is_terminal: false },
  { code: "proposal", name: "Teklif", probability: 50, is_terminal: false },
  { code: "contract", name: "Sözleşme", probability: 70, is_terminal: false },
  { code: "payment", name: "Tahsilat", probability: 90, is_terminal: false },
  { code: "won", name: "Kazanıldı", probability: 100, is_terminal: true },
  { code: "lost", name: "Kaybedildi", probability: 0, is_terminal: true },
];

type Stage = { code: string; name: string; probability: number; is_terminal: boolean; sort_order?: number };
type RequestDetails = { service_type?: string; academic_level?: string; university?: string; department?: string; language?: string; analysis_software?: string; scope?: string };
type Opportunity = {
  id: string; title: string; customer_name: string; contact_email: string | null; contact_phone: string | null;
  stage: string; estimated_value: number; probability: number; expected_close_date: string | null; source: string | null;
  notes: string | null; lost_reason: string | null; request_details: RequestDetails | null; updated_at: string;
};

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);

export default async function CrmPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const [{ data, error }, { data: configuredStages, error: stageError }] = await Promise.all([
    supabase.from("crm_opportunities")
      .select("id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,expected_close_date,source,notes,lost_reason,request_details,updated_at")
      .eq("organization_id", membership.organization_id)
      .order("updated_at", { ascending: false }),
    supabase.from("organization_crm_stages")
      .select("code,name,probability,sort_order,is_terminal")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (error) throw new Error("CRM talepleri okunamadı: " + error.message);
  if (stageError) throw new Error("CRM aşamaları okunamadı: " + stageError.message);

  const columns = ((configuredStages?.length ? configuredStages : defaultColumns) ?? []) as Stage[];
  const academicMode = columns.some((stage) => stage.code === "academic_review");
  const opportunities = (data ?? []) as Opportunity[];
  const terminalCodes = new Set(columns.filter((stage) => stage.is_terminal).map((stage) => stage.code));
  const active = opportunities.filter((item) => !terminalCodes.has(item.stage));
  const newRequests = opportunities.filter((item) => item.stage === "lead");
  const activeValue = active.reduce((sum, item) => sum + item.estimated_value, 0);
  const weightedValue = active.reduce((sum, item) => sum + Math.round(item.estimated_value * item.probability / 100), 0);
  const completedCodes = new Set(["won", "completed"]);
  const completed = opportunities.filter((item) => completedCodes.has(item.stage));
  const lost = opportunities.filter((item) => item.stage === "lost");
  const conversion = completed.length + lost.length ? Math.round(completed.length / (completed.length + lost.length) * 100) : 0;

  const requestForm = <form className="panel-form" action={createOpportunity}>
    {academicMode ? <>
      <label>Müşteri türü<select name="customer_type" defaultValue="Bireysel"><option>Bireysel</option><option>Kurumsal</option></select></label>
      <label>Hizmet türü<select name="service_type" required defaultValue=""><option value="" disabled>Seçin</option><option>Tez Danışmanlığı</option><option>Makale Hazırlama</option><option>İstatistiksel Analiz</option><option>Editörlük ve Dil Kontrolü</option><option>Literatür Taraması</option><option>Sunum Hazırlama</option><option>Diğer</option></select></label>
    </> : null}
    <label>Talep konusu<input name="title" required minLength={2} maxLength={180} placeholder={academicMode ? "Örn. Doktora tezi analiz desteği" : "Talep konusu"} /></label>
    <label>Müşteri / kurum<input name="customer_name" required minLength={2} maxLength={180} /></label>
    <label>E-posta<input name="contact_email" type="email" /></label>
    <label>Telefon<input name="contact_phone" /></label>
    {academicMode ? <>
      <label>Üniversite<input name="university" maxLength={180} /></label><label>Fakülte<input name="faculty" maxLength={180} /></label>
      <label>Bölüm / alan<input name="department" maxLength={180} /></label><label>Program<input name="program" maxLength={180} /></label>
      <label>Akademik düzey<select name="academic_level" defaultValue=""><option value="">Seçin</option><option>Lisans</option><option>Yüksek Lisans</option><option>Doktora</option><option>Doçentlik</option><option>Kurumsal Araştırma</option></select></label>
      <label>Danışman<input name="advisor" maxLength={180} /></label>
      <label>Çalışma dili<select name="language" defaultValue="Türkçe"><option>Türkçe</option><option>İngilizce</option><option>Almanca</option><option>Fransızca</option><option>Diğer</option></select></label>
      <label>Analiz programı<input name="analysis_software" placeholder="SPSS, AMOS, R, Python..." /></label>
      <label>Sayfa / örneklem bilgisi<input name="page_or_sample_info" /></label><label>İntihal hedefi<input name="plagiarism_target" placeholder="Örn. %15 altı" /></label>
      <label className="wide">Yapay zekâ kullanım tercihi<input name="ai_preference" placeholder="Kurum veya üniversite kuralını belirtin" /></label>
      <label className="wide">Beklenen kapsam ve teslimler<textarea name="scope" required maxLength={4000} /></label>
    </> : null}
    <label>Beklenen tutar<input name="estimated_value" type="number" min="0" step="0.01" defaultValue="0" /></label>
    <label>Planlanan sonuç / teslim tarihi<input name="expected_close_date" type="date" /></label>
    <label>Talep kaynağı<input name="source" placeholder="Web sitesi, telefon, referans..." /></label>
    <label className="wide">Ek not<textarea name="notes" maxLength={4000} /></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Talebi kaydet</button></div>
  </form>;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">{academicMode ? "AKADEMİK HİZMET SÜRECİ" : "MÜŞTERİ VE SATIŞ"}</small><h1>CRM</h1><p>{academicMode ? "Akademik talepleri değerlendirmeden sözleşme, ödeme, uzman atama ve teslime kadar yönetin." : "Yeni talepleri kaydedin, görüşmeden tahsilata kadar tüm süreci tek akışta yönetin."}</p></div>
      <div className="panel-page-actions"><span className="status-pill">{newRequests.length} yeni talep</span><PanelDrawer triggerLabel="+ Yeni talep" title={academicMode ? "Akademik danışmanlık talebi" : "Yeni talep"} description={academicMode ? "Müşteri ve akademik çalışma bilgilerini kaydedin." : "Müşteri veya kurum talebini kaydedin."}>{requestForm}</PanelDrawer></div>
    </div>

    <section className="crm-metrics">
      <article><small>YENİ TALEP</small><strong>{newRequests.length}</strong><span>İlk değerlendirmeyi bekliyor</span></article>
      <article><small>AKTİF SÜREÇ</small><strong>{active.length}</strong><span>Devam eden kayıtlar</span></article>
      <article><small>TAHMİNİ GELİR</small><strong>{money(weightedValue)}</strong><span>Olasılığa göre</span></article>
      <article><small>TAMAMLAMA ORANI</small><strong>%{conversion}</strong><span>Sonuçlanan kayıtlar</span></article>
    </section>

    <div className="section-heading"><div><small className="panel-kicker">SÜREÇ TAKİBİ</small><h2>{academicMode ? "Akademik hizmet aşamaları" : "Talep ve satış aşamaları"}</h2></div><span>{opportunities.length} toplam kayıt · {money(activeValue)} aktif değer</span></div>
    <section className="crm-board">
      {columns.filter((column) => column.code !== "lost").map((column) => {
        const cards = opportunities.filter((item) => item.stage === column.code);
        const total = cards.reduce((sum, item) => sum + item.estimated_value, 0);
        return <section className="crm-column" key={column.code}>
          <header><div><small>{column.name.toUpperCase()}</small><strong>{cards.length}</strong></div><span>{money(total)}</span></header>
          <div className="crm-cards">
            {cards.map((item) => { const details = item.request_details ?? {}; return <article className="panel-card crm-card" key={item.id}>
              <div className="crm-card-top"><small>%{item.probability}</small>{item.source ? <span>{item.source}</span> : null}</div>
              <h3>{item.title}</h3><p>{item.customer_name}</p>
              {academicMode && details.service_type ? <small>{details.service_type}{details.academic_level ? ` · ${details.academic_level}` : ""}</small> : null}
              {academicMode && (details.university || details.department) ? <small>{[details.university, details.department].filter(Boolean).join(" · ")}</small> : null}
              <strong>{money(item.estimated_value)}</strong>
              {item.expected_close_date ? <small>Hedef: {new Date(item.expected_close_date + "T00:00:00").toLocaleDateString("tr-TR")}</small> : null}
              <form action={moveOpportunity}>
                <input type="hidden" name="opportunity_id" value={item.id} />
                <label>Aşama<select name="stage" defaultValue={item.stage} aria-label="Talep aşaması">{columns.map((stage) => <option value={stage.code} key={stage.code}>{stage.name}</option>)}</select></label>
                <label>Kayıp nedeni<input name="lost_reason" placeholder="Yalnızca kaybedildiyse" aria-label="Kayıp nedeni" /></label>
                <button className="panel-secondary" type="submit">Değişikliği kaydet</button>
              </form>
            </article>; })}
            {!cards.length ? <div className="crm-empty">Bu aşamada kayıt yok</div> : null}
          </div>
        </section>;
      })}
    </section>

    {lost.length ? <section className="panel-card crm-lost"><small>KAYBEDİLEN TALEPLER</small>{lost.map((item) => <p key={item.id}><b>{item.customer_name}</b> · {item.title} · {item.lost_reason || "Neden belirtilmedi"}</p>)}</section> : null}
  </div>;
}
