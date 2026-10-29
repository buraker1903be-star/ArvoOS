"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { useState } from "react";
import { liraYazisi, parseTurkishAmount } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";
import "../components/kayit-formu.css";
import "./prim-odeme-formu.css";

/*
  PRİM ÖDEMESİ FORMU — yeni kayıt ve düzenleme (12.10.2026).

  Ödeme girilirken hangi işlerin primine karşılık olduğu seçiliyor
  (lib/prim-is-dagilimi). Eskiden bu açıklama alanına elle yazılıyordu.
  İşaretlenen işin tutarı açık primiyle dolar, değiştirilebilir; ödeme
  tutarı seçilenlerin toplamıyla kendiliğinden dolar ama elle büyütülebilir
  (fark "işe bağlanmamış" kalır). Hiç iş seçmeden de kaydedilebilir.

  Erken ödeme: iş bitmeden de seçilebiliyor ("iş sürüyor", tahmini
  "hak edilecek" primle); ödenen tutar o işte avans olarak durur.

  Kural sunucuda da aynı (dagitimDenetle); buradaki denetim yalnızca
  kaydetmeden önce söylemek için.
*/

/** acik: hak edilip ödenmemiş (negatifse avans); beklenen: henüz hak edilmemiş tahmini prim. */
export type FormIsi = { contractId: string; reference: string; customer: string; acik: number; beklenen: number; devam: boolean };
/* İşaretlenince önerilen tutar: hak edilmiş açık prim varsa o; yoksa
   (erken ödeme) henüz hak edilmemiş kalan — avans düşülerek. */
const onerilen = (is: FormIsi) => (is.acik > 0 ? is.acik : Math.max(0, is.acik + is.beklenen));
export type FormOdemesi = { id: string; amount: number; paidOn: string; method: string; note: string | null };

const para = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const kurusa = (yazi: string) => { const lira = parseTurkishAmount(yazi); return Number.isFinite(lira) ? Math.round(lira * 100) : NaN; };
const req = <b className="req" aria-hidden="true">*</b>;

export function PrimOdemeFormu({ eylem, personelId, odeme, isler, mevcut = {}, dagitimAcik, oneri }: {
  eylem: (formData: FormData) => Promise<void>;
  personelId: string;
  odeme?: FormOdemesi;
  /** Seçilebilecek işler; düzenlemede açık prim bu ödemenin payı geri eklenmiş hâlde. */
  isler: FormIsi[];
  /** Düzenlemede ödemenin var olan dağılımı (kuruş). */
  mevcut?: Record<string, number>;
  dagitimAcik: boolean;
  oneri?: string;
}) {
  const [secili, setSecili] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(mevcut).map(([k, v]) => [k, liraYazisi(v)])));
  const [tutarYazisi, setTutarYazisi] = useState(odeme ? liraYazisi(odeme.amount) : "");
  // Tutar elle yazılana kadar seçilenlerin toplamını izler (düzenlemede baştan elle sayılır).
  const [tutarElle, setTutarElle] = useState(Boolean(odeme));

  const kalemler = Object.entries(secili).map(([contractId, yazi]) => ({ contractId, amount: kurusa(yazi) }));
  const dagitilan = kalemler.reduce((t, k) => t + (Number.isFinite(k.amount) ? k.amount : 0), 0);
  const gosterilenTutar = tutarElle ? tutarYazisi : dagitilan ? liraYazisi(dagitilan) : tutarYazisi;
  const tutar = kurusa(gosterilenTutar);
  const bozukKalem = kalemler.some((k) => !Number.isFinite(k.amount) || k.amount <= 0);
  const hata = !dagitimAcik ? null
    : bozukKalem ? "Seçilen her işe sıfırdan büyük bir tutar yazın."
    : Number.isFinite(tutar) && dagitilan > tutar ? `İşlere dağıtılan (${para(dagitilan)}) ödemeden büyük olamaz.`
    : null;

  const sec = (is: FormIsi, acik: boolean) => setSecili((onceki) => {
    const yeni = { ...onceki };
    if (acik) yeni[is.contractId] = onerilen(is) > 0 ? liraYazisi(onerilen(is)) : "";
    else delete yeni[is.contractId];
    return yeni;
  });

  return (
    <form className="panel-form fin-form kayit-formu" action={eylem}>
      {odeme ? <input type="hidden" name="id" value={odeme.id} /> : <input type="hidden" name="employee_id" value={personelId} />}
      {dagitimAcik ? <>
        <input type="hidden" name="dagitim_acik" value="1" />
        <input type="hidden" name="dagitim" value={JSON.stringify(kalemler.filter((k) => Number.isFinite(k.amount)).map((k) => ({ contract_id: k.contractId, amount: k.amount })))} />
      </> : null}

      {dagitimAcik ? <>
        <p className="wide kayit-formu-bolum">Hangi işlere istinaden</p>
        {isler.length ? (
          <ul className="wide prim-isler">
            {isler.map((is) => {
              const isaretli = is.contractId in secili;
              return (
                <li key={is.contractId} className={isaretli ? "is-secili" : undefined}>
                  <label className="prim-is-sec">
                    <input type="checkbox" checked={isaretli} onChange={(o) => sec(is, o.target.checked)} />
                    <span>
                      <b>{is.reference}{is.devam ? <em className="prim-is-devam">iş sürüyor</em> : null}</b>
                      <small>{is.customer}{is.acik > 0 ? ` · açık prim ${para(is.acik)}` : ""}{is.acik < 0 ? ` · avans ${para(-is.acik)}` : ""}{is.beklenen > 0 ? ` · hak edilecek ~${para(is.beklenen)}` : ""}</small>
                    </span>
                  </label>
                  {isaretli ? (
                    <input className="prim-is-tutar" inputMode="decimal" aria-label={`${is.reference} için ödenen`} value={secili[is.contractId]} onChange={(o) => setSecili((onceki) => ({ ...onceki, [is.contractId]: o.target.value }))} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="wide kayit-formu-not">Bu personelin açık primi olan bir işi yok. Ödemeyi işe bağlamadan kaydedebilirsiniz.</p>}
      </> : null}

      <p className="wide kayit-formu-bolum">Ödeme</p>
      <label><span>Tutar (₺){req}</span><input name="amount" inputMode="decimal" required value={gosterilenTutar} placeholder={oneri} autoComplete="off" onChange={(o) => { setTutarElle(true); setTutarYazisi(o.target.value); }} /></label>
      <label><span>Tarih{req}</span><TarihSecici name="paid_on" required defaultValue={odeme?.paidOn ?? todayInIstanbul()} /></label>
      <label>Yöntem
        <select name="method" defaultValue={odeme?.method ?? "havale"}>
          <option value="havale">Havale / EFT</option>
          <option value="nakit">Nakit</option>
          <option value="mahsup">Mahsup</option>
          <option value="diger">Diğer</option>
        </select>
      </label>
      <label>Açıklama<input name="note" maxLength={300} defaultValue={odeme?.note ?? undefined} placeholder="Eylül primi" autoComplete="off" /></label>

      {dagitimAcik && (dagitilan || Number.isFinite(tutar)) ? (
        <p className="wide prim-dagitim-ozet" data-hata={hata ? "" : undefined} role="status">
          {hata ?? (dagitilan
            ? <>İşlere dağıtılan <b>{para(dagitilan)}</b>{Number.isFinite(tutar) && tutar > dagitilan ? <> · işe bağlanmayan <b>{para(tutar - dagitilan)}</b></> : null}</>
            : "İş seçilmedi; ödeme işe bağlanmadan kaydedilir.")}
        </p>
      ) : null}
      <p className="wide fin-form-note">{odeme
        ? "Finanstaki gider kaydı da aynı tutar ve tarihle güncellenir. Mahsuba çevrilen ödemenin gider kaydı kalkar (mahsup para çıkışı değil)."
        : "Personelin bakiyesi ödemenin toplamından düşer; iş seçimi hangi işlerin primine karşılık olduğunu gösterir. Mahsup dışındaki ödemeler finansa gider olarak düşer."}</p>
      <div className="wide panel-form-actions kayit-formu-eylem"><p>{req} işaretli alanlar zorunlu.</p><button className="panel-primary" disabled={Boolean(hata)}>{odeme ? "Değişiklikleri kaydet" : "Ödemeyi kaydet"}</button></div>
    </form>
  );
}
