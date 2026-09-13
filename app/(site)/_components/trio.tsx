// ArvoOS ürün kutusu görseli: teklif penceresi + müşteri portalı (PWA) + e-imza
// kartı yan yana — açılıştaki panelden farklı bir an. Gösterim amaçlı veri.
import type { Locale } from "@/lib/site/routes";
import { FLOW_COPY } from "../_content/flow-copy";
import { SignCard } from "./float-card";
import { FlowScreen } from "./flow-screens";
import { PhoneFrame } from "./mock-phone";

export function ArvoosTrio({ locale }: { locale: Locale }) {
  const copy = FLOW_COPY[locale];
  return (
    <figure className="trio" aria-label={copy.cap}>
      <div className="trio-win mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">{copy.url}</span></div>
        <div className="trio-body"><FlowScreen index={1} copy={copy} /></div>
      </div>
      <div className="trio-phone"><PhoneFrame locale={locale} /></div>
      <div className="trio-sign"><SignCard locale={locale} /></div>
      <figcaption className="mock-cap trio-cap">{copy.cap}</figcaption>
    </figure>
  );
}
