import type { Metadata } from "next";
import { TEMEL_ALAN_ONERILERI } from "@/lib/docentlik/ozet";
import { puanMetni } from "@/lib/docentlik-gorunum";
import { PanelModal } from "../../components/panel-modal";
import { hedefKaydet, hedefSil, kriterDuzenle, kriterEkle, kriterSil } from "../actions";
import { hedefleriOku, kriterleriOku, yetkilerim } from "../veri";
import { IslemFormu, OnayliIslem } from "../islem-formu";
import { DocentlikSekmeleri } from "../sekmeler";
import { YetkiYok } from "../yetki-yok";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "Kriter ve hedefler · Doçentlik" };

/*
  KRİTER VE HEDEF YÖNETİMİ (F6 PR6b) — docentlik.kriter_yonet.

  İşlemler PR5'in (kriterEkle/Düzenle/Sil, hedefKaydet/Sil): her biri
  yetkiyi sunucuda ayrıca soruyor ve RLS yönetim politikasını uyguluyor.
  Yetki yoksa veri OKUNMADAN kapalı durum.

  ESKİ PUANLAR DEĞİŞMEZ. Kriterin birim puanı ya da katsayısı değişince
  geçmiş faaliyetlerin puanı yeniden hesaplanmaz (tetikleyici girdiler
  aynıyken dokunmuyor, 20261114200939); formda bu açıkça yazıyor —
  yöneticinin "neden eski puanlar değişmedi" sorusu buradan.

  Faaliyeti olan kriter silinemez (yabancı anahtar): sunucu "pasife alın"
  der. Pasif kriter yeni faaliyette seçilemez, eski kayıtlar korunur.

  Hedef: asgari ve azami ayrı; doktora sonrası satırına azami yazılmaz
  (veritabanı kısıtı). Bu sayfa yeni bir puan KURALI üretmiyor; yalnızca
  kurumun kendi kriter ve hedef verisini yönetiyor.
*/
type Kriter = Awaited<ReturnType<typeof kriterleriOku>>[number];
type HedefSatir = Awaited<ReturnType<typeof hedefleriOku>>[number];

const sayi = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function KriterAlanlari({ k }: { k?: Kriter }) {
  return <>
    {k ? <input type="hidden" name="kriter_id" value={k.id} /> : null}
    <label>
      <span>Kod<b className="req" aria-hidden="true">*</b></span>
      <input name="kod" required={!k} maxLength={40} defaultValue={k?.code ?? ""} disabled={Boolean(k)} autoComplete="off" placeholder="Örn. A1" aria-describedby={k ? undefined : "kriter-kod-ipucu"} />
      {k ? <small className="docentlik-ipucu">Kod sonradan değişmez.</small> : <small id="kriter-kod-ipucu" className="docentlik-ipucu">Kurum ve temel alan içinde benzersiz.</small>}
    </label>
    <label>
      <span>Birim puan<b className="req" aria-hidden="true">*</b></span>
      <input name="birim_puan" required inputMode="decimal" maxLength={12} defaultValue={sayi(k?.points_per_unit)} autoComplete="off" placeholder="Örn. 20" />
    </label>
    <label className="wide">
      <span>Etiket<b className="req" aria-hidden="true">*</b></span>
      <input name="etiket" required maxLength={300} defaultValue={k?.label ?? ""} autoComplete="off" placeholder="Örn. SCI-E kapsamındaki dergide makale" />
    </label>
    <label>
      <span>Grup</span>
      <input name="grup" maxLength={120} defaultValue={k?.category_group ?? ""} autoComplete="off" placeholder="Örn. Uluslararası makale" />
    </label>
    <label>
      <span>Durum</span>
      {/* Seçim kutusu: işaretsiz onay kutusu hiç gönderilmiyor ve sunucu boş değeri "etkin" sayıyor. */}
      <select name="aktif" defaultValue={k && !k.is_active ? "0" : "1"}>
        <option value="1">Etkin — yeni faaliyette seçilebilir</option>
        <option value="0">Pasif — eski kayıtlar korunur</option>
      </select>
    </label>
    <label>
      <span>Başlıca yazar katsayısı</span>
      <input name="baslica_katsayi" inputMode="decimal" maxLength={8} defaultValue={sayi(k?.baslica_yazar_katsayisi)} autoComplete="off" placeholder="0 ile 1 arası, örn. 0,8" />
    </label>
    <label>
      <span>Diğer yazar katsayısı</span>
      <input name="diger_katsayi" inputMode="decimal" maxLength={8} defaultValue={sayi(k?.diger_yazar_katsayisi)} autoComplete="off" placeholder="0 ile 1 arası, örn. 0,5" />
    </label>
    <label className="wide docentlik-onay">
      <input type="checkbox" name="esit_bolusum" value="1" defaultChecked={Boolean(k?.esit_bolusum)} />
      <span>Puan yazarlar arasında eşit bölünsün (katsayılar yok sayılır)</span>
    </label>
    <label>
      <span>Temel alan</span>
      <input name="temel_alan" list="kriter-temel-alanlar" maxLength={120} defaultValue={k?.temel_alan ?? ""} autoComplete="off" placeholder="Boş: bütün alanlar" />
    </label>
    <label>
      <span>Alt alan</span>
      <input name="alt_alan" maxLength={160} defaultValue={k?.alt_alan ?? ""} autoComplete="off" placeholder="Boş: temel alanın tamamı" />
    </label>
    <label className="wide">
      <span>Not</span>
      <textarea name="notlar" maxLength={2000} rows={2} defaultValue={k?.notes ?? ""} />
    </label>
    {k ? <p className="wide docentlik-ipucu">Puan veya katsayı değişikliği geçmiş faaliyetlerin puanını değiştirmez; yalnızca yeni ve hesap girdisi değişen kayıtlara uygulanır.</p> : null}
  </>;
}

function HedefAlanlari({ h }: { h?: HedefSatir }) {
  return <>
    {h ? <input type="hidden" name="hedef_id" value={h.id} /> : null}
    <label>
      <span>Grup</span>
      <input name="grup" maxLength={120} defaultValue={h?.grup ?? ""} autoComplete="off" placeholder="Boş: toplam puan" />
    </label>
    <label>
      <span>Temel alan</span>
      <input name="temel_alan" list="kriter-temel-alanlar" maxLength={120} defaultValue={h?.temel_alan ?? ""} autoComplete="off" placeholder="Boş: bütün alanlar" />
    </label>
    <label>
      <span>Asgari puan</span>
      <input name="asgari_puan" inputMode="decimal" maxLength={12} defaultValue={sayi(h?.asgari_puan)} autoComplete="off" placeholder="Ulaşılması gereken" />
    </label>
    <label>
      <span>Azami puan (tavan)</span>
      <input name="azami_puan" inputMode="decimal" maxLength={12} defaultValue={sayi(h?.azami_puan)} autoComplete="off" placeholder="Fazlası sayılmaz" />
    </label>
    <label>
      <span>Alt alan</span>
      <input name="alt_alan" maxLength={160} defaultValue={h?.alt_alan ?? ""} autoComplete="off" placeholder="Boş: temel alanın tamamı" />
    </label>
    <label className="docentlik-onay">
      <input type="checkbox" name="doktora_sonrasi" value="1" defaultChecked={Boolean(h?.doktora_sonrasi)} />
      <span>Doktora sonrası şartı (yalnızca doktora tarihinden sonraki faaliyetler sayılır; tavan yazılmaz)</span>
    </label>
    <label className="wide">
      <span>Not</span>
      <textarea name="notlar" maxLength={1000} rows={2} defaultValue={h?.notlar ?? ""} />
    </label>
    <p className="wide docentlik-ipucu">Asgari ya da azamiden en az biri girilmeli.</p>
  </>;
}

const kapsam = (h: HedefSatir) => [h.temel_alan ?? "Bütün alanlar", h.alt_alan].filter(Boolean).join(" · ");

export default async function KriterlerPage() {
  const yetkiler = await yetkilerim();
  const [kriterler, hedefler] = yetkiler.kriterYonet ? await Promise.all([kriterleriOku(), hedefleriOku()]) : [[], []];
  const pasif = kriterler.filter((k) => !k.is_active).length;

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Kriter ve hedefler</h1>
        <p>Puanlama kriterleri ile asgari ve azami puan hedefleri. Değişiklikler geçmiş faaliyetlerin puanını değiştirmez.</p>
      </div>
      {yetkiler.kriterYonet ? (
        <div className="talep-bas-eylem">
          <PanelModal triggerLabel="Yeni kriter" triggerClassName="panel-primary" kicker="KRİTER" title="Yeni kriter" boy="orta" basaridaKapan>
            <IslemFormu islem={kriterEkle} dugme="Kriteri ekle" basaridaSifirla><KriterAlanlari /></IslemFormu>
          </PanelModal>
          <PanelModal triggerLabel="Yeni hedef" triggerClassName="panel-secondary" kicker="HEDEF" title="Yeni hedef" boy="orta" basaridaKapan>
            <IslemFormu islem={hedefKaydet} dugme="Hedefi ekle" basaridaSifirla><HedefAlanlari /></IslemFormu>
          </PanelModal>
        </div>
      ) : null}
    </header>

    <DocentlikSekmeleri etkin="kriterler" yetkiler={yetkiler} />

    {!yetkiler.kriterYonet ? <YetkiYok bolum="Kriter ve hedef yönetimi" anahtar="Doçentlik · kriter yönetimi" /> : (
      <>
        <datalist id="kriter-temel-alanlar">{TEMEL_ALAN_ONERILERI.map((a) => <option key={a} value={a} />)}</datalist>
        <nav className="kayit-serit talep-serit" aria-label="Kriter özeti">
          <dl>
            <div><dt>Kriter</dt><dd>{kriterler.length}</dd><small>{pasif ? `${pasif} pasif` : "hepsi etkin"}</small></div>
            <div><dt>Hedef</dt><dd>{hedefler.length}</dd><small>asgari / azami satırı</small></div>
          </dl>
        </nav>

        <section className="panel-card docentlik-kart" aria-labelledby="kriter-baslik">
          <header className="docentlik-kart-bas"><h2 id="kriter-baslik">Kriterler</h2><p>Akademisyen faaliyet eklerken etkin ve alanına uygun kriterleri görür.</p></header>
          {kriterler.length === 0 ? (
            <div className="panel-empty docentlik-bos"><b>Kriter yok</b><p>Kriter tanımlanmadan akademisyenler faaliyet ekleyemez. “Yeni kriter” ile başlayın.</p></div>
          ) : (
            <div className="crm-table-wrap docentlik-tablo-sarmal">
              <table className="crm-data-table docentlik-tablo">
                <thead><tr><th scope="col">Kriter</th><th scope="col">Alan</th><th scope="col" className="crm-col-amount">Birim puan</th><th scope="col">Paylaşım</th><th scope="col"><span className="docentlik-gizli">İşlemler</span></th></tr></thead>
                <tbody>
                  {kriterler.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <span className="docentlik-faaliyet">
                          <b>{k.code} · {k.label}</b>
                          <small>{k.category_group ?? "Diğer"}{k.is_active ? "" : " · pasif"}</small>
                        </span>
                      </td>
                      <td data-label="Alan">{[k.temel_alan ?? "Bütün alanlar", k.alt_alan].filter(Boolean).join(" · ")}</td>
                      <td className="crm-col-amount" data-label="Birim puan">{puanMetni(k.points_per_unit)}</td>
                      <td data-label="Paylaşım">{k.esit_bolusum ? "Eşit" : k.baslica_yazar_katsayisi != null || k.diger_yazar_katsayisi != null ? `Başlıca ${puanMetni(k.baslica_yazar_katsayisi)} · diğer ${puanMetni(k.diger_yazar_katsayisi)}` : "Tam puan"}</td>
                      <td className="docentlik-eylem-hucre">
                        <div className="docentlik-eylemler">
                          <PanelModal triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="KRİTER" title={`${k.code} · düzenle`} boy="orta" basaridaKapan>
                            <IslemFormu islem={kriterDuzenle} dugme="Değişiklikleri kaydet"><KriterAlanlari k={k} /></IslemFormu>
                          </PanelModal>
                          <OnayliIslem islem={kriterSil} alanlar={{ kriter_id: k.id }} etiket="Sil" ariaLabel={`${k.code} kriterini sil`}
                            baslik="Kriter silinsin mi?" metin={`"${k.code} · ${k.label}" silinir. Faaliyeti olan kriter silinemez; onu pasife alın.`} onayEtiketi="Sil" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel-card docentlik-kart" aria-labelledby="hedef-baslik">
          <header className="docentlik-kart-bas"><h2 id="hedef-baslik">Hedefler</h2><p>Asgari: ulaşılması gereken puan. Azami: grup tavanı, fazlası sayılmaz. Doktora sonrası satırları ayrı ölçülür.</p></header>
          {hedefler.length === 0 ? (
            <div className="panel-empty docentlik-bos"><b>Hedef yok</b><p>Hedef girilmeden akademisyenlerin ekranında “eksik” hesaplanmaz.</p></div>
          ) : (
            <div className="crm-table-wrap docentlik-tablo-sarmal">
              <table className="crm-data-table docentlik-tablo">
                <thead><tr><th scope="col">Hedef</th><th scope="col">Kapsam</th><th scope="col" className="crm-col-amount">Asgari</th><th scope="col" className="crm-col-amount">Azami</th><th scope="col"><span className="docentlik-gizli">İşlemler</span></th></tr></thead>
                <tbody>
                  {hedefler.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <span className="docentlik-faaliyet">
                          <b>{h.grup ?? "Toplam puan"}</b>
                          {h.doktora_sonrasi ? <small>Doktora sonrası</small> : null}
                        </span>
                      </td>
                      <td data-label="Kapsam">{kapsam(h)}</td>
                      <td className="crm-col-amount" data-label="Asgari">{h.asgari_puan == null ? <span className="talep-bos">—</span> : puanMetni(h.asgari_puan)}</td>
                      <td className="crm-col-amount" data-label="Azami">{h.azami_puan == null ? <span className="talep-bos">—</span> : puanMetni(h.azami_puan)}</td>
                      <td className="docentlik-eylem-hucre">
                        <div className="docentlik-eylemler">
                          <PanelModal triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="HEDEF" title="Hedefi düzenle" boy="orta" basaridaKapan>
                            <IslemFormu islem={hedefKaydet} dugme="Değişiklikleri kaydet"><HedefAlanlari h={h} /></IslemFormu>
                          </PanelModal>
                          <OnayliIslem islem={hedefSil} alanlar={{ hedef_id: h.id }} etiket="Sil" ariaLabel={`${h.grup ?? "Toplam puan"} hedefini sil`}
                            baslik="Hedef silinsin mi?" metin="Hedef silinir; akademisyenlerin ekranında bu şart artık ölçülmez." onayEtiketi="Sil" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    )}
  </main>;
}
