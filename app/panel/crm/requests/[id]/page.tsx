import Link from "next/link";
import { formatPhone } from "@/lib/format-phone";
import { formatPersonName } from "@/lib/format-name";
import { waMeAdresi } from "@/lib/wa-me";
import { TALEP_ADIMLARI, talepAdimi } from "@/lib/talep-asamalari";
import { tekrarsizNot } from "@/lib/talep-notu";
import { findCustomerHistory, type CustomerHistoryResult } from "../../customer-history-query";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../../components/panel-drawer";
import { ProposalBuilderForm } from "../../proposal-builder-form";
import { InternalComments } from "../../internal-comments";
import { TalepPostalari } from "../../talep-postalari";
import "../../../posta/posta.css";
import { RecordHistory } from "../../record-history";
import {
  archiveOpportunity,
  assignOpportunity,
  updateOpportunity,
} from "../../actions";
import { requestStageNames } from "../../request-status";
import { TalepAkis } from "./talep-akis";
import "../../crm.css";
import "../../request-page.css";
import "./talep.css";

/*
  TALEP DETAYI (2026-10): üç sütun.

  Üstte konu, asıl işlem (Teklif oluştur) ve "⋯" menüsü (düzenle,
  temsilci ata, direkt sözleşme, arşivle); altında talebin aşama çizgisi.
  Solda müşteri kartı (tek dokunuşla ara / WhatsApp / e-posta), ortada
  talep bilgileri, kapsam ve notlar, sağda yorumlar · postalar · kayıt
  geçmişi tek akışta.

  Eskiden tek uzun kart vardı: işlem düğmeleri en altta, kayıt geçmişi
  onun da altında; sayfa ~1400px boyundaydı ve en sık kullanılan "Teklif
  oluştur" görünmek için kaydırma istiyordu.
*/

type Details = {
  service_type?: string;
  university?: string;
  department?: string;
  scope?: string;
  /* Talep formunda sorulmuyor; operasyon künye penceresinden giriyor. */
  faculty?: string;
  program?: string;
  advisor?: string;
};
type Opportunity = {
  id: string;
  title: string;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  request_details: Details | null;
  step_template_set: string | null;
  assigned_employee_id: string | null;
  /** Arşivleme sebebi. Yazılıyordu ama hiçbir ekranda görünmüyordu. */
  lost_reason: string | null;
};

const tarih = (deger: string | null) =>
  deger ? new Date(`${deger}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : null;

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getPanelContext();
  const { supabase, membership, modules, izin } = context;
  if (!modules.some((m) => m.code === "crm"))
    throw new Error("CRM modülüne erişiminiz yok.");
  const [{ data, error }, { data: employees, error: employeeError }, { data: turData }] =
    await Promise.all([
      supabase
        .from("crm_opportunities")
        .select(
          "id,title,customer_name,contact_email,contact_phone,stage,expected_close_date,source,notes,request_details,assigned_employee_id,step_template_set,lost_reason",
        )
        .eq("id", id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("hr_employees")
        .select("id,full_name")
        .eq("organization_id", membership.organization_id)
        .eq("employment_status", "active")
        .eq("can_receive_sales_requests", true)
        .order("full_name"),
      supabase
        .from("organization_step_template_sets")
        .select("code,name,is_default")
        .eq("organization_id", membership.organization_id)
        .eq("is_active", true)
        .order("sort_order")
        .order("code"),
    ]);
  if (error || !data) notFound();
  if (employeeError) throw new Error("Satış temsilcileri okunamadı.");
  const item = data as Opportunity;
  const d = item.request_details ?? {};
  const canManage = izin("crm.talep.yonet");
  // Arşivleme ayrı yetenek: kayıt silinmediği için satış personeli de
  // kendi talebini kapatabiliyor (hangisini kapatabileceğini RLS söyler).
  const canArchive = izin("crm.talep.arsivle");
  const postaGorur = izin("posta.gor");
  const calismaTurleri = (turData ?? []) as { code: string; name: string; is_default: boolean }[];
  // Atanmış temsilci pasif veya satışa kapalıysa listede yok; adını ayrıca
  // okuyup seçenek olarak ekliyoruz, yoksa form kaydı atamayı sessizce siliyordu.
  const listedAssignee = (employees ?? []).find(
    (e) => e.id === item.assigned_employee_id,
  );
  const unlistedAssignee =
    item.assigned_employee_id && !listedAssignee
      ? ((
          await supabase
            .from("hr_employees")
            .select("full_name")
            .eq("id", item.assigned_employee_id)
            .eq("organization_id", membership.organization_id)
            .maybeSingle()
        ).data?.full_name ?? "Pasif personel")
      : null;
  const representative = listedAssignee?.full_name ?? unlistedAssignee ?? null;
  const calismaTuru = calismaTurleri.find((tur) => tur.code === item.step_template_set)?.name ?? null;
  const adim = talepAdimi(item.stage);
  const arsivde = item.stage === "lost";
  const musteri = formatPersonName(item.customer_name) || item.customer_name;
  const temsilciler = (employees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }));
  /* Teklif aşamasından sonra asıl işlem talebin bulunduğu yere gitmek. */
  const ileri = adim === 2 ? { href: "/panel/crm/proposals", label: "Tekliflere git" }
    : adim === 3 ? { href: "/panel/crm/contracts", label: "Sözleşmelere git" }
    : adim === 4 ? { href: "/panel/operations/isler", label: "İşlere git" }
    : null;
  const teklifCekmecesi = (etiket: string, sinif: string) => (
    <PanelDrawer triggerLabel={etiket} title="Teklif Oluştur" triggerClassName={sinif}>
      <ProposalBuilderForm
        opportunityId={item.id}
        customerName={item.customer_name}
        title={item.title}
        scope={d.scope || item.notes || item.title}
        representatives={temsilciler}
        needsRepresentative={!item.assigned_employee_id}
      />
    </PanelDrawer>
  );
  /* Notta kapsamın tekrarı varsa çıkar (web sitesi formu ikisini de yazıyor). */
  const not = tekrarsizNot(item.notes, d.scope);

  /*
    Müşterinin bu talep dışındaki kayıtları: aynı telefon (son 10 hane) ya
    da ad soyad. "Müşteri sorgula" penceresiyle aynı sorgu ve yetki
    kuralı (RLS; satış personeli yalnızca görebildiğini görür). Okunamazsa
    sayfa düşmez, bölüm görünmez.
  */
  let gecmis: CustomerHistoryResult | null = null;
  try {
    gecmis = await findCustomerHistory(context, { phone: item.contact_phone, name: item.customer_name, excludeOpportunityId: item.id }, { maxItems: 4 });
  } catch (hata) {
    console.error("[talep] müşteri geçmişi okunamadı", hata);
  }
  const gecmisSayilari = gecmis
    ? ([["talep", gecmis.counts.request], ["teklif", gecmis.counts.proposal], ["sözleşme", gecmis.counts.contract], ["iş", gecmis.counts.job]] as [string, number][]).filter(([, n]) => n > 0)
    : [];

  const edit = (
    <form className="panel-form" action={updateOpportunity}>
      <input type="hidden" name="opportunity_id" value={item.id} />
      <input type="hidden" name="current_details" value={JSON.stringify(d)} />
      <label>
        Talep konusu
        <input name="title" required defaultValue={item.title} />
      </label>
      <label>
        Müşteri / kurum
        <input
          name="customer_name"
          required
          defaultValue={item.customer_name}
        />
      </label>
      <label>
        Hizmet türü
        <input name="service_type" defaultValue={d.service_type || ""} />
      </label>
      {calismaTurleri.length ? (
        /* İş açılırken üretilecek görev listesini bu belirliyor. */
        <label>
          Çalışma türü
          <select name="step_template_set" defaultValue={item.step_template_set ?? ""}>
            <option value="">Öntanımlı</option>
            {calismaTurleri.map((tur) => <option value={tur.code} key={tur.code}>{tur.name}</option>)}
          </select>
        </label>
      ) : null}
      {canManage ? (
        <label>
          Satış temsilcisi
          <select
            name="assigned_employee_id"
            defaultValue={item.assigned_employee_id ?? ""}
          >
            <option value="">Atanmamış</option>
            {unlistedAssignee ? (
              <option value={item.assigned_employee_id ?? ""}>
                {unlistedAssignee} (atamaya kapalı)
              </option>
            ) : null}
            {(employees ?? []).map((e) => (
              <option value={e.id} key={e.id}>
                {e.full_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Telefon
        <input name="contact_phone" defaultValue={item.contact_phone || ""} />
      </label>
      <label>
        E-posta
        <input name="contact_email" defaultValue={item.contact_email || ""} />
      </label>
      <label className="wide">
        Kapsam
        <textarea name="scope" defaultValue={d.scope || ""} />
      </label>
      <div className="wide panel-form-actions">
        <button className="panel-primary">Kaydet</button>
      </div>
    </form>
  );

  /* Bilgi satırı: boş alanlar "Belirtilmedi" yazmaz, satır hiç çizilmez
     (yalnızca hizmet ve teslim boşken bile görünür: satışçının doldurması
     gereken alanlar). */
  const bilgiler: [string, string | null, boolean?][] = [
    ["Hizmet", d.service_type || null, true],
    ["Çalışma türü", calismaTuru],
    ["Teslim", tarih(item.expected_close_date), true],
    ["Üniversite", d.university || null],
    ["Fakülte", d.faculty || null],
    ["Bölüm", d.department || null],
    ["Program", d.program || null],
    ["Danışman", d.advisor || null],
  ];

  return (
    <main className="crm-page-stack crm-request-detail-page talep">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">TLP-{item.id.slice(0, 8).toUpperCase()}</small>
          <h1>{item.title}</h1>
        </div>
        <div className="talep-bas-eylem">
          {/*
            Asıl işlem aşamaya göre: teklif öncesinde "Teklif oluştur",
            sonra talebin bulunduğu yere git. Eskiden sözleşme ya da iş
            aşamasındaki talepte de "Teklif oluştur" yazıyordu.
          */}
          {arsivde ? null : ileri ? (
            <Link className="panel-primary" href={ileri.href}>{ileri.label}</Link>
          ) : teklifCekmecesi("Teklif oluştur", "panel-primary")}
          {/*
            Diğer işlemler menüde. Çekmeceler sayfanın köküne çiziliyor
            (panel-drawer.tsx): menü kapansa da açık kalıyorlar.
          */}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <PanelDrawer triggerLabel="Düzenle" title="Talebi Düzenle" triggerClassName="os-menu-item">
                {edit}
              </PanelDrawer>
              {canManage ? (
                <PanelDrawer
                  triggerLabel="Temsilci ata"
                  title="Satış Temsilcisi Ata"
                  description="Talebi yürütecek temsilciyi seçin."
                  triggerClassName="os-menu-item"
                >
                  <form className="panel-form" action={assignOpportunity}>
                    <input type="hidden" name="opportunity_id" value={item.id} />
                    <label className="wide">
                      Satış temsilcisi
                      <select
                        name="assigned_employee_id"
                        defaultValue={item.assigned_employee_id ?? ""}
                        required
                      >
                        <option value="">Seçiniz</option>
                        {(employees ?? []).map((e) => (
                          <option value={e.id} key={e.id}>
                            {e.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="wide panel-form-actions">
                      <button className="panel-primary">Temsilciyi Kaydet</button>
                    </div>
                  </form>
                </PanelDrawer>
              ) : null}
              {/* Sözleşme ve iş aşamasında yeni teklif yine verilebilir (eski
                  sayfadaki kural: teklif aşaması dışında her zaman). */}
              {ileri && item.stage !== "proposal" ? teklifCekmecesi("Yeni teklif oluştur", "os-menu-item") : null}
              {item.stage !== "proposal" && !arsivde ? (
                <PanelDrawer
                  triggerLabel="Direkt sözleşme oluştur"
                  title="Direkt Sözleşme Oluştur"
                  triggerClassName="os-menu-item"
                >
                  <ProposalBuilderForm
                    opportunityId={item.id}
                    customerName={item.customer_name}
                    title={item.title}
                    scope={d.scope || item.notes || item.title}
                    representatives={temsilciler}
                    needsRepresentative={!item.assigned_employee_id}
                    mode="contract"
                  />
                </PanelDrawer>
              ) : null}
              {canArchive && !arsivde ? (
                /*
                  Kayıt SİLİNMİYOR: aşaması "lost" yapılıp arşive düşüyor
                  (request-status.ts'te adı "Arşivlendi") ve kayıt
                  geçmişiyle birlikte duruyor. Düğme eskiden "Sil" yazıyordu.
                  Sebebi arşivleyen kişi yazıyor; eskiden sabit bir metindi.
                */
                <PanelDrawer
                  triggerLabel="Arşivle"
                  triggerClassName="os-menu-item is-danger"
                  kicker="ARŞİVLE"
                  title={`${item.customer_name} · Talebi arşivle`}
                  description="Kayıt silinmez: aşaması “Arşivlendi” olur, sebebi talebin üstünde ve kayıt geçmişinde kalır."
                >
                  <form className="panel-form" action={archiveOpportunity}>
                    <input type="hidden" name="opportunity_id" value={item.id} />
                    <label className="wide">
                      İptal / arşiv sebebi
                      <textarea
                        name="archive_reason"
                        required
                        minLength={3}
                        maxLength={500}
                        rows={3}
                        placeholder="Örn. Müşteri bütçe nedeniyle vazgeçti."
                      />
                    </label>
                    <div className="panel-form-actions wide">
                      <button className="panel-danger">Talebi arşivle</button>
                    </div>
                  </form>
                </PanelDrawer>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {/* Aşama çizgisi. Arşivlenen talepte çizgi yerine sebep. */}
      {arsivde ? (
        <p className="talep-arsiv">
          <span className="status-pill" data-tone="neutral">{requestStageNames.lost}</span>
          {/*
            Arşiv sebebi yazılıyordu ama hiçbir ekranda görünmüyordu: yazan
            kişi dışında kimse neden kapandığını bilmiyordu.
          */}
          {item.lost_reason ? <span><strong>Sebep:</strong> {item.lost_reason}</span> : null}
        </p>
      ) : (
        <ol className="talep-asama" aria-label={`Aşama: ${requestStageNames[item.stage] ?? item.stage}`}>
          {TALEP_ADIMLARI.map((ad, sira) => (
            <li key={ad} className={adim === null ? undefined : sira < adim ? "is-done" : sira === adim ? "is-current" : undefined} aria-current={sira === adim ? "step" : undefined}>
              <i aria-hidden="true" />
              <span>{ad}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="talep-izgara">
        {/* Müşteri */}
        <section className="panel-card talep-musteri" aria-label="Müşteri">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr")).join("")}</span>
            <div>
              <h2>{musteri}</h2>
              <small>Müşteri</small>
            </div>
          </div>
          <div className="talep-iletisim">
            {item.contact_phone ? <a className="panel-secondary" href={`tel:${item.contact_phone}`}>Ara</a> : null}
            {item.contact_phone ? (
              <a className="panel-secondary" href={waMeAdresi(item.contact_phone, `Merhaba ${musteri},`)} target="_blank" rel="noreferrer">WhatsApp</a>
            ) : null}
            {item.contact_email ? <a className="panel-secondary" href={`mailto:${item.contact_email}`}>E-posta</a> : null}
          </div>
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(item.contact_phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{item.contact_email || <em>Yok</em>}</dd></div>
            <div><dt>Satış temsilcisi</dt><dd>{representative ? formatPersonName(representative) : <em>Atanmamış</em>}</dd></div>
            <div><dt>Kaynak</dt><dd>{item.source || <em>Belirtilmedi</em>}</dd></div>
          </dl>
          {/* Müşterinin diğer kayıtları: sol sütun kısa kalıyordu, bu bilgi
              yalnızca "Müşteri sorgula" penceresindeydi. */}
          <div className="talep-gecmis">
            <h3>Müşterinin diğer kayıtları</h3>
            {gecmis && gecmis.total ? (
              <>
                <p className="talep-gecmis-ozet">
                  {gecmisSayilari.map(([ad, n]) => `${n} ${ad}`).join(" · ")}
                  {gecmis.contractedLabel ? <span> · sözleşme {gecmis.contractedLabel}</span> : null}
                </p>
                <ul>
                  {gecmis.items.map((kayit) => {
                    const icerik = (
                      <>
                        <span className="talep-gecmis-metin">
                          <b>{kayit.title}</b>
                          <small>{kayit.kindLabel}{kayit.amountLabel ? ` · ${kayit.amountLabel}` : ""} · {kayit.dateLabel}</small>
                        </span>
                        <span className="status-pill" data-tone={kayit.tone}>{kayit.statusLabel}</span>
                      </>
                    );
                    return (
                      <li key={kayit.key}>
                        {kayit.canOpen ? <Link href={kayit.href}>{icerik}</Link> : <div>{icerik}</div>}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="talep-bos">Bu müşterinin başka kaydı yok; ilk talebi.</p>
            )}
          </div>
        </section>

        {/* Talep */}
        <section className="panel-card talep-bilgi" aria-label="Talep bilgileri">
          <h2>Talep bilgileri</h2>
          <dl className="talep-liste talep-liste--iki">
            {bilgiler.filter(([, deger, hep]) => deger || hep).map(([ad, deger]) => (
              <div key={ad}><dt>{ad}</dt><dd>{deger || <em>Belirtilmedi</em>}</dd></div>
            ))}
          </dl>
          <div className="talep-not">
            <h3>Kapsam</h3>
            {d.scope ? <p>{d.scope}</p> : <p className="talep-bos">Kapsam yazılmamış. “⋯ → Düzenle” ile eklenir.</p>}
          </div>
          {not ? (
            <div className="talep-not">
              <h3>Notlar</h3>
              <p>{not}</p>
            </div>
          ) : null}
        </section>

        {/* Akış */}
        <TalepAkis sekmeler={postaGorur ? ["Yorumlar", "Postalar", "Geçmiş"] : ["Yorumlar", "Geçmiş"]}>
          <InternalComments opportunityId={item.id} contextType="request" contextId={item.id} gorunum="akis" />
          {postaGorur ? <TalepPostalari opportunityId={item.id} musteriAdresi={item.contact_email} konu={item.title} /> : null}
          <RecordHistory opportunityId={item.id} />
        </TalepAkis>
      </div>
    </main>
  );
}
