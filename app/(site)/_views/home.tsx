import Link from "next/link";
import { COMPANY, ROUTES, type Locale } from "@/lib/site/routes";
import { JsonLd, faqLd, organizationLd, webPageLd, websiteLd } from "@/lib/site/structured-data";
import { ARC_CONTENT } from "../_content/arc";
import { CHROME } from "../_content/chrome";
import type { HomeContent } from "../_content/home";
import { BrandLogo, ProductLogo, type ProductName } from "../_components/marks";
import { ArcMock } from "../_components/mock-arc";
import { LabMock } from "../_components/mock-lab";
import { OsPanelMock } from "../_components/mock-os";
import { HeroStage } from "../_components/hero-stage";
import { SignatureBand } from "../_components/signature-band";
import { SignCard } from "../_components/float-card";
import { StoryStage } from "../_components/story-stage";
import { Actions, CtaBand, Faq, HeroBackdrop, SectionHead } from "../_components/ui";

const d = (n: number) => ({ ["--d" as string]: n });

export function HomeView({ locale, c }: { locale: Locale; c: HomeContent }) {
  const arc = ARC_CONTENT[locale];
  const nav = CHROME[locale];
  const { os, lab } = c.products;
  return (
    <>
      <section className="hero on-dark" aria-labelledby="hero-title">
        <HeroBackdrop />
        <div className="wrap hero-copy">
          <p className="eyebrow rise" style={d(0)}>{c.hero.eyebrow}</p>
          <h1 id="hero-title" className="display rise" style={d(1)}>{c.hero.title}{c.hero.subtitle ? <span className="thin"> {c.hero.subtitle}</span> : null}</h1>
          <p className="lead rise" style={d(2)}>{c.hero.lead}</p>
          <Actions items={c.hero.actions} className="rise" />
          <nav className="family rise" style={d(4)} aria-label={c.hero.familyLabel}>
            {nav.productLinks.map((p) => (
              <Link key={p.href} href={p.href}>
                <span><ProductLogo name={p.label as ProductName} tone="dark" height={20} /><small>{p.desc}</small></span>
              </Link>
            ))}
          </nav>
        </div>
        <HeroStage locale={locale} />
      </section>

      <section className="section statement">
        <div className="wrap-narrow"><p>{c.statement.map((line) => <span key={line} className="st" style={{ display: "block" }}>{line}</span>)}</p></div>
      </section>

      <section id={locale === "tr" ? "urunler" : "products"} className="section tint" aria-labelledby="products-title">
        <div className="wrap-wide">
          <SectionHead eyebrow={c.products.eyebrow} title={c.products.title} lead={c.products.lead} center id="products-title" />
          <div className="bento">
            <div className="tcell tcell-os" data-reveal>
            <article className="tile tile-os on-dark" data-tilt>
              <div>
                <div className="tile-head"><ProductLogo name="ArvoOS" tone="dark" height={36} /><small>{os.label}</small></div>
                <h3 className="h3">{os.title}</h3>
                <p className="body">{os.text}</p>
                <div className="chips">{os.chips.map((x) => <span key={x} className="chip">{x}</span>)}</div>
                <Actions items={[os.cta, os.signIn]} />
              </div>
              <div className="tile-visual">
                <div className="layers">
                  <div className="layer-main"><OsPanelMock locale={locale} /></div>
                  <div className="layer-float layer-sign"><SignCard locale={locale} /></div>
                </div>
              </div>
            </article>
            </div>
            <div className="tcell tcell-lab" data-reveal style={d(1)}>
            <article className="tile tile-lab" data-tilt>
              <div className="tile-head"><ProductLogo name="ArvoLab" height={36} /><small>{lab.label}</small></div>
              <h3 className="h3">{lab.title}</h3>
              <p className="body">{lab.text}</p>
              <div className="chips">{lab.chips.map((x) => <span key={x} className="chip">{x}</span>)}</div>
              <Actions items={[lab.cta, lab.signIn]} />
              <div className="tile-visual"><LabMock locale={locale} /></div>
            </article>
            </div>
            <div className="tcell tcell-arc" data-reveal style={d(2)}>
            <article className="tile tile-arc on-dark" data-tilt>
              <div className="tile-head"><ProductLogo name="Arc" tone="dark" height={36} /><small>{arc.category}</small></div>
              <h3 className="h3">{arc.title} <span className="grey-text">{arc.subtitle}</span></h3>
              <p className="body">{arc.short}</p>
              <div className="chips">{arc.cardChips.map((x) => <span key={x} className="chip">{x}</span>)}</div>
              <Actions items={[c.products.arcCta, c.products.arcSignIn]} />
              <div className="tile-visual"><ArcMock locale={locale} /></div>
            </article>
            </div>
          </div>
        </div>
      </section>

      <SignatureBand words={c.band.words} caption={c.band.caption} />

      <StoryStage locale={locale} eyebrow={c.story.eyebrow} title={c.story.title} lead={c.story.lead} steps={c.story.steps} footer={<Actions items={[c.story.cta]} />} />

      <section className="section tint" aria-labelledby="eco-title">
        <div className="wrap eco">
          <div className="orbit" data-reveal aria-hidden="true">
            <div className="orbit-core"><BrandLogo brand="arvoos" tone="dark" /></div>
            {(["ArvoOS", "ArvoLab", "Arc"] as const).map((name, i) => (
              <div key={name} className={`orbit-node n${i + 1}`}><span><ProductLogo name={name} height={20} withAlt={false} /><small>{c.eco.roles[i]}</small></span></div>
            ))}
          </div>
          <div>
            <SectionHead eyebrow={c.eco.eyebrow} title={c.eco.title} lead={c.eco.lead} id="eco-title" />
            <div className="principles">{c.eco.principles.map((p) => <div key={p.title} data-reveal><h3>{p.title}</h3><p>{p.text}</p></div>)}</div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="values-title">
        <div className="wrap">
          <SectionHead eyebrow={c.values.eyebrow} title={c.values.title} id="values-title" />
          <div className="values">{c.values.items.map((v) => <article key={v.title} data-reveal><h3>{v.title}</h3><p>{v.text}</p></article>)}</div>
        </div>
      </section>

      <section className="section tint" aria-labelledby="svc-title">
        <div className="wrap">
          <SectionHead eyebrow={c.services.eyebrow} title={c.services.title} lead={c.services.lead} split id="svc-title" />
          <div className="svc">
            {c.services.items.map((s) => (
              <Link key={s.href} href={s.href} data-reveal><small>{s.tag}</small><h3>{s.title}</h3><p>{s.text}</p><span className="link">{c.services.more} <span className="arrow" aria-hidden="true">→</span></span></Link>
            ))}
          </div>
          <Actions items={[c.services.cta]} className="after-grid" />
        </div>
      </section>

      <section className="section" aria-labelledby="refs-title">
        <div className="wrap">
          <SectionHead eyebrow={c.refs.eyebrow} title={c.refs.title} lead={c.refs.lead} split id="refs-title" />
          <div className="refs">
            <Link className="ref" href={ROUTES.about[locale]} data-reveal>
              <BrandLogo brand="arvoculture" alt="ArvoCulture Group" />
              <span>{c.refs.culture} →</span>
            </Link>
            <a className="ref" href="https://akademikmerkez.com" target="_blank" rel="noopener" data-reveal>
              {/* Harici logo: next/image uzak kaynak yapılandırması olmadığı için düz img (boyutlu, tembel yükleme). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://akademikmerkez.com/logo-trimmed.png" alt="AkademikMerkez" width={840} height={260} loading="lazy" decoding="async" />
              <span>{c.refs.akademik} ↗</span>
            </a>
          </div>
        </div>
      </section>

      <Faq eyebrow={c.faq.eyebrow} title={c.faq.title} items={c.faq.items} />

      <CtaBand eyebrow={c.cta.eyebrow} title={c.cta.title} lead={c.cta.lead} actions={c.cta.actions} note={<>{c.cta.note} <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></>} />

      <JsonLd data={[organizationLd(), websiteLd(locale), webPageLd({ name: c.meta.title, description: c.meta.description, path: ROUTES.home[locale], locale }), faqLd(c.faq.items)]} />
    </>
  );
}
