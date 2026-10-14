"use client";

import { useState } from "react";
// Ortak kayıt formu düzeni (alan görünümü, zorunlu alan işareti).
import "../../components/kayit-formu.css";
import { PAKET_VARSAYILANI } from "@/lib/paket-limitleri";
import { PAKET_SECENEKLERI } from "@/lib/paket-adlari";

/*
  ArvoOS çekirdek lisans formu.

  Eskiden dokuz alan tek bir ızgarada alt alta duruyordu: paket, durum, iki
  tarih, üç limit, ücret ve askı nedeni. Hepsi aynı ağırlıkta göründüğü için
  "bu kiracının paketi ne" sorusuyla "depolama limiti kaç MB" sorusu aynı
  anda bakılması gereken şeyler gibi okunuyordu. Alanlar artık anlamlarına
  göre gruplanıyor.

  Üç somut sorun daha vardı:

    1. Limitler ham sayıydı. "512000" kimsenin kafasında bir büyüklüğe
       karşılık gelmiyor; şimdi yazarken altında karşılığı yazıyor
       (500 GB, 10.000 kredi, ₺1.500,00/ay).
    2. Askıya alma nedeni her zaman ekrandaydı ve "yalnızca askıya
       alındığında kullanılır" diyordu — yani çoğu zaman kendi kendine
       gereksiz olduğunu söyleyen bir alan. Artık yalnızca durum "Askıda"
       seçilince açılıyor ve o zaman zorunlu.
    3. Kaydetmeden çıkmak sessizdi. Değişiklik yapıldığında alt şerit
       beliriyor ve "Vazgeç" ilk haline döndürüyor.

  Sunucu işlemi prop olarak geliyor; doğrulama ve yetki kontrolü orada
  (actions.ts). Buradaki kurallar yalnızca kolaylık — kimse bunlara
  güvenmiyor.
*/

export type LisansDegerleri = {
  planCode: string;
  licenseStatus: string;
  trialEndsAt: string;
  currentPeriodEnd: string;
  userLimit: string;
  storageLimitMb: string;
  aiCreditLimit: string;
  monthlyFee: string;
  /** Ek koltuğun aylık bedeli, TL (boş = ücretsiz). */
  extraUserFee: string;
  /** Dahil limitin üstüne açılabilen koltuk sayısı. */
  extraUserCap: string;
  suspensionReason: string;
};

// Paket adları tek kaynaktan, sitedeki adla aynı (lib/paket-adlari).
const PAKETLER = PAKET_SECENEKLERI;

const DURUMLAR = [
  { kod: "trialing", ad: "Deneme" },
  { kod: "active", ad: "Aktif" },
  { kod: "past_due", ad: "Ödeme gecikmiş" },
  { kod: "suspended", ad: "Askıda" },
  { kod: "canceled", ad: "İptal" },
] as const;

/*
  Paket varsayılanları lib/paket-limitleri'nde (veritabanının
  private.default_license_limits ile eşitliği testle sabit). Burada
  yalnızca "uygula" kısayolu için kullanılıyor: kurucu paketi değiştirince
  limitleri elle yazmak zorunda kalmasın. Kaydedilen değer her zaman
  formdaki değer — varsayılan kendiliğinden uygulanmıyor, çünkü çoğu
  kiracının pazarlıkla değişmiş limitleri var ve paket değiştirmek onları
  sessizce silerdi.
*/

const sayiBicimi = new Intl.NumberFormat("tr-TR");
const paraBicimi = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

const gb = (mb: number) =>
  mb >= 1024
    ? `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: mb >= 10240 ? 0 : 1 }).format(mb / 1024)} GB`
    : `${sayiBicimi.format(mb)} MB`;

/** Tarihe ay ekler; <input type="date"> için ISO gün döner. */
function ayEkle(temel: string, ay: number) {
  const bugun = new Date();
  const baslangic = temel ? new Date(`${temel}T00:00:00`) : bugun;
  const hedef = Number.isNaN(baslangic.getTime()) ? bugun : baslangic;
  const yeni = new Date(hedef);
  yeni.setMonth(yeni.getMonth() + ay);
  return yeni.toISOString().slice(0, 10);
}

export function LisansFormu({
  organizationId,
  baslangic,
  aktifUye,
  kullanilanMb,
  aiKullanilan,
  kaydet,
}: {
  organizationId: string;
  baslangic: LisansDegerleri;
  aktifUye: number;
  kullanilanMb: number;
  /** Bu ayki AI kredisi; null ise ölçüm alınamadı (sıfır değil). */
  aiKullanilan: number | null;
  kaydet: (formData: FormData) => void;
}) {
  const [deger, setDeger] = useState(baslangic);

  const yaz = (alan: keyof LisansDegerleri, yeni: string) => setDeger((eski) => ({ ...eski, [alan]: yeni }));

  const kirli = (Object.keys(baslangic) as (keyof LisansDegerleri)[]).some((alan) => deger[alan] !== baslangic[alan]);
  const askida = deger.licenseStatus === "suspended";
  const denemede = deger.licenseStatus === "trialing";

  const mb = Number.parseInt(deger.storageLimitMb, 10);
  const kredi = Number.parseInt(deger.aiCreditLimit, 10);
  const ucret = Number(deger.monthlyFee);
  const ekUcret = Number(deger.extraUserFee);
  const tavan = Number.parseInt(deger.extraUserCap, 10);
  /* Şu an kaç koltuk ücretli: kurucu tavanı düşürürken kimseyi kilitlemesin. */
  const ekKoltuk = Math.max(0, aktifUye - (Number.parseInt(deger.userLimit, 10) || 0));
  const varsayilan = PAKET_VARSAYILANI[deger.planCode];
  /*
    Varsayılanı uygulama önerisi yalnızca GERÇEKTEN farklıysa çıkıyor.
    Her paket seçiminde beliren bir öneri, hep orada duran bir uyarıya
    dönüşür ve okunmaz olur.
  */
  const varsayilandanFarkli = varsayilan && (
    String(varsayilan.userLimit) !== deger.userLimit
    || String(varsayilan.storageLimitMb) !== deger.storageLimitMb
    || String(varsayilan.aiCreditLimit) !== deger.aiCreditLimit
  );

  return (
    <form className="plt-lisans-formu" action={kaydet}>
      <input type="hidden" name="organization_id" value={organizationId} />

      <fieldset className="plt-alan-grubu">
        <legend>Paket ve durum</legend>
        <div className="panel-form kayit-formu">
          <label>
            Paket
            <select name="plan_code" value={deger.planCode} onChange={(o) => yaz("planCode", o.target.value)}>
              {PAKETLER.map((paket) => <option key={paket.kod} value={paket.kod}>{paket.ad}</option>)}
            </select>
          </label>
          <label>
            Lisans durumu
            <select name="license_status" value={deger.licenseStatus} onChange={(o) => yaz("licenseStatus", o.target.value)}>
              {DURUMLAR.map((durum) => <option key={durum.kod} value={durum.kod}>{durum.ad}</option>)}
            </select>
            <small className="plt-field-note">
              {askida || deger.licenseStatus === "canceled"
                ? "Kurumun panel erişimi kapanır."
                : "Kurum panele girebilir."}
            </small>
          </label>
        </div>
      </fieldset>

      <fieldset className="plt-alan-grubu">
        <legend>Dönem</legend>
        <div className="panel-form kayit-formu">
          <label>
            Deneme bitişi
            <input type="date" name="trial_ends_at" value={deger.trialEndsAt} onChange={(o) => yaz("trialEndsAt", o.target.value)} />
            {/* Deneme tarihi yalnızca durum "Deneme" iken bir şey yapıyor;
                başka durumlarda kayıtta duruyor ama kimseyi etkilemiyor. */}
            <small className="plt-field-note">
              {denemede ? "Bu tarihte deneme biter." : "Yalnızca durum Deneme iken işler."}
            </small>
          </label>
          <label>
            Dönem bitişi
            <input type="date" name="current_period_end" value={deger.currentPeriodEnd} onChange={(o) => yaz("currentPeriodEnd", o.target.value)} />
            <span className="plt-hizli">
              {[{ ad: "+1 ay", ay: 1 }, { ad: "+3 ay", ay: 3 }, { ad: "+1 yıl", ay: 12 }].map((secim) => (
                <button key={secim.ad} type="button" onClick={() => yaz("currentPeriodEnd", ayEkle(deger.currentPeriodEnd, secim.ay))}>
                  {secim.ad}
                </button>
              ))}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="plt-alan-grubu">
        <legend>Kapasite</legend>
        <div className="panel-form kayit-formu">
          <label>
            <span>Kullanıcı limiti<b className="req" aria-hidden="true">*</b></span>
            <input type="number" name="user_limit" min={1} required value={deger.userLimit} onChange={(o) => yaz("userLimit", o.target.value)} />
            <small className="plt-field-note" data-tone={aktifUye > (Number.parseInt(deger.userLimit, 10) || 0) ? "danger" : undefined}>
              şu an {sayiBicimi.format(aktifUye)} aktif üye
            </small>
          </label>
          <label>
            <span>Depolama limiti (MB)<b className="req" aria-hidden="true">*</b></span>
            <input type="number" name="storage_limit_mb" min={1} required value={deger.storageLimitMb} onChange={(o) => yaz("storageLimitMb", o.target.value)} />
            <small className="plt-field-note">
              {Number.isFinite(mb) && mb > 0 ? `= ${gb(mb)} · şu an ${gb(kullanilanMb)} kullanılıyor` : `şu an ${gb(kullanilanMb)} kullanılıyor`}
            </small>
          </label>
          <label>
            <span>AI kredi limiti<b className="req" aria-hidden="true">*</b></span>
            <input type="number" name="ai_credit_limit" min={0} required value={deger.aiCreditLimit} onChange={(o) => yaz("aiCreditLimit", o.target.value)} />
            {/* Tüketim ölçülüyor ama HENÜZ KISITLAMIYOR: kredi bitince
                asistanı durduran bir kural yok. Limitin ne işe yaradığını
                olduğundan büyük göstermemek için bu not duruyor. */}
            <small className="plt-field-note">
              {Number.isFinite(kredi) ? `${sayiBicimi.format(kredi)} kredi · ` : ""}
              {aiKullanilan === null ? "tüketim ölçülemedi" : `bu ay ${sayiBicimi.format(aiKullanilan)} kullanıldı`}
              {" · henüz kısıtlama uygulanmıyor"}
            </small>
          </label>
          <label>
            Aylık ücret (TL)
            <input
              type="number" name="monthly_fee" min={1} step="0.01" value={deger.monthlyFee}
              placeholder="Boşsa kartla ödeme kapalı" onChange={(o) => yaz("monthlyFee", o.target.value)}
            />
            <small className="plt-field-note">
              {deger.monthlyFee && Number.isFinite(ucret) && ucret > 0
                ? `${paraBicimi.format(ucret)} / ay`
                : "Girilmezse kurum ArvoOS'u kartla ödeyemez."}
            </small>
          </label>
          {/*
            EK KULLANICI (13.10.2026). Dahil limiti aşan koltuk artık daveti
            durdurmuyor, ücretlendiriliyor; iki alan da bu yüzden burada.
            Varsayılan liste fiyatı (249 TL) ve 10 koltuk migration'dan
            geliyor, burada yalnızca kuruma özel anlaşma için değiştirilir.
          */}
          <label>
            Ek kullanıcı bedeli (TL / ay)
            <input
              type="number" name="extra_user_fee" min={0} step="0.01" value={deger.extraUserFee}
              placeholder="Boşsa ek koltuk ücretsiz" onChange={(o) => yaz("extraUserFee", o.target.value)}
            />
            <small className="plt-field-note">
              {ekUcret > 0
                ? `Dahil limiti aşan her kullanıcı ${paraBicimi.format(ekUcret)} / ay`
                : "Girilmezse bu kurumdan ek koltuk için ücret alınmaz."}
            </small>
          </label>
          <label>
            <span>Ek koltuk tavanı<b className="req" aria-hidden="true">*</b></span>
            <input
              type="number" name="extra_user_cap" min={0} required value={deger.extraUserCap}
              onChange={(o) => yaz("extraUserCap", o.target.value)}
            />
            <small className="plt-field-note" data-tone={ekKoltuk > 0 ? "danger" : undefined}>
              {Number.isFinite(tavan) && tavan > 0
                ? `en çok ${sayiBicimi.format((Number.parseInt(deger.userLimit, 10) || 0) + tavan)} kullanıcı`
                : "sıfır: dahil limit dolunca davet durur"}
              {ekKoltuk > 0 ? ` · şu an ${sayiBicimi.format(ekKoltuk)} ek koltuk ücretli` : ""}
            </small>
          </label>
        </div>

        {varsayilandanFarkli ? (
          <p className="plt-oneri">
            <span>
              {PAKETLER.find((paket) => paket.kod === deger.planCode)?.ad} paketinin varsayılanı{" "}
              {sayiBicimi.format(varsayilan.userLimit)} kullanıcı · {gb(varsayilan.storageLimitMb)} ·{" "}
              {sayiBicimi.format(varsayilan.aiCreditLimit)} kredi
            </span>
            <button
              type="button"
              className="panel-secondary"
              onClick={() => setDeger((eski) => ({
                ...eski,
                userLimit: String(varsayilan.userLimit),
                storageLimitMb: String(varsayilan.storageLimitMb),
                aiCreditLimit: String(varsayilan.aiCreditLimit),
              }))}
            >Varsayılanları uygula</button>
          </p>
        ) : null}
      </fieldset>

      {/* Askı nedeni yalnızca askıya alınırken. Kayıtta duran eski bir
          nedeni de gösteriyoruz ki kurucu neyi geri aldığını görsün. */}
      {askida || deger.suspensionReason ? (
        <fieldset className="plt-alan-grubu" data-tone={askida ? "danger" : undefined}>
          <legend>Askı</legend>
          <div className="panel-form kayit-formu">
            <label className="wide">
              Askıya alma nedeni
              <input
                name="suspension_reason" required={askida} value={deger.suspensionReason}
                placeholder="Müşteri arayınca bu yanıtı vereceğiz"
                onChange={(o) => yaz("suspensionReason", o.target.value)}
              />
              <small className="plt-field-note">
                {askida
                  ? "Kayda geçer; üç ay sonra kimse sebebi hatırlamıyor."
                  : "Durum Askıda olmadığı için kaydedilmeyecek."}
              </small>
            </label>
          </div>
        </fieldset>
      ) : null}

      {/*
        Şerit her zaman duruyor ama yalnızca değişiklik varken renkleniyor.
        Kaydet düğmesi değişiklik yokken kapalı: basılan ama hiçbir şey
        değiştirmeyen bir düğme, "kaydettim mi" sorusunu doğuruyordu.
      */}
      <div className="plt-kaydet-serit" data-kirli={kirli}>
        <span>{kirli ? "Kaydedilmemiş değişiklik var" : "Değişiklik yok"}</span>
        <span className="plt-kaydet-dugmeler">
          <button type="button" className="panel-secondary" disabled={!kirli} onClick={() => setDeger(baslangic)}>Vazgeç</button>
          <button type="submit" className="panel-primary" disabled={!kirli}>Lisansı kaydet</button>
        </span>
      </div>
    </form>
  );
}
