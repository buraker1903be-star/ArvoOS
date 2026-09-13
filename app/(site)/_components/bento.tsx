// Asimetrik bento: "hero" kutular (2×2, gerçek arayüz parçasıyla), "wide"
// kutular (2×1) ve sessiz küçük kutular. Hareket: kademeli belirme + masaüstünde
// hafif eğim ([data-tilt], yalnızca iç öğede — belirme animasyonuyla çakışmaz).
import Link from "next/link";
import type { Locale } from "@/lib/site/routes";
import type { Card } from "../_content/types";
import { Fragment } from "./frags";
import { Check } from "./marks";

export function Bento({ items, locale, numbered = false }: { items: Card[]; locale: Locale; numbered?: boolean }) {
  const more = locale === "tr" ? "Detaylar" : "Learn more";
  return (
    <div className="bento-x">
      {items.map((c, i) => {
        const cell = `b-cell${c.size === "hero" ? " b-hero" : ""}${c.size === "wide" ? " b-wide" : ""}${c.alt ? " alt" : ""}`;
        const tile = `b-tile${c.size ? ` is-${c.size}` : ""}${c.visual ? " has-visual" : ""}`;
        const body = (
          <>
            <div className="b-copy">
              {numbered ? <span className="fcard-n">{String(i + 1).padStart(2, "0")}</span> : null}
              <h3>{c.title}</h3>
              <p>{c.text}</p>
              {c.items?.length ? <ul>{c.items.map((x) => <li key={x}><Check />{x}</li>)}</ul> : null}
              {c.href ? <span className="link">{more} <span className="arrow" aria-hidden="true">→</span></span> : null}
            </div>
            {c.visual ? <div className="b-visual mock-win" aria-hidden="true"><Fragment v={c.visual} locale={locale} /></div> : null}
          </>
        );
        return (
          <div key={c.title} className={cell} data-reveal style={{ ["--i" as string]: i % 4 }}>
            {c.href ? <Link href={c.href} className={tile} data-tilt>{body}</Link> : <article className={tile} data-tilt>{body}</article>}
          </div>
        );
      })}
    </div>
  );
}

export const hasBento = (items: Card[]) => items.some((c) => c.size);
