import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { OpsIcon } from "../ops-shared";
import {
  clearStepTemplate,
  copyDefaultStepTemplate,
  createTemplateSet,
  deleteTemplateSet,
  makeDefaultTemplateSet,
  renameTemplateSet,
  saveStepTemplate,
} from "../sablon-actions";
import { ASAMA_EN_UZUN, OFSET_EN_COK, SABLON_EN_COK, SET_EN_COK, VARSAYILAN_ADIMLAR } from "@/lib/is-adimlari";
import "../../crm/crm.css";
import "../operations.css";
import "./sablon.css";

/*
  Kurumun iş adımı şablonu.

  Yeni açılan işin adımları üç kaynaktan İLK DOLU OLANDAN gelir:
   1. Sözleşmenin ara teslim takvimi (work_plan) — müşteriye tarihleriyle
      satılan plan; varsa başka bir liste üretilmez.
   2. Bu şablon — işin ÇALIŞMA TÜRÜNE ait liste.
   3. Varsayılan sekiz adım.

  ÇALIŞMA TÜRÜ (organization_step_template_sets): kuruma tek liste
  düşüyordu, tezin yirmi maddesi makale işine de iniyordu. Artık her türün
  kendi listesi var; iş açılırken tür seçiliyor, seçilmezse öntanımlı tür
  kullanılıyor.

  Bu sayfa yalnızca 2. sırayı yönetir ve YALNIZCA YENİ işleri etkiler:
  açık bir işin adımları altından değişmez.
*/

type SablonSatiri = { code: string; title: string; sort_order: number; day_offset: number | null; phase_title: string | null };
type Tur = { code: string; name: string; sort_order: number; is_default: boolean };

// Kullanıcı satır ekleyebilsin diye listenin sonuna birkaç boş satır konur.
const BOS_SATIR = 3;

export default async function StepTemplatePage({ searchParams }: { searchParams: Promise<{ tur?: string }> }) {
  const { tur: istenenTur } = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const canManage = izin("operations.sablon.yonet");

  const { data: turData, error: turHatasi } = await supabase
    .from("organization_step_template_sets")
    .select("code,name,sort_order,is_default")
    .eq("organization_id", membership.organization_id)
    .order("sort_order")
    .order("code");
  if (turHatasi) throw new Error("Çalışma türleri okunamadı: " + turHatasi.message);
  const turler = (turData ?? []) as Tur[];

  /*
    Seçili tür adresten geliyor; adreste yoksa öntanımlı, o da yoksa ilk
    tür. Henüz hiç tür yoksa sayfa yalnızca "tür ekleyin" diyor — görev
    listesi bir türe ait olmak zorunda.
  */
  const seciliTur =
    turler.find((t) => t.code === istenenTur) ?? turler.find((t) => t.is_default) ?? turler[0] ?? null;

  const { data, error } = seciliTur
    ? await supabase
        .from("organization_step_templates")
        .select("code,title,sort_order,day_offset,phase_title")
        .eq("organization_id", membership.organization_id)
        .eq("set_code", seciliTur.code)
        .order("sort_order")
    : { data: [], error: null };
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
        <div className="panel-page-actions">
          <span className="status-pill">{turler.length} çalışma türü</span>
          {seciliTur ? <span className="status-pill">{satirlar.length} görev</span> : null}
        </div>
      </div>
      <OperationsTabs active="sablon" />
      <div className="module-tab-panel">

      <section className="panel-card sablon-turler">
        <header className="sablon-card-head">
          <div>
            <h2>Çalışma türleri</h2>
            <p>
              Tez, makale ve ödev aynı görev listesiyle yürümüyor. Her türün kendi listesi var; iş açılırken tür
              seçiliyor. Türü seçilmeden açılan iş (örneğin kazanılan bir CRM fırsatı) öntanımlı türü kullanır.
              En fazla {SET_EN_COK} tür.
            </p>
          </div>
        </header>

        {turler.length ? (
          <nav className="sablon-tur-seritleri" aria-label="Çalışma türleri">
            {turler.map((t) => (
              <Link
                key={t.code}
                href={`/panel/operations/sablon?tur=${encodeURIComponent(t.code)}`}
                className={`sablon-tur${t.code === seciliTur?.code ? " is-active" : ""}`}
                aria-current={t.code === seciliTur?.code ? "page" : undefined}
              >
                {t.name}
                {t.is_default ? <small>öntanımlı</small> : null}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="sablon-hint">
            Henüz çalışma türü yok; işler varsayılan sekiz adımla açılıyor. İlk türü ekleyince kendi listenizi
            yazabilirsiniz.
          </p>
        )}

        {canManage ? (
          <div className="sablon-tur-islemleri">
            {turler.length < SET_EN_COK ? (
              <form action={createTemplateSet} className="sablon-tur-ekle">
                <input name="name" required minLength={2} maxLength={80} placeholder="Yeni tür (örn. Makale)" aria-label="Yeni çalışma türünün adı" />
                <button className="panel-secondary" type="submit">Tür ekle</button>
              </form>
            ) : null}
            {seciliTur ? (
              <>
                <form action={renameTemplateSet} className="sablon-tur-ekle">
                  <input type="hidden" name="set_code" value={seciliTur.code} />
                  <input name="name" defaultValue={seciliTur.name} required minLength={2} maxLength={80} aria-label="Türün adı" />
                  <button className="panel-ghost" type="submit">Adı kaydet</button>
                </form>
                {seciliTur.is_default ? null : (
                  <form action={makeDefaultTemplateSet}>
                    <input type="hidden" name="set_code" value={seciliTur.code} />
                    <button className="panel-ghost" type="submit">Öntanımlı yap</button>
                  </form>
                )}
                {seciliTur.is_default ? null : (
                  <form action={deleteTemplateSet}>
                    <input type="hidden" name="set_code" value={seciliTur.code} />
                    <button className="panel-ghost" type="submit">Türü sil</button>
                  </form>
                )}
              </>
            ) : null}
          </div>
        ) : <p className="sablon-hint">Türleri ve listeleri kurum sahibi ve yöneticiler düzenler.</p>}
      </section>

      {seciliTur && satirlar.length === 0 ? (
        <section className="panel-card sablon-bos">
          <div>
            <h2><OpsIcon name="progress" /> “{seciliTur.name}” listesi boş</h2>
            <p>
              Bu türle açılan işler şu an varsayılan sekiz adımla başlıyor: {VARSAYILAN_ADIMLAR.map((adim) => adim.title).join(" · ")}.
              Kendi listenizi sıfırdan yazabilir ya da varsayılanı kopyalayıp düzenleyebilirsiniz.
            </p>
          </div>
          {canManage ? (
            <form action={copyDefaultStepTemplate}>
              <input type="hidden" name="set_code" value={seciliTur.code} />
              <button className="panel-secondary" type="submit">Varsayılanı kopyala ve düzenle</button>
            </form>
          ) : <p className="sablon-hint">Şablonu kurum sahibi ve yöneticiler düzenler.</p>}
        </section>
      ) : null}

      {seciliTur ? (
      <section className="panel-card">
        <header className="sablon-card-head">
          <div>
            <h2>{seciliTur.name} · görevler</h2>
            <p>
              “Aşama” ardışık görevleri tek başlık altında toplar (“1 · Hazırlık”); aynı adı grubun her
              satırına yazın, boş bırakılan görev gruplanmadan listelenir. “Gün” alanı işin başlangıç
              tarihine eklenir; boş bırakılan görev tarihsiz açılır (örneğin müşteri isterse yapılacak
              sunum). En fazla {SABLON_EN_COK} görev, 0–{OFSET_EN_COK} gün.
            </p>
          </div>
        </header>

        <form action={saveStepTemplate} className="sablon-form">
          <input type="hidden" name="set_code" value={seciliTur.code} />
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
              <button className="panel-primary" type="submit">Listeyi kaydet</button>
              <span className="sablon-hint">Görev adını sildiğiniz satır kaydedince listeden çıkar.</span>
            </div>
          ) : null}
        </form>

        {canManage && satirlar.length > 0 ? (
          <form action={clearStepTemplate} className="sablon-clear">
            <input type="hidden" name="set_code" value={seciliTur.code} />
            <button className="panel-ghost" type="submit">Listeyi boşalt, varsayılana dön</button>
          </form>
        ) : null}
      </section>
      ) : null}
      </div>
    </div>
  );
}
