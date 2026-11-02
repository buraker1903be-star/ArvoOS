import { konsolAlaniniAc } from "../../konsol-alani";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { zorunlu } from "../../konsol-oku";
import { KKart } from "../../konsol-ui";
import { hazirYanitEkle, hazirYanitSil } from "./actions";
import "../../platform.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../../hr/hr.css";
import "../../../components/kayit-formu.css";
import "../destek.css";

export const metadata: Metadata = { title: "Hazır yanıtlar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
  DESTEK HAZIR YANITLARI (02.11.2026). Talep ekranında yanıt kutusunun
  üstündeki seçiciden tek tıkla eklenir; {kurum} kurumun adıyla dolar.
  Liste küçük (kurucunun kendi şablonları) ve bilerek sınırsız.
*/
export default async function HazirYanitlar() {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "destek");
  /* sınırsız-tamam: kurucunun kendi şablon listesi, birkaç düzine satır. */
  const sonuc = await supabase.from("platform_hazir_yanitlar").select("id,baslik,metin").order("baslik");
  const yanitlar = (zorunlu(sonuc, "Hazır yanıtlar") ?? []) as { id: string; baslik: string; metin: string }[];

  return <main className="plt talep cari ekip destek-talebi">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/destek">DESTEK TALEPLERİ</Link></small>
        <h1>Hazır yanıtlar</h1>
        <p className="ek-alt">Sık yazdığınız yanıtlar. Talep ekranında yanıt kutusunun üstündeki seçiciden eklenir; <b>{"{kurum}"}</b> kurumun adıyla dolar, göndermeden önce metni düzeltebilirsiniz.</p>
      </div>
    </header>

    <KKart baslik="Yeni hazır yanıt">
      <form action={hazirYanitEkle} className="panel-form kayit-formu">
        <label className="wide">Başlık (seçicide görünecek ad)
          <input name="baslik" required minLength={2} maxLength={80} placeholder="Ör. Şifre sıfırlama" />
        </label>
        <label className="wide">Metin
          <textarea name="metin" required minLength={2} maxLength={3000} rows={5} placeholder={"Merhaba {kurum} ekibi, …"} />
        </label>
        <div className="wide panel-form-actions kayit-formu-eylem"><button className="panel-primary" type="submit">Kaydet</button></div>
      </form>
    </KKart>

    <KKart baslik="Kayıtlı yanıtlar" sag={<span className="status-pill">{yanitlar.length}</span>}>
      {yanitlar.length ? (
        <ul className="destek-hazir">
          {yanitlar.map((y) => (
            <li key={y.id}>
              <header><b>{y.baslik}</b>
                <form action={hazirYanitSil}><input type="hidden" name="id" value={y.id} /><button type="submit" className="panel-secondary destek-kucuk">Sil</button></form>
              </header>
              <p>{y.metin}</p>
            </li>
          ))}
        </ul>
      ) : <p className="destek-bos">Henüz hazır yanıt yok.</p>}
    </KKart>
  </main>;
}
