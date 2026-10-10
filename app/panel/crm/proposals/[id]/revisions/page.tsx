import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import "../../../crm.css";
import "../../../kayit-detay/kayit-detay.css";

/*
  TEKLİF REVİZYONLARI (10.10.2026): panelin kayıt detayı kalıbında.

  Revizyonlar bir ZAMAN ÇİZELGESİ — R0'dan bugüne. Eskiden her sürüm
  ayrı bir kart olarak çiziliyordu (crm-record + yan panel) ve sürümler
  arasındaki sıra görünmüyordu; sayfa ayrıca panel-pagehead ve
  crm-metrics kutularıyla panelin geri kalanından ayrı duruyordu.
  Çizelge belge yaşam döngüsüyle ortak (.kayit-zaman).

  Değişen alan hesabı aynı: her sürüm bir öncekiyle karşılaştırılıyor.
*/

type Revizyon = {
  id: string;
  proposal_no: string;
  title: string;
  scope: string | null;
  amount: number;
  currency: string;
  payment_plan: string | null;
  valid_until: string | null;
  status: string;
  revision_no: number;
  revision_note: string | null;
  previous_revision_id: string | null;
  superseded_by: string | null;
  created_at: string;
  created_by: string | null;
};

type SecilenTeklif = {
  id: string;
  root_proposal_id: string | null;
  organization_id: string;
  opportunity_id: string | null;
  crm_opportunities: { customer_name: string } | { customer_name: string }[] | null;
};

const para = (deger: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(Number(deger || 0) / 100);
const tarihSaat = (deger: string) => new Date(deger).toLocaleString("tr-TR");
const gun = (deger: string | null) =>
  deger ? new Date(`${deger}T00:00:00`).toLocaleDateString("tr-TR") : "—";

const DURUM: Record<string, { ad: string; ton: string }> = {
  draft: { ad: "Taslak", ton: "neutral" },
  sent: { ad: "Gönderildi", ton: "warning" },
  accepted: { ad: "Kabul edildi", ton: "success" },
  rejected: { ad: "Reddedildi", ton: "danger" },
  expired: { ad: "Süresi doldu", ton: "neutral" },
  archived: { ad: "Arşiv", ton: "neutral" },
};

export default async function TeklifRevizyonlari({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((modul) => modul.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");

  const { data: secilenVeri, error: secilenHata } = await supabase
    .from("crm_proposals")
    .select("id,root_proposal_id,organization_id,opportunity_id,crm_opportunities(customer_name)")
    .eq("id", id).eq("organization_id", membership.organization_id).maybeSingle();
  if (secilenHata) throw new Error(`Teklif okunamadı: ${secilenHata.message}`);
  if (!secilenVeri) notFound();
  const secilen = secilenVeri as unknown as SecilenTeklif;

  const kokId = secilen.root_proposal_id || secilen.id;
  const { data, error } = await supabase
    .from("crm_proposals")
    .select("id,proposal_no,title,scope,amount,currency,payment_plan,valid_until,status,revision_no,revision_note,previous_revision_id,superseded_by,created_at,created_by")
    .eq("organization_id", membership.organization_id)
    .or(`id.eq.${kokId},root_proposal_id.eq.${kokId}`)
    .order("revision_no", { ascending: true });
  if (error) throw new Error(`Revizyon geçmişi okunamadı: ${error.message}`);

  const surumler = (data ?? []) as Revizyon[];
  const guncel = surumler.find((satir) => !satir.superseded_by) ?? surumler.at(-1);
  const musteri = Array.isArray(secilen.crm_opportunities)
    ? secilen.crm_opportunities[0]?.customer_name
    : secilen.crm_opportunities?.customer_name;

  /* Her sürümde bir öncekine göre neyin değiştiği: revizyonun sebebini
     not yazılmamışsa da gösteriyor. */
  const degisenler = (sira: number) => {
    const satir = surumler[sira];
    const onceki = sira > 0 ? surumler[sira - 1] : null;
    if (!onceki) return [];
    return [
      onceki.amount !== satir.amount ? "Bedel" : null,
      onceki.title !== satir.title ? "Başlık" : null,
      onceki.scope !== satir.scope ? "Kapsam" : null,
      onceki.payment_plan !== satir.payment_plan ? "Ödeme planı" : null,
    ].filter(Boolean) as string[];
  };

  return <main className="talep cari">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">CRM · TEKLİF REVİZYONLARI</small>
        <h1>{guncel?.proposal_no || "Teklif"}</h1>
        <p>{musteri || "Müşteri"}</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/crm/proposals">← Teklifler</Link>
        {guncel ? <Link className="panel-secondary" href={`/panel/documents/proposal/${guncel.id}`}>Yaşam döngüsü</Link> : null}
        {guncel ? <Link className="panel-primary" href={`/panel/documents/proposal/${guncel.id}/preview`}>Önizle / PDF</Link> : null}
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Revizyon özeti">
      <dl>
        <div><dt>Sürüm</dt><dd>{surumler.length}</dd></div>
        <div><dt>İlk sürüm</dt><dd>{surumler[0] ? tarihSaat(surumler[0].created_at) : "—"}</dd></div>
        <div><dt>Son sürüm</dt><dd>R{guncel?.revision_no ?? 0}</dd></div>
        <div className="cari-bakiye"><dt>Güncel bedel</dt><dd>{guncel ? para(guncel.amount, guncel.currency) : "—"}</dd></div>
        <div><dt>Durum</dt><dd>{guncel ? DURUM[guncel.status]?.ad ?? guncel.status : "—"}</dd></div>
      </dl>
    </nav>

    <div className="talep-izgara kayit-iki-izgara">
      <section className="panel-card talep-bilgi" aria-label="Revizyon geçmişi">
        <div className="cari-baslik"><h2>Sürüm geçmişi</h2><small>eskiden yeniye</small></div>
        {surumler.length ? (
          <ol className="kayit-zaman">
            {surumler.map((satir, sira) => {
              const degisen = degisenler(sira);
              const etiket = DURUM[satir.status] ?? { ad: satir.status, ton: "neutral" };
              return (
                /* Güncel sürümün işareti durumundan geliyor: kabul edilmiş
                   bir teklifi "sırada" (sarı) göstermek, rozetin dediğiyle
                   çelişiyordu. */
                <li key={satir.id} data-durum={satir.superseded_by || satir.status === "accepted" ? "complete" : "current"}>
                  <i aria-hidden="true">R{satir.revision_no}</i>
                  <div>
                    <h3>{satir.title}</h3>
                    <p>
                      {para(satir.amount, satir.currency)}
                      {satir.payment_plan ? ` · ${satir.payment_plan}` : ""}
                      {` · ${degisen.length ? `değişen: ${degisen.join(", ")}` : "ilk sürüm"}`}
                    </p>
                    {satir.revision_note ? <p><b>Revizyon nedeni:</b> {satir.revision_note}</p> : null}
                    {satir.scope ? <p className="kayit-zaman-kapsam">{satir.scope}</p> : null}
                    <small>{tarihSaat(satir.created_at)} · geçerlilik {gun(satir.valid_until)}</small>
                  </div>
                  <span className="status-pill" data-tone={etiket.ton}>{etiket.ad}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>Sürüm bulunamadı</h2>
            <p>Bu teklifin revizyon kaydı yok.</p>
          </div>
        )}
      </section>

      <aside className="panel-card talep-musteri" aria-label="Güncel sürüm">
        <div className="cari-baslik"><h2>Güncel sürüm</h2><small>müşteriye açık olan</small></div>
        {guncel ? <>
          <dl className="stg-list">
            <div><dt>Sürüm</dt><dd>R{guncel.revision_no}</dd></div>
            <div><dt>Belge no</dt><dd>{guncel.proposal_no}</dd></div>
            <div><dt>Bedel</dt><dd>{para(guncel.amount, guncel.currency)}</dd></div>
            <div><dt>Ödeme planı</dt><dd>{guncel.payment_plan || "Belirtilmedi"}</dd></div>
            <div><dt>Geçerlilik</dt><dd>{gun(guncel.valid_until)}</dd></div>
            <div><dt>Durum</dt><dd>{DURUM[guncel.status]?.ad ?? guncel.status}</dd></div>
          </dl>
          <div className="kayit-kunye-eylem">
            {secilen.opportunity_id ? <Link className="panel-secondary" href={`/panel/crm/musteri/${secilen.opportunity_id}`}>Müşteri kaydını aç</Link> : null}
          </div>
        </> : <p className="talep-bos cari-not">Güncel sürüm bulunamadı.</p>}
      </aside>
    </div>
  </main>;
}
