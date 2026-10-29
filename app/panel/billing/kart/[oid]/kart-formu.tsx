"use client";

import { useRef, useState } from "react";
import { kartOnayi } from "../../kart-actions";
import { ROUTES, absoluteUrl } from "@/lib/site/routes";

/*
  Kart formu. action PayTR'nin adresi: form gönderildiğinde kart
  bilgileri tarayıcıdan doğrudan PayTR'ye gider, ArvoOS sunucusuna hiç
  gelmez. Gönderimden HEMEN ÖNCE onay kutusunun durumu sunucuya yazılır
  (kartOnayi): store_card imzaya girmediği için kutunun kendisi kanıt
  değil, kanıt sunucudaki kayıt (an, IP, metin, kişi).

  Kutu VARSAYILAN İŞARETSİZ: otomatik çekim yalnızca müşterinin açıkça
  seçtiği durumda (kurum sahibinin kararı, 28.10.2026).
*/
const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const YILLAR = Array.from({ length: 12 }, (_, i) => String((new Date().getFullYear() + i) % 100).padStart(2, "0"));

export function KartFormu({ odemeAdresi, merchantOid, tutar, alanlar, utoken, varsayilanAdres, varsayilanTelefon, onayMetni }: {
  odemeAdresi: string; merchantOid: string; tutar: number; alanlar: Record<string, string>; utoken: string | null;
  varsayilanAdres: string; varsayilanTelefon: string; onayMetni: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [otomatik, setOtomatik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function gonder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (gonderiliyor) return;
    setHata(null);
    setGonderiliyor(true);
    const sonuc = await kartOnayi(merchantOid, otomatik);
    if ("hata" in sonuc) {
      setHata(sonuc.hata);
      setGonderiliyor(false);
      return;
    }
    // Kart numarası ekranda dörderli boşluklu; PayTR'ye boşluksuz gitmeli.
    const kart = ref.current?.elements.namedItem("card_number") as HTMLInputElement | null;
    if (kart) kart.value = kart.value.replace(/\s/g, "");
    // Yerel submit(): onSubmit'i yeniden tetiklemeden formu PayTR'ye gönderir.
    ref.current?.submit();
  }

  // user_phone ve user_address formda düzenlenebilir: imzaya girmiyorlar, PayTR yalnızca kayda alıyor.
  const { user_phone: _telefon, user_address: _adres, ...gizli } = alanlar;
  void _telefon; void _adres;

  return (
    <form ref={ref} className="panel-card management-card panel-form kayit-formu kart-formu" method="post" action={odemeAdresi} onSubmit={gonder}>
      {Object.entries(gizli).map(([ad, deger]) => <input key={ad} type="hidden" name={ad} value={deger} />)}
      {otomatik ? <input type="hidden" name="store_card" value="1" /> : null}
      {otomatik && utoken ? <input type="hidden" name="utoken" value={utoken} /> : null}

      <p className="wide kart-tutar">Ödenecek tutar <b>{tl(tutar)}</b> <small>KDV dahil, tek çekim</small></p>

      <label className="wide"><span>Kart üzerindeki ad soyad<b className="req" aria-hidden="true">*</b></span>
        <input name="cc_owner" maxLength={50} required autoComplete="cc-name" /></label>
      <label className="wide"><span>Kart numarası<b className="req" aria-hidden="true">*</b></span>
        <input name="card_number" inputMode="numeric" autoComplete="cc-number" required pattern="[0-9 ]{15,19}" maxLength={19}
          onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/[^\d]/g, "").replace(/(.{4})/g, "$1 ").trim(); }} /></label>
      <label><span>Son kullanma ayı<b className="req" aria-hidden="true">*</b></span>
        <select name="expiry_month" required defaultValue="" autoComplete="cc-exp-month">
          <option value="" disabled>Ay</option>
          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((a) => <option key={a} value={a}>{a.padStart(2, "0")}</option>)}
        </select></label>
      <label><span>Son kullanma yılı<b className="req" aria-hidden="true">*</b></span>
        <select name="expiry_year" required defaultValue="" autoComplete="cc-exp-year">
          <option value="" disabled>Yıl</option>
          {YILLAR.map((y) => <option key={y} value={y}>20{y}</option>)}
        </select></label>
      <label><span>CVV<b className="req" aria-hidden="true">*</b></span>
        <input name="cvv" inputMode="numeric" autoComplete="cc-csc" required pattern="[0-9]{3,4}" maxLength={4} /></label>
      <label><span>Telefon<b className="req" aria-hidden="true">*</b></span>
        <input name="user_phone" defaultValue={varsayilanTelefon} required maxLength={20} inputMode="tel" autoComplete="tel" /></label>
      <label className="wide"><span>Fatura adresi<b className="req" aria-hidden="true">*</b></span>
        <input name="user_address" defaultValue={varsayilanAdres} required maxLength={400} autoComplete="street-address" /></label>

      {/* Onay metni boşsa otomatik yenileme kapalı (lib/paytr-kart-akisi otomatikYenilemeAcik): kutu hiç çizilmez. */}
      {onayMetni ? <label className="wide kart-onay">
        <input type="checkbox" checked={otomatik} onChange={(e) => setOtomatik(e.target.checked)} />
        <span><b>Kartımı kaydet, aboneliğim otomatik yenilensin.</b> {onayMetni}</span>
      </label> : null}

      {/*
        Sözleşme onayı (29.10.2026). Eskiden form tutarı ve kart alanlarını
        gösterip doğrudan ödemeye gidiyordu; mesafeli satış sözleşmesine ve
        iptal-iade koşullarına hiç bağlantı yoktu. Mevzuat bu metinlerin
        ödemeden ÖNCE gösterilip onaylatılmasını istiyor. Zorunlu, kart
        kaydetme onayından ayrı; ADSIZ, çünkü form PayTR'ye gidiyor ve ödeme
        isteğine fazladan alan eklenmemeli. Adres MUTLAK: pazarlama sayfaları
        yalnızca arvo-os.com'da, panel başka alan adında açılabiliyor.
      */}
      <label className="wide kart-onay">
        <input type="checkbox" required />
        <span>
          <a href={absoluteUrl(ROUTES["distance-sales"].tr)} target="_blank" rel="noreferrer">Mesafeli satış sözleşmesini</a> ve{" "}
          <a href={absoluteUrl(ROUTES.refund.tr)} target="_blank" rel="noreferrer">iptal ve iade koşullarını</a> okudum, kabul ediyorum.
        </span>
      </label>

      <div className="wide panel-form-actions kayit-formu-eylem">
        <p role="alert">{hata ?? "Ödemeyi bankanızın 3D Secure ekranında SMS şifresiyle onaylayacaksınız."}</p>
        <button className="panel-primary" type="submit" disabled={gonderiliyor}>
          {gonderiliyor ? "Hazırlanıyor…" : `Öde · ${tl(tutar)}`}
        </button>
      </div>
    </form>
  );
}
