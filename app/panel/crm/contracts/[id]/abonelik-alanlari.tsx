import { PRODUCTS } from "@/lib/products";
import { PAKET_SECENEKLERI } from "@/lib/paket-adlari";
import { kurusuTlYaz, niyetiCoz } from "@/lib/abonelik-niyeti";

/*
  Sözleşmenin hangi modülleri sattığı.

  Yalnızca ARVO'NUN KENDİ KURUMUNDA çiziliyor: kiracının kendi
  müşterisiyle yaptığı sözleşme bizim aboneliğimizi açmaz, o yüzden bu
  alanları görmesinin anlamı yok. Kapsam sunucuda da denetleniyor; ekranı
  gizlemek tek başına bir koruma değil.

  Sözleşme imzalandığında bu seçim konsoldaki onay kuyruğuna kopyalanıyor
  (arvo_sozlesmeden_abonelik_istegi). Seçim yapılmazsa istek "modül
  belirtilmemiş" olarak düşer ve onaylanamaz — o yüzden satışçının burayı
  doldurması gerektiğini metin açıkça söylüyor.
*/
export function AbonelikAlanlari({ niyet }: { niyet: unknown }) {
  const secili = new Map(niyetiCoz(niyet).modules.map((modul) => [modul.product, modul]));

  return (
    <>
      <input type="hidden" name="niyet_var" value="1" />
      <p className="wide panel-form-note">
        Abonelik · bu sözleşme hangi modülleri açıyor
      </p>
      <p className="wide abonelik-ipucu">
        İmzalandığında kurucu konsoluna onay isteği düşer. Modül seçilmezse istek onaylanamaz.
        Ücret boş bırakılırsa kurucu onay sırasında belirler.
      </p>

      {PRODUCTS.map((urun) => {
        const modul = secili.get(urun.code);
        return (
          <fieldset key={urun.code} className="wide abonelik-modul">
            <legend>
              <label>
                <input type="checkbox" name={`modul_${urun.code}`} defaultChecked={Boolean(modul)} />
                {urun.name}
              </label>
            </legend>
            <div>
              <label>
                Paket
                <select name={`paket_${urun.code}`} defaultValue={modul?.plan_code ?? ""}>
                  <option value="">Belirtilmedi</option>
                  {/* Paket adları tek kaynaktan, sitedeki adla aynı (lib/paket-adlari). */}
                  {PAKET_SECENEKLERI.map((p) => <option key={p.kod} value={p.kod}>{p.ad}</option>)}
                </select>
              </label>
              <label>
                Aylık ücret (TL)
                <input
                  name={`ucret_${urun.code}`}
                  inputMode="decimal"
                  defaultValue={kurusuTlYaz(modul?.monthly_fee)}
                  placeholder="Boşsa kurucu belirler"
                />
              </label>
              {/* ArvoOS çekirdeği kendisiyle senkronlanmaz; köprü seçimi
                  yalnızca ek ürünlerde anlamlı. */}
              {urun.code === "arvoos" ? null : (
                <label className="abonelik-bagimsiz">
                  <input type="checkbox" name={`bagimsiz_${urun.code}`} defaultChecked={modul ? !modul.integrated : false} />
                  Bağımsız çalışsın (ArvoOS ile veri akışı olmasın)
                </label>
              )}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}
