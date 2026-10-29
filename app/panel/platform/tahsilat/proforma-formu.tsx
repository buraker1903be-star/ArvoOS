"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { Fragment, useMemo, useState } from "react";
import { aliciAdi, kdvDahilProforma, proformaToplami, type ProformaAlici, type ProformaKalemi } from "@/lib/proforma";
import { kurusOku, liraYazisi } from "@/lib/turkish-amount";

/*
  YENİ PROFORMA FORMU (28.10.2026).

  Eskiden sunucu bileşeniydi ve üç sorun vardı: alıcı yalnızca bir ad
  satırıydı (bireysel abonede çoğu zaman e-posta), ürün sabit ArvoLab'dı
  ve tutar yalnızca KDV hariç yazılabiliyordu. Şimdi müşteri seçilince
  alıcı bilgisi kurumun yasal bilgilerinden ya da abonenin adından
  doldurulur (kurucu düzeltebilir), fiyat listesinden tek tıkla kalem
  eklenir ve toplam yazarken görünür.

  Müşteri listesi uzayınca seçim kutusunda aramak zordu: kutunun üstünde
  ad, unvan ya da e-postayla süzen bir arama var.

  Hesap burada yalnızca ÖNİZLEME; kayıttaki tutarı sunucu kalemlerden
  yeniden hesaplar (actions.ts), formdan gelen toplam hiç okunmaz.
*/

export type ProformaMusterisi = {
  deger: string;
  tur: "kurum" | "abone";
  ad: string;
  /** Aramada eşleşen ek metin (unvan, e-posta, yetkili). */
  arama: string;
  alici: ProformaAlici;
};

export type ProformaFiyatKisayolu = { urun: string; etiket: string; aciklama: string; kurus: number };

const URUN_ADI: Record<string, string> = { arvoos: "ArvoOS", arvolab: "ArvoLab", randevu: "ArvoCal" };
const BOS_ALICI: ProformaAlici = { adSoyad: null, unvan: null, vergiDairesi: null, vergiNo: null, adres: null, eposta: null };
const BOS_SATIR = { aciklama: "", miktar: "", fiyat: "" };

const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);

export function ProformaFormu({ musteriler, kisayollar, bugun, gecerlilik, kdvOrani, action }: {
  musteriler: ProformaMusterisi[];
  kisayollar: ProformaFiyatKisayolu[];
  bugun: string;
  gecerlilik: string;
  kdvOrani: number;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [arama, setArama] = useState("");
  const [secili, setSecili] = useState("");
  const [urun, setUrun] = useState("arvoos");
  const [alici, setAlici] = useState<ProformaAlici>(BOS_ALICI);
  const [satirlar, setSatirlar] = useState([BOS_SATIR, BOS_SATIR, BOS_SATIR]);
  const [kdvDahil, setKdvDahil] = useState(true);
  const [oran, setOran] = useState(String(kdvOrani));

  const musteri = musteriler.find((m) => m.deger === secili) ?? null;
  const sorgu = arama.trim().toLocaleLowerCase("tr");
  const gorunen = sorgu
    ? musteriler.filter((m) => m.deger === secili || `${m.ad} ${m.arama}`.toLocaleLowerCase("tr").includes(sorgu))
    : musteriler;

  function musteriSec(deger: string) {
    setSecili(deger);
    const m = musteriler.find((x) => x.deger === deger);
    setAlici(m?.alici ?? BOS_ALICI);
    // Bireysel abone yalnızca ArvoLab kullanıyor.
    if (m?.tur === "abone") setUrun("arvolab");
  }

  function kisayolEkle(k: ProformaFiyatKisayolu) {
    setUrun(k.urun);
    setKdvDahil(true);
    setSatirlar((onceki) => {
      const bos = onceki.findIndex((s) => !s.aciklama && !s.fiyat);
      const hedef = bos === -1 ? 0 : bos;
      return onceki.map((s, i) => (i === hedef ? { aciklama: k.aciklama, miktar: "1", fiyat: liraYazisi(k.kurus) } : s));
    });
  }

  const satirGuncelle = (i: number, alan: keyof typeof BOS_SATIR, deger: string) =>
    setSatirlar((onceki) => onceki.map((s, j) => (j === i ? { ...s, [alan]: deger } : s)));

  const onizleme = useMemo(() => {
    const kalemler: ProformaKalemi[] = [];
    for (const s of satirlar) {
      if (!s.aciklama.trim() && !s.fiyat.trim()) continue;
      // Sunucuyla aynı okuma: "1.500" bin beş yüz liradır (kurusOku).
      const birim = kurusOku(s.fiyat);
      const miktar = s.miktar.trim() ? Number(s.miktar.replace(",", ".")) : 1;
      if (!Number.isFinite(birim) || birim <= 0 || !Number.isFinite(miktar) || miktar <= 0) return null;
      kalemler.push({ aciklama: s.aciklama, miktar, birim_fiyat: birim });
    }
    const o = Number(oran.replace(",", "."));
    if (!kalemler.length || !Number.isFinite(o)) return null;
    return kdvDahil ? kdvDahilProforma(kalemler, o) : proformaToplami(kalemler, o);
  }, [satirlar, oran, kdvDahil]);

  const kurumMu = musteri?.tur === "kurum";
  const urunKisayollari = kisayollar.filter((k) => k.urun === urun);

  return (
    <form className="panel-form kayit-formu" action={action}>
      <label className="wide"><span>Müşteri ara</span>
        <input type="search" value={arama} onChange={(e) => setArama(e.target.value)} autoComplete="off"
          placeholder="Kurum adı, unvan, yetkili ya da e-posta" /></label>
      <label className="wide"><span>Müşteri<b className="req" aria-hidden="true">*</b></span>
        <select name="musteri" required value={secili} onChange={(e) => musteriSec(e.target.value)}>
          <option value="" disabled>{gorunen.length ? `Seçin (${gorunen.length})` : "Aramaya uyan müşteri yok"}</option>
          <optgroup label="Kurumlar">
            {gorunen.filter((m) => m.tur === "kurum").map((m) => <option key={m.deger} value={m.deger}>{m.ad}</option>)}
          </optgroup>
          <optgroup label="Bireysel aboneler (ArvoLab)">
            {gorunen.filter((m) => m.tur === "abone").map((m) => <option key={m.deger} value={m.deger}>{m.ad}</option>)}
          </optgroup>
        </select>
      </label>
      <label><span>Ürün<b className="req" aria-hidden="true">*</b></span>
        <select name="urun" required value={urun} onChange={(e) => setUrun(e.target.value)}>
          {Object.entries(URUN_ADI).map(([kod, ad]) => (
            <option key={kod} value={kod} disabled={musteri?.tur === "abone" && kod !== "arvolab"}>{ad}</option>
          ))}
        </select>
      </label>
      <label><span>Geçerlilik tarihi<b className="req" aria-hidden="true">*</b></span>
        <TarihSecici name="gecerlilik_tarihi" min={bugun} defaultValue={gecerlilik} required /></label>

      <p className="wide kayit-formu-bolum">Alıcı bilgileri · {musteri ? "müşteri kaydından dolduruldu, belgeye bu hâliyle yazılır" : "önce müşteriyi seçin"}</p>
        <label><span>Ticari unvan{kurumMu ? <b className="req" aria-hidden="true">*</b> : null}</span>
          <input name="alici_unvan" value={alici.unvan ?? ""} onChange={(e) => setAlici({ ...alici, unvan: e.target.value })} maxLength={200} autoComplete="off"
            placeholder={kurumMu ? "Akademik Merkez Eğitim Ltd. Şti." : "Şahıs şirketi varsa"} /></label>
        <label><span>Ad soyad{musteri && !kurumMu ? <b className="req" aria-hidden="true">*</b> : null}</span>
          <input name="alici_ad_soyad" value={alici.adSoyad ?? ""} onChange={(e) => setAlici({ ...alici, adSoyad: e.target.value })} maxLength={120} autoComplete="off"
            placeholder={kurumMu ? "Yetkili kişi" : "Ayşe Yılmaz"} /></label>
        <label><span>Vergi dairesi</span>
          <input name="alici_vergi_dairesi" value={alici.vergiDairesi ?? ""} onChange={(e) => setAlici({ ...alici, vergiDairesi: e.target.value })} maxLength={80} autoComplete="off" /></label>
        <label><span>VKN / TCKN</span>
          <input name="alici_vergi_no" value={alici.vergiNo ?? ""} onChange={(e) => setAlici({ ...alici, vergiNo: e.target.value })} inputMode="numeric" maxLength={14} autoComplete="off" placeholder="10 ya da 11 hane" /></label>
        <label className="wide"><span>Adres</span>
          <input name="alici_adres" value={alici.adres ?? ""} onChange={(e) => setAlici({ ...alici, adres: e.target.value })} maxLength={400} autoComplete="off" /></label>
        <label className="wide"><span>E-posta</span>
          <input name="alici_eposta" type="email" value={alici.eposta ?? ""} onChange={(e) => setAlici({ ...alici, eposta: e.target.value })} maxLength={200} autoComplete="off" /></label>

      {urunKisayollari.length ? (
        <div className="wide proforma-kisayol">
          <p className="kayit-formu-bolum">Fiyat listesinden ekle · {URUN_ADI[urun]}, KDV dahil</p>
          {urunKisayollari.map((k) => (
            <button key={k.etiket} type="button" className="panel-secondary" onClick={() => kisayolEkle(k)}>{k.etiket} · {tl(k.kurus)}</button>
          ))}
        </div>
      ) : null}

      <p className="wide kayit-formu-bolum">Kalemler</p>
      {satirlar.map((s, i) => (
        <Fragment key={i}>
          <label className="wide"><span>{i + 1}. kalem{i === 0 ? <b className="req" aria-hidden="true">*</b> : null}</span>
            <input name={`aciklama_${i}`} value={s.aciklama} onChange={(e) => satirGuncelle(i, "aciklama", e.target.value)} maxLength={200} required={i === 0} autoComplete="off"
              placeholder={i === 0 ? "ArvoOS Kurumsal aboneliği (1 ay)" : "İsteğe bağlı"} /></label>
          <label><span>Miktar</span>
            <input name={`miktar_${i}`} value={s.miktar} onChange={(e) => satirGuncelle(i, "miktar", e.target.value)} inputMode="decimal" placeholder="1" autoComplete="off" /></label>
          <label><span>Birim fiyat ({kdvDahil ? "KDV dahil" : "KDV hariç"}, ₺)</span>
            <input name={`birim_fiyat_${i}`} value={s.fiyat} onChange={(e) => satirGuncelle(i, "fiyat", e.target.value)} inputMode="decimal" required={i === 0} autoComplete="off" placeholder="0,00" /></label>
        </Fragment>
      ))}

      <label className="wide proforma-kdv"><input type="checkbox" name="kdv_dahil" value="1" checked={kdvDahil} onChange={(e) => setKdvDahil(e.target.checked)} />
        <span>Tutarlar KDV dahil (toplam yazdığınız tutara birebir eşit olur)</span></label>
      <label><span>KDV oranı (%)</span><input name="kdv_orani" value={oran} onChange={(e) => setOran(e.target.value)} inputMode="decimal" autoComplete="off" /></label>

      <label className="wide"><span>Not</span><textarea name="notlar" maxLength={1000} rows={2} placeholder="Ödeme açıklamasına proforma numarasını yazınız." /></label>

      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>
          {onizleme
            ? <>Ara toplam {tl(onizleme.araToplam)} · KDV {tl(onizleme.kdv)} · <b>Toplam {tl(onizleme.toplam)}</b>{musteri ? <> · Sayın {aliciAdi({ ...BOS_ALICI, ...alici }) || musteri.ad}</> : null}</>
            : "Numara (PRF-…) kayıtta verilir; boş bıraktığınız kalemler atlanır."}
        </p>
        <button className="panel-primary" type="submit">Proformayı oluştur</button>
      </div>
    </form>
  );
}
