// ArvoOS panel maketi — panelin ŞEMATİK ikizi: yapısı gerçek, verisi
// gösterim amaçlı (figcaption'da yazılı).
//
// 13.10.2026: maket panelin ESKİ kabuğunu gösteriyordu (koyu sol menü +
// metin bağlantıları). Panel o kabuğu bıraktı: üstte sabit durum çubuğu
// (kurumun kare simgesi, kurum adı, açık uygulamanın adı, arama, saat,
// posta/bildirim, kullanıcı), altta ORTADA yüzen saydam dock (uygulama
// simgeleri, açık olan vurgulu). İçerik tam genişlikte: ana ekranda
// selamlama, on dört günlük talep grafiği, sayı kartları ve listeler.
// Maket artık bunu gösteriyor.
import type { Locale } from "@/lib/site/routes";

const T = {
  tr: {
    label: "ArvoOS panel arayüzü — örnek görünüm", cap: "Örnek arayüz · gösterim amaçlı veriler",
    kurum: "Akademik Merkez", uygulama: "Ana Ekran", ara: "Ara", saat: "09:24",
    hello: "Günaydın, Ayşe", title: "Genel bakış",
    serie: "Yeni talepler", serieNote: "Son 14 gün", serieDelta: "+18%",
    widgets: [["Yeni talep", "12", "info"], ["Teklif bekleyen", "5", "gold"], ["Aktif iş", "18", "brand"], ["Tahsilat bekleyen", "7", "success"]],
    table: "Son teklifler",
    rows: [["Kuzey Klinik", "İmza bekliyor", "gold"], ["Atlas Eğitim", "Onaylandı", "success"], ["Mavi Danışmanlık", "Gönderildi", "info"], ["Ege Tasarım", "Taslak", "neutral"]],
    flow: "Yaklaşan aşamalar", steps: [["Keşif", 100], ["Uygulama", 64], ["Teslim", 28]],
    dock: ["Ana Ekran", "CRM", "Operasyon", "Finans", "İnsan Kaynakları", "Posta", "Dokümanlar", "Raporlar"],
  },
  en: {
    label: "ArvoOS panel interface — sample view", cap: "Illustrative interface · sample data",
    kurum: "Northside Group", uygulama: "Home", ara: "Search", saat: "09:24",
    hello: "Good morning, Ayse", title: "Overview",
    serie: "New requests", serieNote: "Last 14 days", serieDelta: "+18%",
    widgets: [["New requests", "12", "info"], ["Awaiting proposal", "5", "gold"], ["Active jobs", "18", "brand"], ["Awaiting payment", "7", "success"]],
    table: "Recent proposals",
    rows: [["Northside Clinic", "Awaiting signature", "gold"], ["Atlas Academy", "Accepted", "success"], ["Blue Consulting", "Sent", "info"], ["Aegean Studio", "Draft", "neutral"]],
    flow: "Upcoming stages", steps: [["Discovery", 100], ["Delivery", 64], ["Handover", 28]],
    dock: ["Home", "CRM", "Operations", "Finance", "People", "Mail", "Documents", "Reports"],
  },
  de: {
    label: "ArvoOS-Panel — Beispielansicht", cap: "Beispieloberfläche · Beispieldaten",
    kurum: "Northside Group", uygulama: "Start", ara: "Suchen", saat: "09:24",
    hello: "Guten Morgen, Ayse", title: "Überblick",
    serie: "Neue Anfragen", serieNote: "Letzte 14 Tage", serieDelta: "+18 %",
    widgets: [["Neue Anfragen", "12", "info"], ["Angebot ausstehend", "5", "gold"], ["Aktive Aufträge", "18", "brand"], ["Zahlung ausstehend", "7", "success"]],
    table: "Letzte Angebote",
    rows: [["Northside Clinic", "Wartet auf Unterschrift", "gold"], ["Atlas Academy", "Angenommen", "success"], ["Blue Consulting", "Gesendet", "info"], ["Aegean Studio", "Entwurf", "neutral"]],
    flow: "Anstehende Phasen", steps: [["Analyse", 100], ["Umsetzung", 64], ["Übergabe", 28]],
    dock: ["Start", "CRM", "Betrieb", "Finanzen", "Personal", "Mail", "Dokumente", "Berichte"],
  },
  es: {
    label: "Panel de ArvoOS — vista de ejemplo", cap: "Interfaz ilustrativa · datos de ejemplo",
    kurum: "Northside Group", uygulama: "Inicio", ara: "Buscar", saat: "09:24",
    hello: "Buenos días, Ayse", title: "Resumen",
    serie: "Nuevas solicitudes", serieNote: "Últimos 14 días", serieDelta: "+18 %",
    widgets: [["Nuevas solicitudes", "12", "info"], ["Pendiente de propuesta", "5", "gold"], ["Trabajos activos", "18", "brand"], ["Pendiente de pago", "7", "success"]],
    table: "Propuestas recientes",
    rows: [["Northside Clinic", "Pendiente de firma", "gold"], ["Atlas Academy", "Aceptada", "success"], ["Blue Consulting", "Enviada", "info"], ["Aegean Studio", "Borrador", "neutral"]],
    flow: "Próximas etapas", steps: [["Descubrimiento", 100], ["Ejecución", 64], ["Entrega", 28]],
    dock: ["Inicio", "CRM", "Operaciones", "Finanzas", "Personas", "Correo", "Documentos", "Informes"],
  },
  fr: {
    label: "Panneau ArvoOS — vue d’exemple", cap: "Interface illustrative · données d’exemple",
    kurum: "Northside Group", uygulama: "Accueil", ara: "Rechercher", saat: "09:24",
    hello: "Bonjour, Ayse", title: "Vue d’ensemble",
    serie: "Nouvelles demandes", serieNote: "14 derniers jours", serieDelta: "+18 %",
    widgets: [["Nouvelles demandes", "12", "info"], ["Proposition en attente", "5", "gold"], ["Projets actifs", "18", "brand"], ["Paiement en attente", "7", "success"]],
    table: "Propositions récentes",
    rows: [["Northside Clinic", "En attente de signature", "gold"], ["Atlas Academy", "Acceptée", "success"], ["Blue Consulting", "Envoyée", "info"], ["Aegean Studio", "Brouillon", "neutral"]],
    flow: "Étapes à venir", steps: [["Découverte", 100], ["Réalisation", 64], ["Livraison", 28]],
    dock: ["Accueil", "CRM", "Opérations", "Finances", "Personnel", "Courrier", "Documents", "Rapports"],
  },
} as const;

export function OsPanelMock({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <figure className="mock" aria-label={t.label}>
      <div className="mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">app.arvo-os.com/panel</span></div>
        <div className="mo-body">
          {/* Üst durum çubuğu: kurumun kare simgesi + adı + açık uygulama. */}
          <div className="mo-bar">
            <span className="mo-bar-brand"><i>A</i><span><b>{t.kurum}</b><small>{t.uygulama}</small></span></span>
            <span className="mo-bar-search">{t.ara}<kbd>⌘K</kbd></span>
            <span className="mo-bar-right">
              <span className="mo-bar-clock">{t.saat}</span>
              <span className="mo-bar-icon" data-nokta="evet" />
              <span className="mo-bar-icon" />
              <span className="mo-avatar" />
            </span>
          </div>

          <div className="mo-main">
            <div className="mo-top"><div><small>{t.hello}</small><b>{t.title}</b></div></div>

            {/* Ana ekranın ilk kartı: son 14 günün talepleri, önceki
                dönemle kıyas rozetiyle (paneldeki SeriKarti'nın ikizi). */}
            <div className="mo-serie">
              <div className="mo-serie-head">
                <span><small>{t.serie}</small><b>{t.serieNote}</b></span>
                <span className="mo-pill" data-tone="success">{t.serieDelta}</span>
              </div>
              <div className="mo-serie-bars">
                {[34, 52, 41, 63, 48, 72, 58, 66, 44, 79, 61, 88, 70, 96].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} data-bugun={i === 13 ? "evet" : undefined} />
                ))}
              </div>
            </div>

            <div className="mo-widgets">
              {t.widgets.map(([k, v, tone]) => <div key={k} className="mo-w" data-tone={tone}><span className="mo-dot" /><small>{k}</small><strong>{v}</strong></div>)}
            </div>

            <div className="mo-grid">
              <div className="mo-card">
                <p className="mo-h">{t.table}</p>
                {t.rows.map(([name, status, tone]) => (
                  <div key={name} className="mo-row"><span className="mo-av">{name.slice(0, 1)}</span><span className="mo-name">{name}</span><span className="mo-pill" data-tone={tone}>{status}</span></div>
                ))}
              </div>
              <div className="mo-card">
                <p className="mo-h">{t.flow}</p>
                {t.steps.map(([s, p]) => <div key={s} className="mo-prog"><span>{s}</span><i><b style={{ width: `${p}%` }} /></i></div>)}
              </div>
            </div>
          </div>

          {/* Altta ortada yüzen dock: uygulama simgeleri, açık olan vurgulu. */}
          <div className="mo-dock">
            {t.dock.map((ad, i) => (
              <span key={ad} className={`mo-dock-item${i === 0 ? " on" : ""}`}>{ad.slice(0, 1)}</span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mock-cap">{t.cap}</figcaption>
    </figure>
  );
}
