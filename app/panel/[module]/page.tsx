import { notFound } from "next/navigation";
import { getPanelContext, panelModules } from "@/lib/panel-context";
import { createCrmRequest } from "./actions";

const statusNames: Record<string, string> = { new: "Yeni", qualified: "Nitelikli", proposal: "Teklif", won: "Kazanıldı", lost: "Kaybedildi" };

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: code } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  const enabled = modules.find((module) => module.code === code);
  if (!enabled || !panelModules[code]) notFound();

  if (code === "crm") {
    const { data: requests, error } = await supabase.from("crm_requests")
      .select("id,title,customer_name,email,phone,status,estimated_value,created_at")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("CRM kayıtları okunamadı.");

    return <>
      <div className="panel-pagehead"><div><small className="panel-kicker">MÜŞTERİ VE SATIŞ</small><h1>Talep yönetimi</h1><p>Yeni talepleri kaydedin, teklif ve satış aşamasına hazırlayın.</p></div></div>
      <div className="panel-grid">
        <section className="panel-card">
          <small>YENİ TALEP</small><h3>Talep oluştur</h3>
          <form className="panel-form" action={createCrmRequest}>
            <label className="wide">Talep başlığı<input name="title" required minLength={2} placeholder="Örn. Kurumsal danışmanlık talebi" /></label>
            <label>Müşteri / kurum<input name="customer_name" required minLength={2} /></label>
            <label>Tahmini değer<input name="estimated_value" type="number" min="0" step="0.01" /></label>
            <label>E-posta<input name="email" type="email" /></label>
            <label>Telefon<input name="phone" type="tel" /></label>
            <label className="wide">Notlar<textarea name="notes" /></label>
            <button className="panel-primary wide" type="submit">Talebi kaydet</button>
          </form>
        </section>
        <section className="panel-card panel-span-2">
          <small>GÜNCEL KAYITLAR</small><h3>Talep havuzu</h3>
          {requests?.length ? <table className="panel-table"><thead><tr><th>TALEP</th><th>MÜŞTERİ</th><th>DURUM</th><th>TAHMİNİ DEĞER</th></tr></thead><tbody>
            {requests.map((request) => <tr key={request.id}><td><b>{request.title}</b><br /><small>{new Date(request.created_at).toLocaleDateString("tr-TR")}</small></td><td>{request.customer_name}</td><td><span className="status-pill">{statusNames[request.status] ?? request.status}</span></td><td>{Number(request.estimated_value).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td></tr>)}
          </tbody></table> : <div className="panel-empty">Henüz talep kaydı yok. İlk talebi soldaki formdan ekleyebilirsiniz.</div>}
        </section>
      </div>
    </>;
  }

  const cards: Record<string, [string, string][]> = {
    operations: [["İş akışları", "İşleri adımlara bölün ve tamamlanma oranını izleyin."], ["Görevler", "Ekip sorumluluklarını ve teslim tarihlerini yönetin."], ["Takvim", "Operasyon yoğunluğunu tek görünümde planlayın."]],
    finance: [["Gelirler", "Satış ve tahsilat kayıtlarını kurum bazında izleyin."], ["Giderler", "Masraf ve ödeme hareketlerini sınıflandırın."], ["Nakit akışı", "Yaklaşan tahsilat ve ödemeleri görün."]],
    reporting: [["Satış raporları", "Kişi, dönem ve iş türüne göre performansı inceleyin."], ["Operasyon raporları", "Termin ve tamamlanma verilerini karşılaştırın."], ["Finans raporları", "Gelir, gider ve kârlılık eğilimlerini izleyin."]],
    hr: [["Ekip", "Kurum kullanıcılarını ve görev kapsamlarını yönetin."], ["Roller", "Owner, yönetici ve ekip yetkilerini tanımlayın."], ["İzinler", "İzin ve uygunluk takibini tek alanda tutun."]],
    documents: [["Belge merkezi", "Kurum belgelerini süreçlerle ilişkilendirin."], ["Şablonlar", "Teklif ve sözleşme şablonlarını standartlaştırın."], ["Arşiv", "Tamamlanan işlerin belgelerini düzenli saklayın."]],
  };

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">ETKİN MODÜL</small><h1>{enabled.name}</h1><p>{enabled.description}</p></div><button className="panel-primary" type="button">Yeni kayıt</button></div>
    <section className="panel-grid">{(cards[code] ?? []).map(([title, description]) => <article className="panel-card" key={title}><small>{enabled.name.toUpperCase()}</small><h3>{title}</h3><p>{description}</p><a href="#">Çalışma alanını aç →</a></article>)}</section>
  </>;
}
