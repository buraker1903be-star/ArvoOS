// Bento kutularındaki gerçek arayüz parçaları. ArvoOS parçaları akış
// ekranlarını yeniden kullanır; hizmet parçaları örnek site / arama / portal.
import type { Locale } from "@/lib/site/routes";
import { FLOW_COPY } from "../_content/flow-copy";
import { FlowScreen } from "./flow-screens";

export type VisualKey = "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "web" | "seo" | "software";

const T = {
  tr: { site: "ornekmarka.com", crumb: "ornekmarka.com › hizmetler", result: "Hizmetler — Örnek Marka", ai: "Yapay zekâ yanıtı", source: "Kaynak", portal: "Müşteri alanı", rows: ["Talepler", "Onaylar", "Belgeler"] },
  en: { site: "yourbrand.com", crumb: "yourbrand.com › services", result: "Services — Your Brand", ai: "AI answer", source: "Source", portal: "Customer area", rows: ["Requests", "Approvals", "Documents"] },
  de: { site: "ihremarke.de", crumb: "ihremarke.de › leistungen", result: "Leistungen — Ihre Marke", ai: "KI-Antwort", source: "Quelle", portal: "Kundenbereich", rows: ["Anfragen", "Freigaben", "Dokumente"] },
  es: { site: "sumarca.es", crumb: "sumarca.es › servicios", result: "Servicios — Su Marca", ai: "Respuesta de IA", source: "Fuente", portal: "Área de clientes", rows: ["Solicitudes", "Aprobaciones", "Documentos"] },
  fr: { site: "votremarque.fr", crumb: "votremarque.fr › services", result: "Services — Votre Marque", ai: "Réponse de l’IA", source: "Source", portal: "Espace client", rows: ["Demandes", "Validations", "Documents"] },
  ar: { site: "alamatuk.com", crumb: "alamatuk.com › الخدمات", result: "الخدمات — علامتك", ai: "إجابة الذكاء الاصطناعي", source: "المصدر", portal: "منطقة العملاء", rows: ["الطلبات", "الموافقات", "المستندات"] },
} as const;

function Web({ t }: { t: (typeof T)[Locale] }) {
  return (
    <div className="fg-web">
      <div className="fg-nav"><b>{t.site}</b><i /><i /><i /></div>
      <div className="fg-hero"><i style={{ width: "72%" }} /><i style={{ width: "54%" }} /><span /></div>
      <div className="fg-cols"><i /><i /><i /></div>
    </div>
  );
}

function Seo({ t }: { t: (typeof T)[Locale] }) {
  return (
    <div className="fg-seo">
      <div className="fg-result"><small>{t.crumb}</small><b>{t.result}</b><i /><i style={{ width: "80%" }} /></div>
      <div className="fg-ai"><small>✦ {t.ai}</small><i /><i style={{ width: "88%" }} /><i style={{ width: "64%" }} /><span className="chip">{t.source}: {t.site}</span></div>
      <code className="fg-code">{'{ "@type": "FAQPage" }'}</code>
    </div>
  );
}

function Software({ t }: { t: (typeof T)[Locale] }) {
  return (
    <div className="fg-soft">
      <div className="fg-side"><i /><i /><i /><i /></div>
      <div className="fg-main">
        <b>{t.portal}</b>
        {t.rows.map((r, i) => <div key={r} className="fx-line"><span>{r}</span><span className="mo-pill" data-tone={i === 1 ? "gold" : "success"}>{i === 1 ? "•••" : "✓"}</span></div>)}
        <code className="fg-code">role × module</code>
      </div>
    </div>
  );
}

export function Fragment({ v, locale }: { v: VisualKey; locale: Locale }) {
  if (v === "web") return <Web t={T[locale]} />;
  if (v === "seo") return <Seo t={T[locale]} />;
  if (v === "software") return <Software t={T[locale]} />;
  return <FlowScreen index={Number(v.slice(1))} copy={FLOW_COPY[locale]} />;
}
