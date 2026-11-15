import type { Metadata } from "next";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { TEMEL_ALAN_ONERILERI } from "@/lib/docentlik/ozet";
import { profilEksikleri } from "@/lib/docentlik-gorunum";
import { GonderDugmesi } from "../../components/gonder-dugmesi";
import { TarihSecici } from "../../components/tarih-secici";
import { profilKaydet } from "../actions";
import { profilim } from "../veri";
import { DocentlikSekmeleri } from "../sekmeler";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../components/kayit-formu.css";
import "../docentlik.css";

export const metadata: Metadata = { title: "Akademik profil · Doçentlik" };

/*
  AKADEMİK PROFİL (F6 PR6a). Yalnızca kişinin KENDİ profili: okuma
  profilim() (owner_id = oturum), yazma profilKaydet() (PR5; upsert
  organization_id + owner_id oturumdan). Formda kimlik alanı yok —
  başkasının profilini açtıracak bir adres de yok.

  DOKTORA TARİHİ KİŞİSEL VERİ. Bu ekran ve kişinin kendi özeti dışında hiçbir
  yerde okunmuyor; gözetim ekranları tarihi değil yalnızca "girildi mi"
  bilgisini alıyor (docentlik_profil_ozetleri, 20261114200939) ve profil
  tablosu RLS'te yalnızca sahibine açık.

  Doğrulama sunucuda (lib/docentlik-islem → profilFormu): gerçek takvim
  günü, gelecekte değil (Türkiye günü), alt alan ancak temel alanla.
*/
export default async function DocentlikProfilPage() {
  const profil = await profilim();
  const eksikler = profilEksikleri(profil);
  const bugun = todayInIstanbul();

  return <main className="talep docentlik-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">AKADEMİK</small>
        <h1>Akademik profil</h1>
        <p>Alanınız hangi kriter ve hedeflerin size uygulanacağını, doktora tarihiniz doktora sonrası şartlarının hesabını belirler.</p>
      </div>
    </header>

    <DocentlikSekmeleri etkin="profil" />

    <section className="panel-card docentlik-kart docentlik-dar" aria-labelledby="docentlik-profil-form-baslik">
      <header className="docentlik-kart-bas">
        <h2 id="docentlik-profil-form-baslik">Bilgileriniz</h2>
        <p>{eksikler.length ? `${eksikler.length} alan eksik` : "Profiliniz tamam"}</p>
      </header>
      <form action={profilKaydet} className="panel-form kayit-formu docentlik-form" aria-describedby="docentlik-profil-gizlilik">
        <label className="wide">
          <span>Temel alan</span>
          <input name="temel_alan" list="docentlik-temel-alanlar" maxLength={120} autoComplete="off"
            defaultValue={profil?.temel_alan ?? ""} placeholder="Örn. Sosyal, Beşeri ve İdari Bilimler" aria-describedby="docentlik-temel-ipucu" />
          <small id="docentlik-temel-ipucu" className="docentlik-ipucu">ÜAK’ın temel alan adını yazın; liste yalnızca öneri.</small>
        </label>
        <datalist id="docentlik-temel-alanlar">
          {TEMEL_ALAN_ONERILERI.map((a) => <option key={a} value={a} />)}
        </datalist>

        <label className="wide">
          <span>Alt alan</span>
          <input name="alt_alan" maxLength={120} autoComplete="off" defaultValue={profil?.alt_alan ?? ""}
            placeholder="Örn. Eğitim Yönetimi" aria-describedby="docentlik-alt-ipucu" />
          <small id="docentlik-alt-ipucu" className="docentlik-ipucu">Yalnızca temel alan girildiyse kaydedilir.</small>
        </label>

        <label>
          <span>Doktora tarihi</span>
          <TarihSecici name="doktora_tarihi" max={bugun} defaultValue={profil?.doktora_tarihi ?? ""} aria-label="Doktora tarihi" />
        </label>

        <div className="wide panel-form-actions kayit-formu-eylem">
          <p id="docentlik-profil-gizlilik">
            Doktora tarihiniz yalnızca size görünür; kurumunuzdaki gözetim yetkisi olanlar tarihin kendisini değil, yalnızca girilip girilmediğini görür.
          </p>
          <GonderDugmesi bekleyenEtiket="Kaydediliyor…">Profili kaydet</GonderDugmesi>
        </div>
      </form>
    </section>
  </main>;
}
