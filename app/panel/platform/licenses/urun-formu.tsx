"use client";

import { useState } from "react";

/*
  Ek ürün aboneliği kartının formu (ArvoLab, Arc, Randevu).

  Çekirdek lisans formu gruplanıp kaydet şeridi kazanınca bu üç kart eski
  düz formla kaldı: aynı sayfada iki ayrı form dili, hangisinin neyi
  kaydettiğini düşündürüyordu. Aynı kurallar burada da geçerli —

    - askı nedeni yalnızca durum Askıda iken,
    - ücret yazılırken altında ₺ karşılığı,
    - kaydet düğmesi değişiklik yokken kapalı.

  Kart dar olduğu için gruplar (fieldset) yok: üç alanlık bir formu
  başlıklara bölmek, yer kazandırmadan gürültü ekliyordu.

  Kota alanları yalnızca ÖLÇÜMÜ YAZILMIŞ ürünlerde çiziliyor; listeyi
  sunucu hazırlıyor (lib/urun-kotasi.ts). Ölçümü olmayan limit, kurucunun
  koruma sandığı boş bir sayı olurdu.
*/

export type KotaAlani = {
  anahtar: string;
  etiket: string;
  birim: string;
  donemsel: boolean;
  limit: string;
  /** null: ölçüm yok. Sayı: o anki kullanım. */
  kullanilan: number | null;
  asildi: boolean;
};

const DURUMLAR = [
  { kod: "inactive", ad: "Kapalı" },
  { kod: "trialing", ad: "Deneme" },
  { kod: "active", ad: "Aktif" },
  { kod: "past_due", ad: "Ödeme gecikmiş" },
  { kod: "suspended", ad: "Askıda" },
  { kod: "canceled", ad: "İptal" },
] as const;

const PAKETLER = [
  { kod: "", ad: "Belirtilmedi" },
  { kod: "starter", ad: "Başlangıç" },
  { kod: "professional", ad: "Profesyonel" },
  { kod: "enterprise", ad: "Kurumsal" },
] as const;

const sayiBicimi = new Intl.NumberFormat("tr-TR");
const paraBicimi = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/** Tarihe ay ekler; <input type="date"> için ISO gün döner. */
function ayEkle(temel: string, ay: number) {
  const bugun = new Date();
  const baslangic = temel ? new Date(`${temel}T00:00:00`) : bugun;
  const hedef = Number.isNaN(baslangic.getTime()) ? bugun : baslangic;
  const yeni = new Date(hedef);
  yeni.setMonth(yeni.getMonth() + ay);
  return yeni.toISOString().slice(0, 10);
}

export function UrunFormu({
  organizationId,
  product,
  productName,
  baslangic,
  kotalar,
  kaydet,
  yenidenYansit,
}: {
  organizationId: string;
  product: string;
  productName: string;
  baslangic: { status: string; planCode: string; monthlyFee: string; currentPeriodEnd: string; suspensionReason: string };
  kotalar: KotaAlani[];
  kaydet: (formData: FormData) => void;
  yenidenYansit: (formData: FormData) => void;
}) {
  const [deger, setDeger] = useState(baslangic);
  const [kota, setKota] = useState<Record<string, string>>(
    () => Object.fromEntries(kotalar.map((alan) => [alan.anahtar, alan.limit])),
  );

  const kirli =
    (Object.keys(baslangic) as (keyof typeof baslangic)[]).some((alan) => deger[alan] !== baslangic[alan])
    || kotalar.some((alan) => kota[alan.anahtar] !== alan.limit);

  const askida = deger.status === "suspended";
  const kapali = deger.status === "inactive";
  const ucret = Number(deger.monthlyFee);

  const sifirla = () => {
    setDeger(baslangic);
    setKota(Object.fromEntries(kotalar.map((alan) => [alan.anahtar, alan.limit])));
  };

  return (
    <>
    <form className="panel-form plt-urun-formu" action={kaydet}>
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="product" value={product} />

      <label>
        Durum
        <select value={deger.status} onChange={(o) => setDeger({ ...deger, status: o.target.value })} name="status">
          {DURUMLAR.map((durum) => <option key={durum.kod} value={durum.kod}>{durum.ad}</option>)}
        </select>
      </label>

      <label>
        Paket
        <select value={deger.planCode} onChange={(o) => setDeger({ ...deger, planCode: o.target.value })} name="plan_code">
          {PAKETLER.map((paket) => <option key={paket.kod} value={paket.kod}>{paket.ad}</option>)}
        </select>
      </label>

      <label>
        Aylık ücret (TL)
        <input
          name="monthly_fee" type="number" min={1} step="0.01" value={deger.monthlyFee}
          placeholder="Boşsa kartla ödeme kapalı"
          onChange={(o) => setDeger({ ...deger, monthlyFee: o.target.value })}
        />
        <small className="kota-olcum">
          {deger.monthlyFee && Number.isFinite(ucret) && ucret > 0
            ? `${paraBicimi.format(ucret)} / ay`
            : `${productName} kartla ödenemez`}
        </small>
      </label>

      <label>
        Dönem bitişi
        <input
          name="current_period_end" type="date" value={deger.currentPeriodEnd}
          onChange={(o) => setDeger({ ...deger, currentPeriodEnd: o.target.value })}
        />
        <span className="plt-hizli">
          {[{ ad: "+1 ay", ay: 1 }, { ad: "+1 yıl", ay: 12 }].map((secim) => (
            <button
              key={secim.ad} type="button"
              onClick={() => setDeger({ ...deger, currentPeriodEnd: ayEkle(deger.currentPeriodEnd, secim.ay) })}
            >{secim.ad}</button>
          ))}
        </span>
      </label>

      {kotalar.map((alan) => (
        <label key={alan.anahtar}>
          {alan.etiket} limiti ({alan.birim})
          <input
            name={`kota_${alan.anahtar}`} type="number" min={1} placeholder="Boşsa sınırsız"
            value={kota[alan.anahtar] ?? ""}
            onChange={(o) => setKota({ ...kota, [alan.anahtar]: o.target.value })}
          />
          <small className="kota-olcum" data-tone={alan.asildi ? "danger" : undefined}>
            {alan.kullanilan === null
              ? "kullanım ölçülemedi"
              : `şu an ${sayiBicimi.format(alan.kullanilan)} ${alan.birim}${alan.donemsel ? " (bu ay)" : ""}`}
          </small>
        </label>
      ))}

      {/* Askı nedeni yalnızca askıya alınırken. Kayıtta duran eski bir neden
          varsa gösteriliyor ki kurucu neyi geri aldığını görsün. */}
      {askida || deger.suspensionReason ? (
        <label className="wide" data-tone={askida ? "danger" : undefined}>
          Askıya alma nedeni
          <input
            name="suspension_reason" required={askida} value={deger.suspensionReason}
            placeholder="Müşteri arayınca bu yanıtı vereceğiz"
            onChange={(o) => setDeger({ ...deger, suspensionReason: o.target.value })}
          />
          <small className="kota-olcum">
            {askida ? "Kayda geçer." : "Durum Askıda olmadığı için kaydedilmeyecek."}
          </small>
        </label>
      ) : null}

      {/* Kapalı ürünün ücreti ve kotası kaydediliyor ama kimseyi etkilemiyor;
          kurucu bunu bilerek hazırlayabilsin diye alanlar duruyor, karta da
          neden etkisiz olduğu yazılıyor. */}
      {kapali ? <p className="kota-olcum wide">Ürün kapalı: kiracı giremez, buradaki ücret ve limitler açılana kadar işlemez.</p> : null}

      <div className="wide plt-urun-kaydet" data-kirli={kirli}>
        <button type="button" className="panel-secondary" disabled={!kirli} onClick={sifirla}>Vazgeç</button>
        <button type="submit" className="panel-primary" disabled={!kirli}>Kaydet</button>
      </div>
    </form>

    {/*
      Yeniden yansıtma AYRI BİR FORM: yukarıdaki form değişiklik yokken
      kaydetmeye izin vermiyor ve yansıtma da yalnızca kaydederken
      çalışıyordu. Konsolda "Aktif" görünürken ürün tarafı "Deneme"
      gösterdiğinde kurucunun elinde tekrar denemek için hiçbir şey
      yoktu.

      Veriye dokunmuyor; yalnızca mevcut durumu ürün veritabanına
      yeniden yazıyor.
    */}
    <form action={yenidenYansit} className="plt-yansit">
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="product" value={product} />
      <small className="kota-olcum">
        {productName} kendi veritabanında. Orada eski durum görünüyorsa yansıtmayı yenileyin.
      </small>
      <button type="submit" className="panel-secondary">Ürüne yeniden yansıt</button>
    </form>
    </>
  );
}
