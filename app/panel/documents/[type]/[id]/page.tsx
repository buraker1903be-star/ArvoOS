import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../../settings/settings.css";

/*
  BELGE YAŞAM DÖNGÜSÜ (10.10.2026): panelin kayıt detayı kalıbında.
  Üstte başlık, altında sayı şeridi, solda zaman çizelgesi, sağda
  belgenin kendi künyesi.

  Eskiden sayfa panel-pagehead + crm-metrics kutuları kullanıyordu ve
  zaman çizelgesi SATIR İÇİ stillerle çiziliyordu (renkler, daireler ve
  ızgara doğrudan JSX'te). Tema değişkenleri orada elle yazıldığı için
  koyu temada iki renk sabit kalıyordu; bu sayfa aynı zamanda belge
  listesinin satır tıklamasının gittiği yerdi, yani yeni listeden eski
  tasarıma düşülüyordu.

  Hesaplar değişmedi: olaylar aynı sırayla, aynı kaynaklardan.
*/

type ZamanOlayi = {
  key: string;
  title: string;
  detail: string;
  at: string | null;
  status: "complete" | "current" | "pending";
  href?: string;
};

const para = (deger: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(Number(deger || 0) / 100);
const tarihSaat = (deger: string | null) => (deger ? new Date(deger).toLocaleString("tr-TR") : "—");

const IS_DURUMU: Record<string, string> = {
  planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede",
  completed: "Tamamlandı", archived: "Arşivlendi", cancelled: "İptal edildi",
};

export default async function BelgeYasamDongusu({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!["proposal", "contract"].includes(type)) notFound();
  const sozlesmeMi = type === "contract";

  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => ["documents", "crm"].includes(modul.code))) {
    throw new Error("Belge yaşam döngüsüne erişiminiz yok.");
  }

  let opportunityId: string | null = null;
  if (!sozlesmeMi) {
    const { data, error } = await supabase.from("crm_proposals")
      .select("id,opportunity_id").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
    if (error) throw new Error(`Teklif okunamadı: ${error.message}`);
    if (!data) notFound();
    opportunityId = data.opportunity_id;
  } else {
    const { data, error } = await supabase.from("crm_contracts")
      .select("id,proposal_id,opportunity_id").eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
    if (error) throw new Error(`Sözleşme okunamadı: ${error.message}`);
    if (!data) notFound();
    opportunityId = data.opportunity_id;
  }

  const [firsatSonucu, teklifSonucu, sozlesmeSonucu] = await Promise.all([
    supabase.from("crm_opportunities")
      .select("id,title,customer_name,stage,estimated_value,created_at,updated_at")
      .eq("id", opportunityId).eq("organization_id", membership.organization_id).maybeSingle(),
    supabase.from("crm_proposals")
      .select("id,proposal_no,title,amount,currency,status,revision_no,revision_note,created_at,sent_at,first_viewed_at,responded_at,superseded_at,superseded_by")
      .eq("opportunity_id", opportunityId).eq("organization_id", membership.organization_id).order("revision_no", { ascending: true }),
    supabase.from("crm_contracts")
      .select("id,contract_no,title,amount,currency,status,created_at,sent_at,first_viewed_at,signed_at,signed_name,workflow_id,payment_plan_id,invoice_id")
      .eq("opportunity_id", opportunityId).eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  if (firsatSonucu.error) throw new Error(`Talep kaydı okunamadı: ${firsatSonucu.error.message}`);
  if (teklifSonucu.error) throw new Error(`Teklif geçmişi okunamadı: ${teklifSonucu.error.message}`);
  if (sozlesmeSonucu.error) throw new Error(`Sözleşme kaydı okunamadı: ${sozlesmeSonucu.error.message}`);

  const firsat = firsatSonucu.data;
  if (!firsat) notFound();
  const teklifler = teklifSonucu.data ?? [];
  const sozlesme = sozlesmeSonucu.data;

  const [isSonucu, planSonucu, faturaSonucu] = await Promise.all([
    sozlesme?.workflow_id
      ? supabase.from("operation_workflows").select("id,status,created_at,updated_at,start_date,due_date")
          .eq("id", sozlesme.workflow_id).eq("organization_id", membership.organization_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sozlesme?.payment_plan_id
      ? supabase.from("payment_plans").select("id,status,total_amount,currency,created_at,updated_at")
          .eq("id", sozlesme.payment_plan_id).eq("organization_id", membership.organization_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sozlesme?.invoice_id
      ? supabase.from("billing_invoices").select("id,status,total,currency,created_at,paid_at,due_at")
          .eq("id", sozlesme.invoice_id).eq("organization_id", membership.organization_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (isSonucu.error) throw new Error(`İş akışı okunamadı: ${isSonucu.error.message}`);
  if (planSonucu.error) throw new Error(`Ödeme planı okunamadı: ${planSonucu.error.message}`);
  if (faturaSonucu.error) throw new Error(`Fatura kaydı okunamadı: ${faturaSonucu.error.message}`);

  const is = isSonucu.data;
  const plan = planSonucu.data;
  const fatura = faturaSonucu.data;
  const sonTeklif = teklifler.find((teklif) => !teklif.superseded_by) ?? teklifler.at(-1);
  const guncelTutar = sozlesme?.amount ?? sonTeklif?.amount ?? firsat.estimated_value ?? 0;
  const guncelBirim = sozlesme?.currency ?? sonTeklif?.currency ?? "TRY";
  /* Açık olan belge bu sayfanın konusu; sağdaki künye onun. */
  const buBelge = sozlesmeMi ? sozlesme : teklifler.find((teklif) => teklif.id === id) ?? sonTeklif;

  const olaylar: ZamanOlayi[] = [
    { key: "request", title: "Talep oluşturuldu", detail: `${firsat.customer_name} · ${firsat.title}`, at: firsat.created_at, status: "complete" },
    ...teklifler.flatMap((teklif) => {
      const satirlar: ZamanOlayi[] = [{
        key: `proposal-${teklif.id}`,
        title: teklif.revision_no > 0 ? `Teklif revizyonu R${teklif.revision_no}` : "İlk teklif oluşturuldu",
        detail: `${teklif.proposal_no} · ${para(teklif.amount, teklif.currency)}${teklif.revision_note ? ` · ${teklif.revision_note}` : ""}`,
        at: teklif.created_at,
        status: teklif.superseded_by ? "complete" : teklif.status === "accepted" ? "complete" : "current",
        href: `/panel/crm/proposals/${teklif.id}/revisions`,
      }];
      if (teklif.sent_at) satirlar.push({ key: `proposal-sent-${teklif.id}`, title: "Teklif müşteriye gönderildi", detail: teklif.proposal_no, at: teklif.sent_at, status: "complete" });
      if (teklif.first_viewed_at) satirlar.push({ key: `proposal-view-${teklif.id}`, title: "Teklif görüntülendi", detail: teklif.proposal_no, at: teklif.first_viewed_at, status: "complete" });
      if (teklif.responded_at) satirlar.push({ key: `proposal-response-${teklif.id}`, title: teklif.status === "accepted" ? "Teklif kabul edildi" : "Teklif yanıtlandı", detail: teklif.proposal_no, at: teklif.responded_at, status: "complete" });
      return satirlar;
    }),
    { key: "contract", title: sozlesme ? "Sözleşme oluşturuldu" : "Sözleşme bekleniyor", detail: sozlesme ? `${sozlesme.contract_no} · ${para(sozlesme.amount, sozlesme.currency)}` : "Teklif kabul edildiğinde otomatik oluşturulur.", at: sozlesme?.created_at ?? null, status: sozlesme ? "complete" : "pending", href: sozlesme ? "/panel/crm/contracts" : undefined },
    { key: "contract-sent", title: sozlesme?.sent_at ? "Sözleşme imzaya gönderildi" : "İmzaya gönderim bekleniyor", detail: sozlesme?.contract_no ?? "Henüz sözleşme yok", at: sozlesme?.sent_at ?? null, status: sozlesme?.sent_at ? "complete" : "pending" },
    { key: "contract-signed", title: sozlesme?.signed_at ? "Sözleşme elektronik olarak onaylandı" : "Müşteri onayı bekleniyor", detail: sozlesme?.signed_at ? `${sozlesme.signed_name ?? "Müşteri"} tarafından onaylandı` : "Onay tamamlandığında iş akışı ve finans kayıtları açılır.", at: sozlesme?.signed_at ?? null, status: sozlesme?.signed_at ? "complete" : sozlesme ? "current" : "pending" },
    { key: "workflow", title: is ? "İş akışı oluşturuldu" : "İş akışı bekleniyor", detail: is ? `Durum: ${IS_DURUMU[is.status] ?? is.status}` : "Sözleşme onayından sonra otomatik oluşur.", at: is?.created_at ?? null, status: is ? (is.status === "completed" || is.status === "archived" ? "complete" : "current") : "pending", href: is ? `/panel/operations/${is.id}` : undefined },
    { key: "payment", title: plan ? "Ödeme planı finans modülüne aktarıldı" : "Ödeme planı bekleniyor", detail: plan ? `${para(plan.total_amount, plan.currency)} · ${plan.status}` : "Sözleşme onayından sonra taksitler oluşturulur.", at: plan?.created_at ?? null, status: plan ? (plan.status === "completed" ? "complete" : "current") : "pending", href: plan ? "/panel/finance" : undefined },
    { key: "invoice", title: fatura ? "Taslak fatura oluşturuldu" : "Fatura bekleniyor", detail: fatura ? `${para(fatura.total, fatura.currency)} · ${fatura.status}` : "Finans akışında oluşturulacaktır.", at: fatura?.created_at ?? null, status: fatura ? (fatura.status === "paid" ? "complete" : "current") : "pending", href: fatura ? "/panel/billing" : undefined },
    { key: "collection", title: fatura?.paid_at ? "Tahsilat tamamlandı" : "Tahsilat bekleniyor", detail: fatura?.paid_at ? `${para(fatura.total, fatura.currency)} tahsil edildi.` : "Ödeme planındaki taksitler tamamlandığında kapanır.", at: fatura?.paid_at ?? null, status: fatura?.paid_at ? "complete" : "pending", href: "/panel/finance" },
  ];

  const tamamlanan = olaylar.filter((olay) => olay.status === "complete").length;

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">DOKÜMANLAR · YAŞAM DÖNGÜSÜ</small>
        <h1>{firsat.customer_name}</h1>
        <p>{firsat.title}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/documents">← Belge Merkezi</Link>
        <Link className="panel-secondary" href={`/panel/documents/${type}/${id}/access-logs`}>Erişim geçmişi</Link>
        <Link className="panel-primary" href={`/panel/documents/${type}/${id}/preview`}>Önizle / PDF</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Belge özeti">
      <dl>
        <div className="cari-bakiye"><dt>Güncel bedel</dt><dd>{para(guncelTutar, guncelBirim)}</dd></div>
        <div><dt>Teklif sürümü</dt><dd>{teklifler.length}</dd></div>
        <div><dt>Sözleşme</dt><dd>{sozlesme ? sozlesme.contract_no : "—"}</dd></div>
        <div><dt>Tahsilat</dt><dd className={fatura?.paid_at ? undefined : "talep-uyari"}>{fatura?.paid_at ? "Tamamlandı" : "Bekleniyor"}</dd></div>
        <div><dt>Tamamlanan adım</dt><dd>{tamamlanan} / {olaylar.length}</dd></div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-iki-izgara">
      <section className="panel-card talep-bilgi" aria-label="Belge zaman çizelgesi">
        <div className="cari-baslik"><h2>Uçtan uca süreç</h2><small>talepten tahsilata</small></div>
        {/* Renkler ve daireler artık sınıflarda: satır içi stil koyu
            temada iki rengi sabit bırakıyordu. */}
        <ol className="kayit-zaman">
          {olaylar.map((olay) => (
            <li key={olay.key} data-durum={olay.status}>
              <i aria-hidden="true">{olay.status === "complete" ? "✓" : olay.status === "current" ? "•" : "○"}</i>
              <div>
                <h3>{olay.title}</h3>
                <p>{olay.detail}</p>
                {olay.at ? <small>{tarihSaat(olay.at)}</small> : null}
              </div>
              {olay.href ? <Link className="panel-secondary" href={olay.href}>Aç</Link> : null}
            </li>
          ))}
        </ol>
      </section>

      <aside className="panel-card talep-musteri" aria-label="Belge künyesi">
        <div className="cari-baslik"><h2>{sozlesmeMi ? "Sözleşme" : "Teklif"}</h2><small>açık olan belge</small></div>
        <dl className="stg-list">
          <div><dt>Belge no</dt><dd>{(sozlesmeMi ? sozlesme?.contract_no : buBelge && "proposal_no" in buBelge ? buBelge.proposal_no : null) ?? "—"}</dd></div>
          <div><dt>Konu</dt><dd>{buBelge?.title ?? firsat.title}</dd></div>
          <div><dt>Tutar</dt><dd>{buBelge ? para(buBelge.amount, buBelge.currency) : "—"}</dd></div>
          <div><dt>Durum</dt><dd>{buBelge?.status ?? "—"}</dd></div>
          <div><dt>Oluşturuldu</dt><dd>{tarihSaat(buBelge?.created_at ?? null)}</dd></div>
          {sozlesmeMi
            ? <div><dt>İmza</dt><dd>{sozlesme?.signed_at ? tarihSaat(sozlesme.signed_at) : "Bekliyor"}</dd></div>
            : <div><dt>Revizyon</dt><dd>{buBelge && "revision_no" in buBelge && buBelge.revision_no ? `R${buBelge.revision_no}` : "İlk sürüm"}</dd></div>}
        </dl>
        <div className="kayit-kunye-eylem">
          <Link className="panel-secondary" href={`/panel/crm/musteri/${firsat.id}`}>Müşteri kaydını aç</Link>
          {!sozlesmeMi && buBelge ? <Link className="panel-secondary" href={`/panel/crm/proposals/${buBelge.id}/revisions`}>Revizyon geçmişi</Link> : null}
          {is ? <Link className="panel-secondary" href={`/panel/operations/${is.id}`}>İşi aç</Link> : null}
        </div>
      </aside>
    </div>
  </main>;
}
