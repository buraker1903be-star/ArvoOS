import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { DUYURU_HEDEFLERI, hedefAdi, SECILI_SINIR } from "@/lib/platform-duyuru";
import { tarihSaat, sayi } from "../bicim";
import { duyuruGonder } from "./actions";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../../components/kayit-formu.css";
import "../finans.css";
import "./duyuru.css";

export const metadata: Metadata = { title: "Kurumlara duyuru", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
  KONSOLDAN KURUMLARA DUYURU (02.11.2026). Kural lib/platform-duyuru.ts,
  gönderim actions.ts. Geçmiş en yeni 30 duyuru: liste bir kayıt, toplam
  hesaplanmıyor (satır tavanı sorusu yok).
*/
type Duyuru = { id: string; baslik: string; metin: string; baglanti: string | null; hedef: string; alici_sayisi: number; olusturuldu: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DuyuruSayfasi({ searchParams }: { searchParams: Promise<{ kurumlar?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  /*
    SEÇİLİ KURUMLAR (02.11.2026): Müşteriler listesinin toplu işlem
    çubuğundaki "Duyuru gönder" buraya ?kurumlar=<kimlik,…> ile geliyor.
    Adlar gösterim için okunuyor; asıl alıcı kümesini sunucu işlemi
    gerçek kiracılarla kesiştirerek kuruyor.
  */
  const { kurumlar: kurumParam } = await searchParams;
  const seciliIdler = [...new Set((kurumParam ?? "").split(",").filter((x) => UUID.test(x)))].slice(0, SECILI_SINIR);
  const seciliSonuc = seciliIdler.length
    ? await supabase.from("organizations").select("id,name,display_name").in("id", seciliIdler)
    : { data: [], error: null };
  if (seciliSonuc.error) throw new Error("Seçili kurumlar okunamadı: " + seciliSonuc.error.message);
  const seciliKurumlar = ((seciliSonuc.data ?? []) as { id: string; name: string; display_name: string | null }[]).map((k) => ({ id: k.id, ad: k.display_name || k.name }));

  /* Son 30 duyuru: yalnızca listeleniyor, toplam ya da sayım yok. */
  const { data, error } = await supabase.from("platform_duyurulari")
    .select("id,baslik,metin,baglanti,hedef,alici_sayisi,olusturuldu")
    .order("olusturuldu", { ascending: false }).limit(30);
  if (error) throw new Error("Duyuru geçmişi okunamadı: " + error.message);
  const gecmis = (data ?? []) as Duyuru[];

  return <main className="plt talep cari ekip finans-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link></small>
        <h1>Kurumlara duyuru</h1>
        <p className="ek-alt">
          Bakım, yeni özellik ya da fiyat değişikliği: seçtiğiniz kurumların panel bildirimlerine
          &quot;ArvoOS duyurusu&quot; olarak düşer ve kurumun bütün kullanıcıları görür. Gönderilen duyuru geri alınamaz.
        </p>
      </div>
    </header>

    <section className="panel-card talep-bilgi" aria-label="Yeni duyuru">
      <form action={duyuruGonder} className="panel-form kayit-formu">
        <label className="wide">Başlık
          <input name="baslik" required minLength={3} maxLength={120} placeholder="Ör. 5 Kasım gecesi planlı bakım" />
        </label>
        <label className="wide">Metin
          <textarea name="metin" required minLength={3} maxLength={2000} rows={5} placeholder="Kurumların okuyacağı açıklama" />
        </label>
        {seciliKurumlar.length ? (
          <div className="wide duyuru-secili">
            <input type="hidden" name="hedef" value="secili" />
            {seciliKurumlar.map((k) => <input key={k.id} type="hidden" name="kurum" value={k.id} />)}
            <b>Kime: {seciliKurumlar.length} seçili kurum</b>
            <small>{seciliKurumlar.map((k) => k.ad).join(", ")}</small>
            <Link href="/panel/platform/duyuru">Bütün kurumlara ya da bir ürüne gönder</Link>
          </div>
        ) : (
          <label>Kime
            <select name="hedef" defaultValue="tum">
              {DUYURU_HEDEFLERI.map((h) => <option key={h.kod} value={h.kod}>{h.ad}</option>)}
            </select>
          </label>
        )}
        <label>Bağlantı (isteğe bağlı)
          <input name="baglanti" maxLength={200} placeholder="/panel/kilavuz" pattern="/panel.*" title="Panel içinde bir yol, ör. /panel/kilavuz" />
        </label>
        <label className="wide duyuru-eposta">
          <input type="checkbox" name="eposta" value="1" />
          <span>Kurum yetkililerine <b>e-postayla da gönder</b> (Kurum Sahipleri; sahip adresi yoksa kurumun iletişim adresi). Panele uzun süredir girmeyen kurumlar da görsün diye.</span>
        </label>
        <div className="wide panel-form-actions kayit-formu-eylem">
          <p>Ürün hedeflerinde yalnızca o ürünün lisansı açık kurumlar alır. Bireysel ArvoLab abonelerine gitmez; onlar ArvoOS panelini kullanmıyor.</p>
          <button className="panel-primary" type="submit">Duyuruyu gönder</button>
        </div>
      </form>
    </section>

    <section className="panel-card talep-bilgi" aria-label="Gönderilen duyurular">
      <header className="phr-bas fn-alt-bas"><h2>Gönderilenler <span className="pu-sayi">{gecmis.length}</span></h2><small>Son 30 duyuru</small></header>
      {gecmis.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table">
            <thead><tr><th>Duyuru</th><th>Kime</th><th className="crm-col-amount">Alan kurum</th><th className="crm-col-date">Gönderildi</th></tr></thead>
            <tbody>
              {gecmis.map((d) => (
                <tr key={d.id}>
                  <td data-label="Duyuru"><span className="ek-kisi-metin"><span className="crm-table-title" title={d.metin}>{d.baslik}</span><span className="crm-table-sub" title={d.metin}>{d.metin}</span></span></td>
                  <td data-label="Kime">{hedefAdi(d.hedef)}</td>
                  <td className="crm-col-amount" data-label="Alan kurum">{sayi(d.alici_sayisi)}</td>
                  <td className="crm-col-date" data-label="Gönderildi">{tarihSaat(d.olusturuldu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>Henüz duyuru gönderilmedi</h2></div>}
    </section>
  </main>;
}
