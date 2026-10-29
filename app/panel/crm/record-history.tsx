import { getPanelContext } from "@/lib/panel-context";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { kisiAdlari } from "@/lib/kisi-adlari";
import type { FieldChange } from "@/lib/activity-log";
import { eylemEtiketi, varlikEtiketi } from "@/lib/kayit-etiketleri";

/**
 * Kayıt geçmişi — kim, ne zaman, neyi neyden neye değiştirdi.
 *
 * Talep, teklif ve sözleşme aynı zincirin parçası olduğu için üçünün
 * geçmişi tek listede birleşiyor: bir sözleşme detayında "bu talep
 * hangi tutarla açılmıştı" sorusunun cevabı da burada.
 */

/**
 * Tutar alanları veritabanında kuruş cinsinden tutuluyor.
 * Geçmişte ham haliyle "3600000 → 4200000" yazıyordu; okunmuyor.
 * Gösterimde para birimine çeviriyoruz.
 */
const MONEY_FIELDS = new Set(["amount", "net_amount", "tax_amount", "gross_amount"]);

function displayValue(field: string, value: string): string {
  if (!value) return "boş";
  if (!MONEY_FIELDS.has(field)) return value;
  const kurus = Number(value);
  if (!Number.isFinite(kurus)) return value;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(kurus / 100);
}

/*
  ETİKETLER ORTAK MODÜLDE (lib/kayit-etiketleri). Burada ve konsolun
  müşteri dosyasında iki ayrı liste vardı ve saptılar: operasyonun
  yazdığı sekiz kod yalnızca buraya eklenmişti, konsol aynı olayı HAM
  KODLA gösteriyordu ("step_assign"). İki ekranın dili farklı olduğu
  için etiketler iki kayıtlı; kümeleri aynı.
*/
type LogRow = {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: { changes?: FieldChange[]; note?: string | null; step_title?: string | null } | null;
};

export async function RecordHistory({
  opportunityId,
  workflowId,
  baslik = true,
}: {
  opportunityId?: string;
  /** İş akışı detayında: sözleşmeye bağlı olmayan işler için. */
  workflowId?: string;
  /*
    Kendi başlığını basmasın. Operasyon iş detayında bu liste
    "Kayıt geçmişi" penceresinin içinde duruyor ve pencerenin başlığı
    aynı iki kelimeyi zaten yazıyordu; bölümün adını çağıran veriyor.
    CRM sayfalarında başlık yerinde kalıyor.
  */
  baslik?: boolean;
}) {
  const { supabase, membership } = await getPanelContext();

  const entityTypes = workflowId && !opportunityId
    ? ["operation_workflow"]
    : ["crm_opportunity", "crm_proposal", "crm_contract", "operation_workflow"];

  // CRM olayları metadata.opportunity_id ile, iş akışı olayları entity_id
  // ile işaretleniyor. İş akışı bir sözleşmeye bağlıysa ikisini birden
  // çekiyoruz: talebin açılışından işin bitişine kadar tek liste.
  // Bu yüzden .contains değil .or kullanmak gerekiyor — .contains yalnızca
  // tek bir eşleşme yapabildiği için iş akışı olayları listeden düşüyordu.
  let query = supabase
    .from("activity_logs")
    .select("id,actor_user_id,action,entity_type,created_at,metadata")
    .eq("organization_id", membership.organization_id)
    .in("entity_type", entityTypes);

  if (opportunityId && workflowId) {
    query = query.or(
      `metadata->>opportunity_id.eq.${opportunityId},entity_id.eq.${workflowId}`,
    );
  } else if (opportunityId) {
    query = query.eq("metadata->>opportunity_id", opportunityId);
  } else if (workflowId) {
    query = query.eq("entity_id", workflowId);
  } else {
    return null;
  }

  const { data: rows, error: okumaHatasi } = await query
    .order("created_at", { ascending: false })
    .limit(60);

  /*
    OKUNAMADI, "DEĞİŞİKLİK YOK" DEĞİL. Hata düşürülünce rows null
    geliyor ve aşağıdaki boş durum basılıyordu: denetim listesi, kendi
    sorgusu RLS'e takıldığında bile "bu kayıtta hiç değişiklik
    yapılmadı" diyordu. Bir denetim izinin verebileceği en kötü cevap bu.
  */
  if (okumaHatasi) {
    console.error("[kayit-gecmisi] olaylar okunamadı", {
      organizationId: membership.organization_id,
      opportunityId,
      workflowId,
      hata: okumaHatasi.message,
    });
    return (
      <section className="panel-card crm-record-history">
        {baslik ? (
          <header>
            <small className="panel-kicker">KAYIT GEÇMİŞİ</small>
            <h2>Geçmiş okunamadı</h2>
          </header>
        ) : null}
        <p className="panel-empty">
          Kayıt geçmişi şu anda okunamıyor. Sayfayı yenileyin; sürerse
          destek kaydı açın. Liste boş görünse de geçmiş silinmedi.
        </p>
      </section>
    );
  }

  const logs = (rows ?? []) as LogRow[];
  if (!logs.length) {
    return (
      <section className="panel-card crm-record-history">
        {baslik ? (
          <header>
            <small className="panel-kicker">KAYIT GEÇMİŞİ</small>
            <h2>Değişiklik yok</h2>
          </header>
        ) : null}
        <p className="panel-empty">
          Bu kayıtta henüz bir değişiklik yapılmadı. Düzenleme yaptığınızda kim
          neyi değiştirdi burada görünecek.
        </p>
      </section>
    );
  }

  /* Adın iki kaynağı ve sırası lib/kisi-adlari.ts'te; aynı kural
     operasyonun iş detayında ve arşivinde de geçerli. */
  const names = await kisiAdlari(supabase, membership.organization_id, logs.map((l) => l.actor_user_id));
  const actorName = (id: string | null) => (id && names.get(id)) || "Bilinmeyen kullanıcı";

  return (
    <section className="panel-card crm-record-history">
      {baslik ? (
        <header>
          <small className="panel-kicker">KAYIT GEÇMİŞİ</small>
          <h2>{logs.length} değişiklik</h2>
        </header>
      ) : null}
      <ol>
        {logs.map((log) => {
          const changes = log.metadata?.changes ?? [];
          return (
            <li key={log.id}>
              <div className="crm-record-history-meta">
                <strong>{actorName(log.actor_user_id)}</strong>
                <span>
                  {varlikEtiketi(log.entity_type)} kaydını{" "}
                  {eylemEtiketi(log.action, "kisi")}
                  {/* Hangi aşama: "bir aşamanın tarihini değiştirdi" tek başına
                      dokuz parçalı bir işte hangi bölüm olduğunu söylemiyor. */}
                  {log.metadata?.step_title ? <b className="crm-record-history-step"> · {log.metadata.step_title}</b> : null}
                </span>
                <time dateTime={log.created_at}>
                  {istanbulDateTime(log.created_at, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
              {log.metadata?.note ? <p>{log.metadata.note}</p> : null}
              {changes.length ? (
                <ul className="crm-record-history-changes">
                  {changes.map((change) => (
                    <li key={change.field}>
                      <b>{change.label}</b>
                      <span className="from">{displayValue(change.field, change.from)}</span>
                      <span aria-hidden="true">→</span>
                      <span className="to">{displayValue(change.field, change.to)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
