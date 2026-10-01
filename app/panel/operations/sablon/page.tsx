import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { OpsIcon } from "../ops-shared";
import { clearStepTemplate, copyDefaultStepTemplate, saveStepTemplate } from "../sablon-actions";
import { ASAMA_EN_UZUN, OFSET_EN_COK, SABLON_EN_COK, VARSAYILAN_ADIMLAR } from "@/lib/is-adimlari";
import "../../crm/crm.css";
import "../operations.css";
import "./sablon.css";

/*
  Kurumun iş adımı şablonu.

  Yeni açılan işin adımları üç kaynaktan İLK DOLU OLANDAN gelir:
   1. Sözleşmenin ara teslim takvimi (work_plan) — müşteriye tarihleriyle
      satılan plan; varsa başka bir liste üretilmez.
   2. Bu şablon.
   3. Varsayılan sekiz adım.

  Bu sayfa yalnızca 2. sırayı yönetir ve YALNIZCA YENİ işleri etkiler:
  açık bir işin adımları altından değişmez.
*/

type SablonSatiri = { code: string; title: string; sort_order: number; day_offset: number | null; phase_title: string | null };

// Kullanıcı satır ekleyebilsin diye listenin sonuna birkaç boş satır konur.
const BOS_SATIR = 3;

export default async function StepTemplatePage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const canManage = ["owner", "admin"].includes(membership.role);

  const { data, error } = await supabase
    .from("organization_step_templates")
    .select("code,title,sort_order,day_offset,phase_title")
    .eq("organization_id", membership.organization_id)
    .order("sort_order");
  if (error) throw new Error("Adım şablonu okunamadı: " + error.message);

  const satirlar = (data ?? []) as SablonSatiri[];
  /*
    Aynı aşama adı grubun her satırına yazılıyor (veritabanında aşama,
    satırın kendi alanı). Yirmi satırlık bir listede bunu elle yazmak
    yorucu; daha önce kullanılmış adlar öneri listesine düşüyor.
  */
  const kullanilanAsamalar = [...new Set(satirlar.map((satir) => satir.phase_title?.trim()).filter(Boolean))] as string[];
  const bosSayisi = canManage ? Math.max(0, Math.min(BOS_SATIR, SABLON_EN_COK - satirlar.length)) : 0;

  // Kabuk kardeş operasyon sayfalarıyla birebir aynı (takvim, pano, arşiv).
  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">OPERASYON / ADIM ŞABLONU</small>
          <h1>Adım Şablonu</h1>
          <p>Yeni açılan işlerin görev listesi. Sözleşmesinde ara teslim takvimi olan iş, adımlarını o takvimden alır.</p>
        </div>
        <div className="panel-page-actions"><span className="status-pill">{satirlar.length} adım</span></div>
      </div>
      <OperationsTabs active="sablon" />
      <div className="module-tab-panel">

      {satirlar.length === 0 ? (
        <section className="panel-card sablon-bos">
          <div>
            <h2><OpsIcon name="progress" /> Şablonunuz tanımlı değil</h2>
            <p>
              İşler şu an varsayılan sekiz adımla açılıyor: {VARSAYILAN_ADIMLAR.map((adim) => adim.title).join(" · ")}.
              Kendi listenizi sıfırdan yazabilir ya da varsayılanı kopyalayıp düzenleyebilirsiniz.
            </p>
          </div>
          {canManage ? (
            <form action={copyDefaultStepTemplate}>
              <button className="panel-secondary" type="submit">Varsayılanı kopyala ve düzenle</button>
            </form>
          ) : <p className="sablon-hint">Şablonu kurum sahibi ve yöneticiler düzenler.</p>}
        </section>
      ) : null}

      <section className="panel-card">
        <header className="sablon-card-head">
          <div>
            <h2>Adımlar</h2>
            <p>
              “Aşama” ardışık görevleri tek başlık altında toplar (“1 · Hazırlık”); aynı adı grubun her
              satırına yazın, boş bırakılan görev gruplanmadan listelenir. “Gün” alanı işin başlangıç
              tarihine eklenir; boş bırakılan görev tarihsiz açılır (örneğin müşteri isterse yapılacak
              sunum). En fazla {SABLON_EN_COK} görev, 0–{OFSET_EN_COK} gün.
            </p>
          </div>
        </header>

        <form action={saveStepTemplate} className="sablon-form">
          <datalist id="sablon-asamalari">
            {kullanilanAsamalar.map((ad) => <option key={ad} value={ad} />)}
          </datalist>
          <div className="sablon-basliklar" aria-hidden="true"><span>Aşama</span><span>Görev</span><span>Gün</span></div>
          {satirlar.map((satir) => (
            <div className="sablon-satir" key={satir.code}>
              <input type="hidden" name="code" value={satir.code} />
              <input name="phase_title" defaultValue={satir.phase_title ?? ""} maxLength={ASAMA_EN_UZUN} list="sablon-asamalari" disabled={!canManage} placeholder="—" aria-label="Aşama adı" />
              <input name="title" defaultValue={satir.title} maxLength={180} disabled={!canManage} aria-label="Görev adı" />
              <input name="day_offset" type="number" min={0} max={OFSET_EN_COK} step={1} defaultValue={satir.day_offset ?? ""} disabled={!canManage} aria-label="Başlangıçtan kaç gün sonra" />
            </div>
          ))}
          {Array.from({ length: bosSayisi }, (_, index) => (
            <div className="sablon-satir" key={`bos-${index}`}>
              {/* Kodu boş: sunucu başlıktan türetir (kodTuret). */}
              <input type="hidden" name="code" value="" />
              <input name="phase_title" defaultValue="" maxLength={ASAMA_EN_UZUN} list="sablon-asamalari" placeholder="—" aria-label="Yeni görevin aşaması" />
              <input name="title" defaultValue="" maxLength={180} placeholder="Yeni görev" aria-label="Yeni görev adı" />
              <input name="day_offset" type="number" min={0} max={OFSET_EN_COK} step={1} defaultValue="" placeholder="—" aria-label="Yeni görev için gün" />
            </div>
          ))}

          {canManage ? (
            <div className="sablon-actions">
              <button className="panel-primary" type="submit">Şablonu kaydet</button>
              <span className="sablon-hint">Görev adını sildiğiniz satır kaydedince şablondan çıkar.</span>
            </div>
          ) : null}
        </form>

        {canManage && satirlar.length > 0 ? (
          <form action={clearStepTemplate} className="sablon-clear">
            <button className="panel-ghost" type="submit">Şablonu kaldır, varsayılana dön</button>
          </form>
        ) : null}
      </section>
      </div>
    </div>
  );
}
