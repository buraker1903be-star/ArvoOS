"use client";

import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { useMemo, useState } from "react";
import { aliciAdi, kdvDahilProforma, PROFORMA_KALEM_SINIRI, proformaToplami, type ProformaAlici, type ProformaKalemi } from "@/lib/proforma";
import { kurusOku, liraYazisi } from "@/lib/turkish-amount";
import "../../hr/hr.css";
import "./proforma-formu.css";

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

  DÖRT ADIM (29.10.2026, "panel kalitesinde"). Form tek uzun ızgaraydı:
  on beş alan alt alta, kalemler üç sabit satır (dördüncü bir hizmet
  yazılamıyordu), toplam yalnızca düğmenin yanındaki tek satır yazıydı.
  Artık numaralı dört bölüm (müşteri ve ürün · alıcı · kalemler ·
  toplam); ürün ve KDV seçimi personel formundaki seçenek düğmeleri;
  kalemler satır eklenip silinebilen bir tablo, her satırın tutarı
  yanında; toplam kutusu belgedeki gibi ara toplam, KDV, genel toplam.
  Alan adları değişmedi (sunucu aynı adları okuyor).

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
  const [satirlar, setSatirlar] = useState([BOS_SATIR]);
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
    /* Boş satır varsa ona, yoksa yeni satıra (sınıra kadar). Eskiden boş
       satır yoksa İLK kalemin üstüne yazıyordu: ikinci kısayol birincisini
       sessizce siliyordu. */
    setSatirlar((onceki) => {
      const yeni = { aciklama: k.aciklama, miktar: "1", fiyat: liraYazisi(k.kurus) };
      const bos = onceki.findIndex((s) => !s.aciklama && !s.fiyat);
      if (bos !== -1) return onceki.map((s, i) => (i === bos ? yeni : s));
      return onceki.length < PROFORMA_KALEM_SINIRI ? [...onceki, yeni] : onceki;
    });
  }

  const satirGuncelle = (i: number, alan: keyof typeof BOS_SATIR, deger: string) =>
    setSatirlar((onceki) => onceki.map((s, j) => (j === i ? { ...s, [alan]: deger } : s)));
  const satirSil = (i: number) => setSatirlar((onceki) => (onceki.length > 1 ? onceki.filter((_, j) => j !== i) : [BOS_SATIR]));
  /* Satırın tutarı (önizleme): yazılan birim fiyat × miktar; KDV ayrımı toplam kutusunda. */
  const satirTutari = (s: typeof BOS_SATIR) => {
    if (!s.fiyat.trim()) return null;
    const birim = kurusOku(s.fiyat);
    const miktar = s.miktar.trim() ? Number(s.miktar.replace(",", ".")) : 1;
    return Number.isFinite(birim) && birim > 0 && Number.isFinite(miktar) && miktar > 0 ? Math.round(birim * miktar) : NaN;
  };

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
    <form className="panel-form kayit-formu pfo" action={action}>
      <section className="wide pfo-bolum" aria-labelledby="pfo-1">
        <h3 id="pfo-1"><i>1</i>Müşteri ve ürün</h3>
        <div className="pfo-izgara">
          <label className="pfo-genis"><span>Müşteri ara</span>
            <input type="search" value={arama} onChange={(e) => setArama(e.target.value)} autoComplete="off"
              placeholder="Kurum adı, unvan, yetkili ya da e-posta" /></label>
          <label className="pfo-genis"><span>Müşteri<b className="req" aria-hidden="true">*</b></span>
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
          <div className="pfo-alan">
            <span className="pfo-etiket">Ürün<b className="req" aria-hidden="true">*</b></span>
            {/* Bireysel abone yalnızca ArvoLab kullanıyor; öteki ürünler o zaman kapalı. */}
            <div className="pf-secenek pfo-urun" role="radiogroup" aria-label="Ürün">
              {Object.entries(URUN_ADI).map(([kod, ad]) => (
                <label key={kod}>
                  <input type="radio" name="urun" value={kod} checked={urun === kod} onChange={() => setUrun(kod)} disabled={musteri?.tur === "abone" && kod !== "arvolab"} required />
                  <span>{ad}</span>
                </label>
              ))}
            </div>
          </div>
          <label><span>Geçerlilik tarihi<b className="req" aria-hidden="true">*</b></span>
            <TarihSecici name="gecerlilik_tarihi" min={bugun} defaultValue={gecerlilik} required /></label>
        </div>
      </section>

      <section className="wide pfo-bolum" aria-labelledby="pfo-2">
        <h3 id="pfo-2"><i>2</i>Alıcı bilgileri<small>{musteri ? "Müşteri kaydından dolduruldu; belgeye bu hâliyle yazılır." : "Önce müşteriyi seçin."}</small></h3>
        <div className="pfo-izgara">
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
          <label className="pfo-genis"><span>Adres</span>
            <input name="alici_adres" value={alici.adres ?? ""} onChange={(e) => setAlici({ ...alici, adres: e.target.value })} maxLength={400} autoComplete="off" /></label>
          <label className="pfo-genis"><span>E-posta</span>
            <input name="alici_eposta" type="email" value={alici.eposta ?? ""} onChange={(e) => setAlici({ ...alici, eposta: e.target.value })} maxLength={200} autoComplete="off" /></label>
        </div>
      </section>

      <section className="wide pfo-bolum" aria-labelledby="pfo-3">
        <h3 id="pfo-3"><i>3</i>Kalemler<small>Birim fiyatlar {kdvDahil ? "KDV dahil" : "KDV hariç"} yazılıyor (4. bölümde değişir). Boş satır atlanır; en çok {PROFORMA_KALEM_SINIRI} kalem.</small></h3>
        {urunKisayollari.length ? (
          <div className="pfo-kisayol">
            <span className="pfo-etiket">Fiyat listesinden · {URUN_ADI[urun]}, KDV dahil</span>
            {urunKisayollari.map((k) => (
              <button key={k.etiket} type="button" className="pfo-cip" onClick={() => kisayolEkle(k)}>+ {k.etiket} · {tl(k.kurus)}</button>
            ))}
          </div>
        ) : null}
        <div className="pfo-kalemler" role="table" aria-label="Kalemler">
          <div className="pfo-kalem pfo-kalem-bas" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Açıklama</span>
            <span role="columnheader">Miktar</span>
            <span role="columnheader">Birim fiyat (₺)</span>
            <span role="columnheader" className="pfo-sag">Tutar</span>
            <span role="columnheader" aria-label="Sil" />
          </div>
          {satirlar.map((s, i) => {
            const tutar = satirTutari(s);
            return (
              <div className="pfo-kalem" role="row" key={i}>
                <span className="pfo-sira">{i + 1}</span>
                <input name={`aciklama_${i}`} value={s.aciklama} onChange={(e) => satirGuncelle(i, "aciklama", e.target.value)} maxLength={200} required={i === 0} autoComplete="off"
                  aria-label={`${i + 1}. kalemin açıklaması`} placeholder={i === 0 ? "ArvoOS Kurumsal aboneliği (1 ay)" : "Açıklama"} />
                <input name={`miktar_${i}`} value={s.miktar} onChange={(e) => satirGuncelle(i, "miktar", e.target.value)} inputMode="decimal" placeholder="1" autoComplete="off" aria-label={`${i + 1}. kalemin miktarı`} />
                <input name={`birim_fiyat_${i}`} value={s.fiyat} onChange={(e) => satirGuncelle(i, "fiyat", e.target.value)} inputMode="decimal" required={i === 0} autoComplete="off" placeholder="0,00" aria-label={`${i + 1}. kalemin birim fiyatı`} />
                <span className="pfo-sag pfo-tutar" data-hata={Number.isNaN(tutar) ? "evet" : undefined}>{tutar === null ? "—" : Number.isNaN(tutar) ? "geçersiz" : tl(tutar)}</span>
                <button type="button" className="pfo-sil" onClick={() => satirSil(i)} aria-label={`${i + 1}. kalemi sil`} title="Kalemi sil">×</button>
              </div>
            );
          })}
        </div>
        <button type="button" className="pfo-cip pfo-ekle" disabled={satirlar.length >= PROFORMA_KALEM_SINIRI}
          onClick={() => setSatirlar((onceki) => [...onceki, BOS_SATIR])}>+ Kalem ekle</button>
      </section>

      <section className="wide pfo-bolum" aria-labelledby="pfo-4">
        <h3 id="pfo-4"><i>4</i>Vergi, not ve toplam</h3>
        <div className="pfo-son">
          <div className="pfo-izgara">
            <div className="pfo-alan pfo-genis">
              <span className="pfo-etiket">Yazdığınız tutarlar</span>
              {/* KDV dahilde toplam yazılan tutara birebir eşit olur (liste fiyatları KDV dahil). */}
              <div className="pf-secenek pfo-kdv" role="radiogroup" aria-label="KDV">
                <label><input type="radio" name="kdv_dahil" value="1" checked={kdvDahil} onChange={() => setKdvDahil(true)} /><span>KDV dahil</span></label>
                <label><input type="radio" name="kdv_dahil" value="0" checked={!kdvDahil} onChange={() => setKdvDahil(false)} /><span>KDV hariç</span></label>
              </div>
            </div>
            <label><span>KDV oranı (%)</span><input name="kdv_orani" value={oran} onChange={(e) => setOran(e.target.value)} inputMode="decimal" autoComplete="off" /></label>
            <label className="pfo-genis"><span>Not</span><textarea name="notlar" maxLength={1000} rows={2} placeholder="Ödeme açıklamasına proforma numarasını yazınız." /></label>
          </div>
          <dl className="pfo-toplam" aria-live="polite">
            <div><dt>Ara toplam <small>KDV hariç</small></dt><dd>{onizleme ? tl(onizleme.araToplam) : "—"}</dd></div>
            <div><dt>KDV <small>%{oran || "0"}</small></dt><dd>{onizleme ? tl(onizleme.kdv) : "—"}</dd></div>
            <div className="pfo-genel"><dt>Genel toplam</dt><dd>{onizleme ? tl(onizleme.toplam) : "—"}</dd></div>
          </dl>
        </div>
      </section>

      <div className="wide panel-form-actions kayit-formu-eylem">
        <p>
          {musteri ? <>Sayın <b>{aliciAdi({ ...BOS_ALICI, ...alici }) || musteri.ad}</b> · {URUN_ADI[urun]} · numara (PRF-…) kayıtta verilir.</> : "Numara (PRF-…) kayıtta verilir."}
        </p>
        <button className="panel-primary" type="submit">Proformayı oluştur</button>
      </div>
    </form>
  );
}
