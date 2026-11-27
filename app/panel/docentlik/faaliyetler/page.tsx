import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { sayfaNumarasi } from "@/lib/liste-sayfalama";
import { donemEtiketi, gunMetni, kriterSecenekleri, puanMetni, yazarMetni } from "@/lib/docentlik-gorunum";
import { kendiDonemi } from "@/lib/docentlik-islem";
import { PanelModal } from "../../components/panel-modal";
import { faaliyetlerim, kriterlerTumu, profilim, yetkilerim } from "../veri";
import { FaaliyetBelgesiGoruntule, FaaliyetBelgesiKaldir, FaaliyetBelgesiYukle } from "../belge";
import { FaaliyetFormu } from "../faaliyet-formu";
import { FaaliyetSil } from "../faaliyet-sil";
import { DocentlikSekmeleri } from "../sekmeler";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "Faaliyetlerim · Doçentlik" };

/*
  FAALİYETLERİM (F6 PR6a). Yalnızca kişinin KENDİ faaliyetleri
  (faaliyetlerim → owner_id = oturum); düzenle/sil düğmeleri bu yüzden
  her satırda var ve sunucu da işlemi sahibe bağlıyor (PR5). Başkasının
  faaliyetini düzenleyecek bir adres yok: kayıt kimliği formun gizli
  alanında gidiyor ama işlem owner_id = oturum koşuluyla yazıyor ve RLS
  de aynı kuralı uyguluyor.

  Sayfalama sunucuda (lib/liste-sayfalama), aralık dışı sayfa ilk sayfaya
  yönlendirilir. Puan sütunu kaydın kendi değeri (tetikleyicinin yazdığı);
  toplam BURADA hesaplanmıyor — sayfalanmış listeden toplam "bu sayfanın
  toplamı" olurdu. Toplam ve hedefler Özet sekmesinde, özet işlevinden.
*/
export default async function FaaliyetlerPage({ searchParams }: { searchParams: Promise<{ sayfa?: string }> }) {
  const { sayfa: ham } = await searchParams;
  const sayfa = sayfaNumarasi(ham);
  const [liste, kriterler, profil, yetkiler] = await Promise.all([faaliyetlerim(sayfa), kriterlerTumu(), profilim(), yetkilerim()]);
  if (liste.aralikDisi) redirect("/panel/docentlik/faaliyetler");

  const kriterAdi = new Map(kriterler.map((k) => [k.id, `${k.code} · ${k.label}`]));
  const bugun = todayInIstanbul();
  const sonSayfa = Math.max(1, Math.ceil(liste.toplam / liste.sayfaBoyu));
  const yeniSecenekler = kriterSecenekleri(kriterler, profil);

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Faaliyetlerim</h1>
        <p>Girdiğiniz akademik faaliyetler. Puanı sistem kriterinize göre hesaplar; başlık, not ya da tarih düzeltmesi puanı değiştirmez.</p>
      </div>
      <div className="talep-bas-eylem">
        <PanelModal triggerLabel="Yeni faaliyet" triggerClassName="panel-primary" kicker="DOÇENTLİK" title="Yeni faaliyet"
          description="Puanı sistem hesaplar; girdiğiniz bilgiler kurumunuzun kriterine göre değerlendirilir." boy="orta" basaridaKapan>
          <FaaliyetFormu secenekler={yeniSecenekler} bugun={bugun} />
        </PanelModal>
      </div>
    </header>

    <DocentlikSekmeleri etkin="faaliyetler" yetkiler={yetkiler} />

    <section className="panel-card docentlik-kart" aria-label={`Faaliyet listesi, ${liste.toplam} kayıt`}>
      {liste.satirlar.length === 0 ? (
        <div className="panel-empty docentlik-bos">
          <b>Henüz faaliyet yok</b>
          <p>Makale, proje, ders ya da kurumunuzun tanımladığı diğer faaliyetleri ekleyin. Puanınız Özet sekmesinde görünür.</p>
        </div>
      ) : (
        <div className="crm-table-wrap docentlik-tablo-sarmal">
          <table className="crm-data-table docentlik-tablo">
            <thead>
              <tr>
                <th scope="col">Faaliyet</th>
                <th scope="col">Tarih</th>
                <th scope="col" className="crm-col-amount">Birim</th>
                <th scope="col" className="crm-col-amount">Puan</th>
                <th scope="col">Belge</th>
                <th scope="col"><span className="docentlik-gizli">İşlemler</span></th>
              </tr>
            </thead>
            <tbody>
              {liste.satirlar.map((f) => (
                <tr key={f.id}>
                  <td>
                    <span className="docentlik-faaliyet">
                      <b>{f.title}</b>
                      <small>{kriterAdi.get(f.criteria_id) ?? "Kriter"} · {yazarMetni(Number(f.yazar_sayisi), Boolean(f.baslica_yazar))}</small>
                      {f.notes ? <small className="docentlik-not-satir">{f.notes}</small> : null}
                    </span>
                  </td>
                  <td data-label="Tarih">
                    <span className="docentlik-faaliyet">
                      {f.faaliyet_tarihi ? <span>{gunMetni(f.faaliyet_tarihi)}</span> : <span className="talep-bos">Tarih yok</span>}
                      <small>{donemEtiketi(kendiDonemi(f.faaliyet_tarihi, profil?.doktora_tarihi ?? null))}</small>
                    </span>
                  </td>
                  <td className="crm-col-amount" data-label="Birim">{puanMetni(f.unit_count)}</td>
                  <td className="crm-col-amount" data-label="Puan"><b>{puanMetni(f.computed_points)}</b></td>
                  {/* Belge (PR6b): görüntüle/değiştir/kaldır ya da ekle. Yol ve doğrulama sunucuda (belge.tsx). */}
                  <td className="docentlik-eylem-hucre" data-label="Belge">
                    <div className="docentlik-eylemler">
                      {f.belge_yolu ? <FaaliyetBelgesiGoruntule faaliyetId={f.id} baslik={f.title} /> : null}
                      <PanelModal triggerLabel={f.belge_yolu ? "Değiştir" : "PDF ekle"} triggerClassName="panel-secondary" kicker="BELGE"
                        title={f.belge_yolu ? "Belgeyi değiştir" : "PDF belge ekle"} description={f.title} boy="dar">
                        <FaaliyetBelgesiYukle faaliyetId={f.id} degistir={Boolean(f.belge_yolu)} />
                      </PanelModal>
                      {f.belge_yolu ? <FaaliyetBelgesiKaldir faaliyetId={f.id} baslik={f.title} /> : null}
                    </div>
                  </td>
                  {/* Esneyen kutu hücrenin İÇİNDE: td'ye display:flex vermek onu tablo
                      hücresi olmaktan çıkarıyor, sütun kartın dışına taşıyordu (768 px ölçümü). */}
                  <td className="docentlik-eylem-hucre">
                    <div className="docentlik-eylemler">
                    <PanelModal triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="DOÇENTLİK" title="Faaliyeti düzenle"
                      description="Birim, yazar ya da kriter değişirse puan yeniden hesaplanır." boy="orta" basaridaKapan>
                      <FaaliyetFormu
                        secenekler={kriterSecenekleri(kriterler, profil, f.criteria_id)}
                        bugun={bugun}
                        mevcut={{
                          id: f.id, surum: f.updated_at, criteria_id: f.criteria_id, title: f.title, unit_count: f.unit_count,
                          yazar_sayisi: Number(f.yazar_sayisi), baslica_yazar: Boolean(f.baslica_yazar),
                          faaliyet_tarihi: f.faaliyet_tarihi, notes: f.notes,
                        }}
                      />
                    </PanelModal>
                    <FaaliyetSil id={f.id} baslik={f.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sonSayfa > 1 ? (
        <nav className="docentlik-sayfalama" aria-label="Sayfalar">
          {sayfa > 1 ? <Link className="panel-secondary" href={`/panel/docentlik/faaliyetler?sayfa=${sayfa - 1}`}>Önceki</Link> : <span />}
          <span>Sayfa {sayfa} / {sonSayfa}</span>
          {sayfa < sonSayfa ? <Link className="panel-secondary" href={`/panel/docentlik/faaliyetler?sayfa=${sayfa + 1}`}>Sonraki</Link> : <span />}
        </nav>
      ) : null}
    </section>
  </main>;
}
