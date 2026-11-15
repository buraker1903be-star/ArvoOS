import type { Metadata } from "next";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { uakOnayKarari } from "@/lib/docentlik-islem";
import { uakDurumu } from "@/lib/docentlik-gorunum";
import { uakSil } from "../actions";
import { uakTablolari, yetkilerim } from "../veri";
import { UakGoruntule, UakYukle } from "../belge";
import { OnayliIslem } from "../islem-formu";
import { DocentlikSekmeleri } from "../sekmeler";
import { YetkiYok } from "../yetki-yok";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "ÜAK tabloları · Doçentlik" };

/*
  ÜAK TABLOLARI (F6 PR6b) — docentlik.uak_yonet.

  Üç durum AYRI gösteriliyor ve hiçbiri ötekinin yerine geçmiyor:
  "Yüklendi" (yalnızca PDF saklanıyor), "Öneri hazır" (bir makine kriter
  ve hedef ÖNERDİ, kimse doğrulamadı, hiçbir puana uygulanmıyor),
  "Onaylandı". Öneri sütunu yalnızca service_role'ün yazdığı bir alan;
  içeriği bu ekranda GÖSTERİLMİYOR — doğrulanmamış bir kriter listesini
  ekrana koymak, onu kurumun kriteri gibi okutmanın en kısa yolu.

  Onay bugün kapalı (UAK_ONAYI_ETKIN = false). Düğme görünür ama devre
  dışı ve nedenini yazıyor; sunucu işlemi (uakOnayla) de her koşulda
  reddediyor. Görünmez bir düğme "onay neden yok" sorusunu cevapsız
  bırakırdı; tıklanabilir bir düğme ise başarısız bir istek üretirdi.

  Kriterler PDF'ten OTOMATİK oluşmuyor: yönetici "Kriter ve hedefler"
  ekranında elle giriyor.
*/
export default async function UakPage() {
  const yetkiler = await yetkilerim();
  const tablolar = yetkiler.uakYonet ? await uakTablolari() : [];
  const onay = uakOnayKarari();

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>ÜAK tabloları</h1>
        <p>Temel alan başına bir ÜAK puan tablosu (PDF). Tablolar saklanır; kriterler PDF&apos;ten otomatik oluşturulmaz.</p>
      </div>
    </header>

    <DocentlikSekmeleri etkin="uak" yetkiler={yetkiler} />

    {!yetkiler.uakYonet ? <YetkiYok bolum="ÜAK tablo yönetimi" anahtar="Doçentlik · ÜAK tablolarını yönetme" /> : (
      <>
        <section className="panel-card docentlik-kart" aria-labelledby="uak-liste-baslik">
          <header className="docentlik-kart-bas">
            <h2 id="uak-liste-baslik">Yüklenen tablolar</h2>
            <p>Öneri ile onay ayrıdır: “Öneri hazır” hiçbir puana uygulanmaz.</p>
          </header>
          {tablolar.length === 0 ? (
            <div className="panel-empty docentlik-bos"><b>Henüz ÜAK tablosu yok</b><p>Aşağıdan temel alan ve dönemle birlikte PDF yükleyin.</p></div>
          ) : (
            <div className="crm-table-wrap docentlik-tablo-sarmal">
              <table className="crm-data-table docentlik-tablo">
                <thead><tr><th scope="col">Temel alan</th><th scope="col">Durum</th><th scope="col">Yüklendi</th><th scope="col"><span className="docentlik-gizli">İşlemler</span></th></tr></thead>
                <tbody>
                  {tablolar.map((t) => {
                    const d = uakDurumu(t.durum);
                    return (
                      <tr key={t.id}>
                        <td>
                          <span className="docentlik-faaliyet">
                            <b>{t.temel_alan}</b>
                            <small>{t.donem}{t.dosya_adi ? ` · ${t.dosya_adi}` : ""}</small>
                          </span>
                        </td>
                        <td data-label="Durum">
                          <span className="docentlik-faaliyet">
                            <span className="docentlik-rozet" data-ton={d.ton}>{d.etiket}</span>
                            <small>{d.aciklama}</small>
                          </span>
                        </td>
                        <td data-label="Yüklendi">{istanbulDateTime(t.yuklendi_at, { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td className="docentlik-eylem-hucre">
                          <div className="docentlik-eylemler">
                            <UakGoruntule tabloId={t.id} temelAlan={t.temel_alan} />
                            <button type="button" className="panel-secondary" disabled aria-describedby="uak-onay-neden">Onayla</button>
                            <OnayliIslem islem={uakSil} alanlar={{ tablo_id: t.id }} etiket="Kaldır" ariaLabel={`${t.temel_alan} ÜAK tablosunu kaldır`}
                              baslik="ÜAK tablosu kaldırılsın mı?" metin={`${t.temel_alan} (${t.donem}) tablosu ve PDF'i kalıcı olarak silinir. Kriter ve hedefler etkilenmez.`} onayEtiketi="Kaldır" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p id="uak-onay-neden" className="docentlik-not">Onay kapalı: {onay.neden}</p>
        </section>

        <section className="panel-card docentlik-kart" aria-labelledby="uak-yukle-baslik">
          <header className="docentlik-kart-bas">
            <h2 id="uak-yukle-baslik">Tablo yükle</h2>
            <p>Her temel alan için tek tablo. Yenisini yüklemek için önce mevcut tabloyu kaldırın.</p>
          </header>
          <UakYukle />
        </section>
      </>
    )}
  </main>;
}
