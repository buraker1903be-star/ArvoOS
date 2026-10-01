import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { OpsIcon } from "../ops-shared";
import { copyDefaultBriefFields, saveBriefFields } from "../brifing-actions";
import { BRIEF_EN_COK, BRIEF_FIELD_TYPES, BRIEF_TYPE_LABELS, VARSAYILAN_BRIEF_ALANLARI, type BriefField } from "@/lib/is-brifingi";
import "../../crm/crm.css";
import "../operations.css";
import "./brifing.css";

/*
  İŞ BRİFİNGİNİN FORMU.

  Satıştan operasyona geçen bilgi bugüne kadar fırsatın serbest metin
  `notes` alanındaydı: aranamıyor, raporlanamıyor, eksik bırakıldığı
  görülmüyordu. Brifing bunu yapılandırıyor.

  Sorular KURUMUN. ArvoOS çok kiracılı bir ürün; "danışman onayı" ya da
  "benzerlik raporu eşiği" gibi alanları şemaya gömmek paneli tek bir
  sektörün yazılımına çevirirdi. Ön ayar bu yüzden sektörsüz.

  Bu sayfa yalnızca SORULARI yönetir. Yanıtlar iki yerde doldurulur:
  satışçı fırsat sayfasında, operasyon iş detayında.
*/

const BOS_SATIR = 2;

export default async function BriefFieldsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const canManage = ["owner", "admin"].includes(membership.role);

  const [{ data, error }, { data: turData }] = await Promise.all([
    supabase
      .from("organization_brief_fields")
      .select("code,label,field_type,options,hint,is_required,set_codes,sort_order,is_active")
      .eq("organization_id", membership.organization_id)
      .order("sort_order"),
    supabase
      .from("organization_step_template_sets")
      .select("code,name")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (error) throw new Error("Brifing formu okunamadı: " + error.message);

  const alanlar = (data ?? []) as BriefField[];
  const turler = (turData ?? []) as { code: string; name: string }[];
  const bosSayisi = canManage ? Math.max(0, Math.min(BOS_SATIR, BRIEF_EN_COK - alanlar.length)) : 0;

  const satir = (alan: BriefField | null, anahtar: string) => (
    <div className="brifing-grup" key={anahtar}>
      <div className="brifing-satir">
        <input type="hidden" name="code" value={alan?.code ?? ""} />
        <input name="label" defaultValue={alan?.label ?? ""} maxLength={120} placeholder="Yeni soru" disabled={!canManage} aria-label="Soru başlığı" />
        <select name="field_type" defaultValue={alan?.field_type ?? "text"} disabled={!canManage} aria-label="Yanıt tipi">
          {BRIEF_FIELD_TYPES.map((tip) => <option value={tip} key={tip}>{BRIEF_TYPE_LABELS[tip]}</option>)}
        </select>
        {/* Seçenekler satır satır: virgül, şıkkın kendi metninde geçebiliyor. */}
        <textarea name="options" defaultValue={(alan?.options ?? []).join("\n")} rows={2} placeholder="Seçenekler (her satıra bir tane)" disabled={!canManage} aria-label="Seçenekler" />
        <label className="brifing-zorunlu">
          <input type="checkbox" name="is_required" value="1" defaultChecked={alan?.is_required ?? false} disabled={!canManage} />
          Zorunlu
        </label>
      </div>
      <div className="brifing-satir">
        <input name="hint" defaultValue={alan?.hint ?? ""} maxLength={200} placeholder="Açıklama (isteğe bağlı)" disabled={!canManage} aria-label="Soru açıklaması" />
        {/*
          Hangi çalışma türlerinde sorulsun: boş = hepsinde. Her türe ayrı
          form tanımlatmak aynı soruyu dört kez yazdırırdı.
        */}
        <input
          name="set_codes"
          defaultValue={(alan?.set_codes ?? []).join(",")}
          placeholder={turler.length ? "Türler (boş: hepsi)" : "—"}
          list="brifing-turleri"
          disabled={!canManage || !turler.length}
          aria-label="Hangi çalışma türlerinde sorulsun"
        />
      </div>
    </div>
  );

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">OPERASYON / BRİFİNG FORMU</small>
          <h1>Brifing Formu</h1>
          <p>Satıştan operasyona geçen bilgi. Satışçı fırsat sayfasında doldurur, iş açılırken işe kopyalanır.</p>
        </div>
        <div className="panel-page-actions"><span className="status-pill">{alanlar.length} soru</span></div>
      </div>
      <OperationsTabs active="brifing" />
      <div className="module-tab-panel">

      {alanlar.length === 0 ? (
        <section className="panel-card brifing-bos">
          <div>
            <h2><OpsIcon name="progress" /> Brifing formunuz tanımlı değil</h2>
            <p>
              Form tanımlanmadan fırsat ve iş sayfalarında brifing bölümü görünmez. Kendi sorularınızı
              yazabilir ya da ön ayarı kopyalayıp düzenleyebilirsiniz:{" "}
              {VARSAYILAN_BRIEF_ALANLARI.map((alan) => alan.label).join(" · ")}.
            </p>
          </div>
          {canManage ? (
            <form action={copyDefaultBriefFields}>
              <button className="panel-secondary" type="submit">Ön ayarı kopyala ve düzenle</button>
            </form>
          ) : <p className="brifing-hint">Formu kurum sahibi ve yöneticiler düzenler.</p>}
        </section>
      ) : null}

      <section className="panel-card">
        <header className="sablon-card-head">
          <div>
            <h2>Sorular</h2>
            <p>
              “Tek seçim” ve “çok seçim” dışındaki tiplerde seçenek alanı boş kalır. Soruyu yalnızca belirli
              çalışma türlerinde sormak için tür kodlarını virgülle yazın; boş bırakılan soru her türde sorulur.
              En fazla {BRIEF_EN_COK} soru.
            </p>
          </div>
        </header>

        <datalist id="brifing-turleri">
          {turler.map((tur) => <option key={tur.code} value={tur.code}>{tur.name}</option>)}
        </datalist>

        <form action={saveBriefFields} className="brifing-form">
          <div className="brifing-basliklar" aria-hidden="true"><span>Soru</span><span>Tip</span><span>Seçenekler</span><span /></div>
          {alanlar.map((alan) => satir(alan, alan.code))}
          {Array.from({ length: bosSayisi }, (_, index) => satir(null, `bos-${index}`))}
          {canManage ? (
            <div className="brifing-actions">
              <button className="panel-primary" type="submit">Formu kaydet</button>
              <span className="brifing-hint">Başlığını sildiğiniz soru kaydedince formdan çıkar; verilmiş yanıtlar silinmez.</span>
            </div>
          ) : null}
        </form>
      </section>
      </div>
    </div>
  );
}
