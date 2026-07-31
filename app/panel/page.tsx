"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, signOut, type SupabaseSession } from "@/lib/supabase-auth";

const modules = [
  ["CRM & Satış", "Müşteri, talep ve teklif süreçleri"],
  ["İş Akışları", "Görevler, sorumlular ve ilerleme"],
  ["Finans", "Tahsilat, gider ve nakit akışı"],
  ["Satın Alma", "Tedarikçi, onay ve teslimat"],
  ["Stok", "Ürün, hizmet ve kritik seviye"],
  ["İnsan Kaynakları", "Ekip, rol ve izin yönetimi"],
];

export default function PanelPage() {
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const current = getStoredSession();
    if (!current) {
      router.replace("/giris");
      return;
    }
    setSession(current);
    setChecking(false);
  }, [router]);

  async function handleLogout() {
    await signOut();
    router.replace("/giris");
  }

  if (checking) {
    return <main className="panel-loading">Oturum doğrulanıyor...</main>;
  }

  return (
    <main className="panel-shell">
      <aside className="panel-sidebar">
        <a className="panel-logo" href="/"><img src="/arvoos-logo.png" alt="ArvoOS" /></a>
        <div className="panel-company"><small>AKTİF ÇALIŞMA ALANI</small><b>ArvoOS</b><span>Kurumsal Paket</span></div>
        <nav><button className="active">Genel Bakış</button>{modules.map(([name]) => <button key={name}>{name}</button>)}</nav>
        <button className="logout" type="button" onClick={handleLogout}>Çıkış Yap</button>
      </aside>

      <section className="panel-content">
        <header className="panel-header">
          <div><small>ARVOOS OPERASYON MERKEZİ</small><h1>Hoş geldiniz</h1><p>{session?.user.email}</p></div>
          <span>{session?.user.email?.slice(0, 2).toUpperCase()}</span>
        </header>

        <section className="hero-card">
          <div><small>SİSTEM DURUMU</small><h2>ArvoOS çalışma alanınız hazır.</h2><p>Giriş doğrulaması Supabase üzerinden yapılıyor. Sıradaki aşamada kurum, rol ve kullanıcı verilerini gerçek veritabanına bağlayacağız.</p></div>
          <strong>Aktif</strong>
        </section>

        <section className="metric-grid">
          <article><small>Açık talepler</small><b>0</b><span>Veritabanı bağlantısı bekleniyor</span></article>
          <article><small>Aktif iş akışları</small><b>0</b><span>Görevler bağlanacak</span></article>
          <article><small>Bekleyen tahsilat</small><b>₺0</b><span>Finans modülü hazırlanıyor</span></article>
          <article><small>Ekip üyeleri</small><b>1</b><span>İlk yönetici hesabı</span></article>
        </section>

        <section className="module-grid">
          {modules.map(([name, description]) => <article key={name}><small>MODÜL</small><h3>{name}</h3><p>{description}</p><button type="button">Yakında aktif</button></article>)}
        </section>
      </section>
    </main>
  );
}
