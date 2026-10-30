import type { Metadata } from "next";
import { kurumOnizlemesi } from "@/lib/kurum-onizleme";
import { requestOrigin } from "@/app/_components/request-origin";
import { getLoginBrand } from "@/lib/login-branding";
import { kurumSimgeleri } from "@/lib/kurum-simgesi";
import { TakipForm } from "./takip-form";
import { IconLock, IconSearch, IconShield } from "../durum/[slug]/status-view";
import "../durum/[slug]/status-lookup.css";

/*
  Takip sayfası kurumun MÜŞTERİSİNE gidiyor: sekmede kurumun adı ve
  logosu olmalı. Kurum kendi alan adındaysa adresten tanınıyor;
  paylaşılan adreste genel başlık kalıyor (hangi kurum olduğu daha
  kod girilmeden bilinmiyor).
*/
export async function generateMetadata(): Promise<Metadata> {
  const marka = await getLoginBrand();
  if (!marka) {
    return {
      title: "Müşteri İş Takibi",
      description: "Takip kodunuzla işinizin güncel durumunu güvenli biçimde görüntüleyin.",
    };
  }
  return {
    title: `${marka.name} | İş Takibi`,
    description: `${marka.name} işinizin güncel durumunu takip kodunuzla görüntüleyin.`,
    // Bağlantı önizlemesi de kurumun (lib/kurum-onizleme): yoksa kökteki ArvoOS logosu çıkıyordu.
    ...kurumOnizlemesi({ kurumAdi: marka.name, logoUrl: marka.logo_url, baslik: `${marka.name} | İş Takibi`, aciklama: `${marka.name} işinizin güncel durumunu takip kodunuzla görüntüleyin.`, koken: await requestOrigin(), yol: "/takip" }),
    /* Sekme simgesi kurumun yüklediği KARE simge (lib/kurum-simgesi), logo
       değil: yatay logo 16×16 kareye sıkışıp bozuk görünüyordu (13.10.2026,
       takip sayfası). Giriş ve iş durumu sayfaları zaten böyleydi. */
    icons: kurumSimgeleri(marka),
  };
}

export default async function TakipPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;

  return (
    <main className="status-lookup-shell">
      <header className="trk-topbar">
        <div className="trk-topbar-inner">
          <span className="trk-brandmark" aria-hidden="true">A</span>
          <div className="trk-topbar-title">
            <strong>Müşteri Takip Merkezi</strong>
            <span>Güvenli işlem alanı</span>
          </div>
          <span className="trk-secure"><IconLock size={14} />Güvenli bağlantı</span>
        </div>
      </header>

      <div className="trk-landing">
        <section className="trk-intro" aria-labelledby="trk-intro-title">
          <p className="trk-eyebrow">Dosyanız her an kontrolünüzde</p>
          <h1 id="trk-intro-title">İşinizin güncel durumunu saniyeler içinde görüntüleyin.</h1>
          <p className="trk-intro-lead">Size özel takip koduyla ilerleme durumuna, güncel finans özetine ve son işlem tarihine güvenli şekilde erişin.</p>
        </section>

        <section className="trk-card trk-lookup-card" aria-labelledby="trk-lookup-title">
          <span className="trk-card-icon" aria-hidden="true"><IconSearch size={22} /></span>
          <h2 id="trk-lookup-title">Takip kodunuzu girin</h2>
          <p className="trk-lookup-lead">WhatsApp veya e-posta üzerinden iletilen kodu aşağıdaki alana yazın.</p>
          <TakipForm prefillCode={code} />
          <p className="trk-privacy"><IconShield />Bilgileriniz şifreli bağlantı üzerinden korunur.</p>
        </section>

        <ol className="trk-how" aria-label="Nasıl çalışır">
          <li><b aria-hidden="true">1</b><div><strong>Takip kodunuzu girin</strong><span>Size iletilen kodu yazmanız yeterli.</span></div></li>
          <li><b aria-hidden="true">2</b><div><strong>Dosyanızı görüntüleyin</strong><span>İlerleme, aşama ve ödeme özeti tek ekranda.</span></div></li>
          <li><b aria-hidden="true">3</b><div><strong>Ekiple yazışın</strong><span>Sorularınızı dosyanız üzerinden iletin.</span></div></li>
        </ol>
      </div>
    </main>
  );
}
