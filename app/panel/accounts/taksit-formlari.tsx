"use client";

import { useState } from "react";
import { tutarDegistir, yenidenBol, type PlanTaksidi } from "@/lib/taksit-plani";
import { gecerliGun, gunFarki, gunKaydir } from "@/lib/taksit-vadesi";
import { liraYazisi, parseTurkishAmount } from "@/lib/turkish-amount";
import "../components/kayit-formu.css";
import "./taksit-formlari.css";

/*
  ÖDEME TAKVİMİ PENCERELERİ (cari hesap → Ödeme takvimi), 12.10.2026.

  "Taksit planı" ve taksit "Düzenle" pencerelerinde kaydetmeden önce yeni
  plan görünüyor. Eskiden yalnızca bir açıklama cümlesi vardı ("kalan
  eşit bölünür, artan kuruş baştakilere"); hangi tarihte ne kadar
  ödeneceği kaydedince öğreniliyordu.

  Önizleme sunucu işlemiyle AYNI saf işlevlerden (lib/taksit-plani,
  lib/taksit-vadesi): taksitSecenegiDegistir yenidenBol'u, taksitiDuzenle
  tutarDegistir ve gün kaydırmayı kullanıyor (finance/actions.ts). Kural
  tek yerde; önizleme ile kayıt ayrışamaz.
*/

export type OnizlemeTaksidi = { no: number; vade: string; tutar: number; odenen: number };

const para = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const tarih = (gun: string) => new Date(`${gun}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const req = <b className="req" aria-hidden="true">*</b>;

function PlanOnizleme({ satirlar, eski, toplam, hata }: { satirlar: PlanTaksidi[]; eski: Map<number, PlanTaksidi>; toplam: number; hata: string | null }) {
  if (hata) return <p className="wide taksit-onizleme-hata" role="status">{hata}</p>;
  return (
    <div className="wide taksit-onizleme" aria-live="polite">
      <div className="taksit-onizleme-bas"><small>Kaydedilince plan</small><b>{satirlar.length} taksit · {para(satirlar.reduce((t, s) => t + s.tutar, 0))}</b></div>
      <ol>
        {satirlar.map((s) => {
          const onceki = eski.get(s.no);
          const degisti = !onceki || onceki.vade !== s.vade || onceki.tutar !== s.tutar;
          return (
            <li key={s.no} data-degisti={degisti ? "" : undefined}>
              <span className="taksit-onizleme-no">{s.no}</span>
              <span>{tarih(s.vade)}</span>
              <b>{para(s.tutar)}</b>
            </li>
          );
        })}
      </ol>
      {satirlar.reduce((t, s) => t + s.tutar, 0) !== toplam ? <p className="taksit-onizleme-hata">Toplam sözleşme tutarıyla ({para(toplam)}) tutmuyor.</p> : null}
    </div>
  );
}

/** Kalanı yeniden böler: taksit sayısı, aralık, ilk vade. */
export function TaksitPlaniFormu({ planId, taksitler, toplam, ilkVade, acikAdet, eylem }: {
  planId: string;
  taksitler: OnizlemeTaksidi[];
  toplam: number;
  ilkVade: string;
  acikAdet: number;
  eylem: (formData: FormData) => Promise<void>;
}) {
  const [adet, setAdet] = useState(String(Math.max(1, acikAdet)));
  const [aralik, setAralik] = useState("1");
  const [vade, setVade] = useState(ilkVade);
  const sonuc = yenidenBol(taksitler, toplam, { adet: Number(adet), ilkVade: vade, aralikAy: Number(aralik) });
  const eski = new Map(taksitler.map((t) => [t.no, { no: t.no, vade: t.vade, tutar: t.tutar }]));
  const odenen = taksitler.reduce((t, s) => t + Math.min(s.tutar, s.odenen), 0);

  return (
    <form className="panel-form fin-form kayit-formu" action={eylem}>
      <input type="hidden" name="plan_id" value={planId} />
      <label><span>Taksit sayısı{req}</span><input name="adet" type="number" min={1} max={36} step={1} required value={adet} onChange={(o) => setAdet(o.target.value)} /></label>
      <label>Aralık
        <select name="aralik" value={aralik} onChange={(o) => setAralik(o.target.value)}>
          <option value="1">Her ay</option>
          <option value="2">İki ayda bir</option>
          <option value="3">Üç ayda bir</option>
          <option value="6">Altı ayda bir</option>
        </select>
      </label>
      <label className="wide"><span>İlk taksitin vadesi{req}</span><input name="ilk_vade" type="date" required value={vade} onChange={(o) => setVade(o.target.value)} /></label>
      <p className="wide kayit-formu-not">Ödenen {para(odenen)} olduğu gibi kalır; kalan {para(toplam - odenen)} seçilen sayıda taksite eşit bölünür, artan kuruş baştaki taksitlere eklenir.</p>
      <PlanOnizleme satirlar={"hata" in sonuc ? [] : sonuc} eski={eski} toplam={toplam} hata={"hata" in sonuc ? sonuc.hata : null} />
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>{req} işaretli alanlar zorunlu.</p>
        <button className="panel-primary" disabled={"hata" in sonuc}>Taksit planını kaydet</button>
      </div>
    </form>
  );
}

/** Tek taksit: vade ve tutar; fark sonraki taksitlere, istenirse vadeler kayar. */
export function TaksitDuzenleFormu({ taksitId, plan, hedefNo, eylem }: {
  taksitId: string;
  plan: PlanTaksidi[];
  hedefNo: number;
  eylem: (formData: FormData) => Promise<void>;
}) {
  const hedef = plan.find((t) => t.no === hedefNo);
  const [vade, setVade] = useState(hedef?.vade ?? "");
  const [tutar, setTutar] = useState(hedef ? liraYazisi(hedef.tutar) : "");
  const [kaydir, setKaydir] = useState(false);
  const toplam = plan.reduce((t, s) => t + s.tutar, 0);

  // Sunucudaki sırayla (taksitiDuzenle): önce vade, sonra tutar.
  let sonuc: PlanTaksidi[] | { hata: string } = plan;
  if (!hedef) sonuc = { hata: "Taksit bulunamadı." };
  else if (!gecerliGun(vade)) sonuc = { hata: "Geçerli bir vade tarihi seçin." };
  else {
    const fark = gunFarki(hedef.vade, vade);
    let liste = plan.map((t) => (t.no === hedefNo ? { ...t, vade } : kaydir && fark && t.no > hedefNo ? { ...t, vade: gunKaydir(t.vade, fark) } : t));
    const yeni = tutar.trim() ? Math.round(parseTurkishAmount(tutar) * 100) : hedef.tutar;
    if (!Number.isFinite(yeni) || yeni < 0) sonuc = { hata: "Geçerli bir tutar girin." };
    else {
      if (yeni !== hedef.tutar) {
        const degisen = tutarDegistir(liste, hedefNo, yeni);
        if ("hata" in degisen) sonuc = degisen;
        else liste = degisen;
      }
      if (!("hata" in sonuc)) sonuc = liste;
    }
  }

  return (
    <form className="panel-form fin-form kayit-formu" action={eylem}>
      <input type="hidden" name="installment_id" value={taksitId} />
      <label><span>Vade tarihi{req}</span><input name="due_date" type="date" required value={vade} onChange={(o) => setVade(o.target.value)} /></label>
      <label><span>Tutar (₺){req}</span><input name="amount" inputMode="decimal" required value={tutar} onChange={(o) => setTutar(o.target.value)} /></label>
      <label className="wide cari-kaydir">
        <input name="sonrakiler" type="checkbox" checked={kaydir} onChange={(o) => setKaydir(o.target.checked)} />
        <span>Sonraki taksitlerin vadesini de aynı gün kadar kaydır</span>
      </label>
      <p className="wide kayit-formu-not">Tutar değişirse fark sonraki taksitlere aktarılır (son taksit azalırsa fark bir ay sonra yeni taksit olur); toplam sözleşme tutarında kalır.</p>
      <PlanOnizleme satirlar={"hata" in sonuc ? [] : sonuc} eski={new Map(plan.map((t) => [t.no, t]))} toplam={toplam} hata={"hata" in sonuc ? sonuc.hata : null} />
      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>{req} işaretli alanlar zorunlu.</p>
        <button className="panel-primary" disabled={"hata" in sonuc}>Kaydet</button>
      </div>
    </form>
  );
}
