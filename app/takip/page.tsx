import type { Metadata } from "next";
import { TakipForm } from "./takip-form";
import "../durum/[slug]/status-lookup.css";

export const metadata: Metadata = {
  title: "Müşteri İş Takibi",
  description: "Takip kodunuzla işinizin güncel durumunu güvenli biçimde görüntüleyin.",
};

export default async function TakipPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;

  return (
    <main className="status-lookup-shell">
      <div className="status-lookup-ambient status-lookup-ambient-one" />
      <div className="status-lookup-ambient status-lookup-ambient-two" />
      <div className="status-lookup-layout">
        <header className="status-lookup-brandbar">
          <div className="status-lookup-brandmark">A</div>
          <div><strong>Müşteri Takip Merkezi</strong><span>Güvenli işlem alanı</span></div>
          <span className="status-lookup-secure">Güvenli Bağlantı</span>
        </header>
        <section className="status-lookup-intro">
          <span className="status-lookup-eyebrow">DOSYANIZ HER AN KONTROLÜNÜZDE</span>
          <h1>İşinizin güncel durumunu saniyeler içinde görüntüleyin.</h1>
          <p>Size özel takip koduyla ilerleme durumuna, güncel finans özetine ve son işlem tarihine güvenli şekilde erişin.</p>
          <div className="status-lookup-trust-grid">
            <div><b>01</b><span>Takip kodunuzu girin</span></div>
            <div><b>02</b><span>Dosyanızı doğrulayın</span></div>
            <div><b>03</b><span>Süreci anlık izleyin</span></div>
          </div>
        </section>
        <section className="status-lookup-card-wrap">
          <span className="status-lookup-card-icon">⌁</span>
          <p className="status-lookup-card-kicker">MÜŞTERİ GİRİŞİ</p>
          <h2>Takip kodunuzu girin</h2>
          <p>WhatsApp veya e-posta üzerinden iletilen kodu aşağıdaki alana yazın.</p>
          <TakipForm prefillCode={code} />
          <div className="status-lookup-privacy"><span>✓</span> Bilgileriniz şifreli bağlantı üzerinden korunur.</div>
        </section>
      </div>
    </main>
  );
}
