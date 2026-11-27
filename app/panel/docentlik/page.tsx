import { getPanelContext } from "@/lib/panel-context";
import { docentlikBolumleri } from "@/lib/docentlik-erisim";
/* talep-bas* sınıfları orada: sayfa kullandığı CSS'i kendisi import etmeli (AGENTS.md). */
import "../crm/kayit-detay/kayit-detay.css";

/*
  DOÇENTLİK GİRİŞİ (F6 PR4). Bu PR navigasyon ve yetkilendirmeyi bağlıyor;
  veri ekranları sonraki PR'da. Sayfa bilerek hiçbir Doçentlik tablosunu
  okumuyor: hangi bölümü göreceği yalnızca yetki anahtarlarından
  (lib/docentlik-erisim.ts) çıkıyor ve veriye RLS karar veriyor.
*/
export default async function DocentlikPage() {
  const { izin } = await getPanelContext();
  const bolumler = docentlikBolumleri(izin);

  return <main className="talep">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Doçentlik</h1>
        <p>Doçentlik başvurusu için akademik faaliyetlerinizi ve puanınızı izleyin.</p>
      </div>
    </header>
    <section className="panel-card" aria-label="Doçentlik bölümleri">
      <ul>
        {bolumler.map((bolum) => (
          <li key={bolum.key}>
            <b>{bolum.label}</b>
            <p>{bolum.aciklama}</p>
          </li>
        ))}
      </ul>
      <p>Ekranlar hazırlanıyor; bu bölümler bir sonraki adımda açılacak.</p>
    </section>
  </main>;
}
