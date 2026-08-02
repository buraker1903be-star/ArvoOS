import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import "../crm.css";

type Opportunity = {
  id: string;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  estimated_value: number;
  probability: number;
  expected_close_date: string | null;
  source: string | null;
  request_details: { service_type?: string; academic_level?: string; university?: string } | null;
  created_at: string;
  updated_at: string;
};

type Props = { searchParams: Promise<{ search?: string; status?: string }> };

const proposalStages = ["proposal", "proposal_ready", "proposal_approved"];
const statusLabels: Record<string, string> = {
  proposal: "Teklif hazırlanıyor",
  proposal_ready: "Teklif hazır",
  proposal_approved: "Teklif onaylandı",
};
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value / 100);
const clean = (value?: string) => value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";

export default async function ProposalsPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = clean(params.search);
  const status = proposalStages.includes(params.status ?? "") ? params.status! : "";
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  let query = supabase.from("crm_opportunities")
    .select("id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,expected_close_date,source,request_details,created_at,updated_at")
    .eq("organization_id", membership.organization_id)
    .in("stage", proposalStages);
  if (search) query = query.or(`customer_name.ilike.%${search}%,title.ilike.%${search}%`);
  if (status) query = query.eq("stage", status);

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error("Teklif kayıtları okunamadı: " + error.message);

  const rows = (data ?? []) as Opportunity[];
  const total = rows.reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0);
  const approved = rows.filter((row) => row.stage === "proposal_approved").length;
  const filtered = Boolean(search || status);

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">CRM / TEKLİF YÖNETİMİ</small><h1>Teklifler</h1><p>Taleplerden hazırlanan teklifleri müşteri, hizmet, durum ve geçerlilik bilgileriyle yönetin.</p></div>
      <div className="panel-page-actions"><span className="status-pill">{rows.length} kayıt</span><Link className="panel-primary" href="/panel/crm">Taleplere git</Link></div>
    </div>

    <section className="crm-metrics">
      <article><small>TOPLAM TEKLİF</small><strong>{rows.length}</strong><span>Filtre sonucundaki kayıtlar</span></article>
      <article><small>TEKLİF DEĞERİ</small><strong>{money(total)}</strong><span>Toplam teklif bedeli</span></article>
      <article><small>ONAY BEKLEYEN</small><strong>{rows.length - approved}</strong><span>Hazırlık veya müşteri dönüşü</span></article>
      <article><small>ONAYLANAN</small><strong>{approved}</strong><span>Sözleşmeye dönüştürülebilir</span></article>
    </section>

    <section className="panel-card">
      <form action="/panel/crm/proposals" method="get" className="panel-form" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(220px,.35fr) auto" }}>
        <label>Teklif / müşteri ara<input type="search" name="search" defaultValue={search} placeholder="Müşteri veya talep konusu" /></label>
        <label>Durum<select name="status" defaultValue={status}><option value="">Aktif tekliflerin tümü</option>{proposalStages.map((stage) => <option value={stage} key={stage}>{statusLabels[stage]}</option>)}</select></label>
        <div className="panel-form-actions"><button className="panel-primary" type="submit">Filtrele</button>{filtered ? <Link className="panel-secondary" href="/panel/crm/proposals">Temizle</Link> : null}</div>
      </form>
    </section>

    <section className="panel-card">
      <div className="section-heading compact"><div><small className="panel-kicker">TEKLİF LİSTESİ</small><h2>Teklif kayıtları</h2></div><span>{rows.length} sonuç</span></div>
      <div className="dashboard-actions">
        {rows.map((row) => {
          const detail = row.request_details ?? {};
          return <article key={row.id} className="crm-card" style={{ marginBottom: 10 }}>
            <div className="crm-card-top"><small>{statusLabels[row.stage] ?? row.stage}</small><span>{row.source || "Doğrudan"}</span></div>
            <h3>{row.customer_name}</h3>
            <p>{row.title}</p>
            <small>{[detail.service_type, detail.academic_level, detail.university].filter(Boolean).join(" · ") || "Hizmet bilgisi belirtilmedi"}</small>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 12 }}>
              <span><small>İletişim</small><b>{row.contact_phone || row.contact_email || "Belirtilmedi"}</b></span>
              <span><small>Geçerlilik / hedef</small><b>{row.expected_close_date ? new Date(row.expected_close_date + "T00:00:00").toLocaleDateString("tr-TR") : "Belirtilmedi"}</b></span>
              <span><small>Teklif bedeli</small><b>{money(row.estimated_value)}</b></span>
            </div>
            <div className="panel-page-actions" style={{ marginTop: 14 }}><Link className="panel-secondary" href="/panel/crm">Kaynağı görüntüle</Link>{row.stage === "proposal_approved" ? <Link className="panel-primary" href="/panel/crm/contracts">Sözleşme sürecine geç</Link> : null}</div>
          </article>;
        })}
        {!rows.length ? <div className="crm-empty">{filtered ? "Filtrelerle eşleşen teklif bulunamadı." : "Henüz teklif aşamasında kayıt bulunmuyor."}</div> : null}
      </div>
    </section>
  </div>;
}
