import Link from "next/link";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { aramaMetni, kilavuzBolumleri, type KilavuzErisimi } from "@/lib/kilavuz";
import { resolveNavigationGroups } from "../panel-navigation-config";
import { KilavuzArama } from "./kilavuz-arama";
import "../crm/kayit-detay/kayit-detay.css";
import "./kilavuz.css";

export const metadata: Metadata = { title: "Kullanım kılavuzu", robots: { index: false, follow: false } };

/*
  KULLANIM KILAVUZU (30.10.2026).

  Metin lib/kilavuz.ts'te, sayfa yalnızca çiziyor. Kişi YALNIZCA
  GÖREBİLDİĞİ uygulamaların bölümlerini okur: dock'u kuran kuralla aynı
  (resolveNavigationGroups — kurumun açık modülleri, rolün gizlenen
  grupları, kişiye özel gizlenenler) ve konu düzeyinde yetki anahtarı.
  Kurumda olmayan bir modülü anlatmak "bende bu düğme yok" sorusunu
  doğururdu; yetkisi olmayan ekranı anlatmak da aynı şey.

  Konular <details>: kılavuz uzun ve çoğu kişi tek bir şeyi arıyor.
  Başlıklar kapalı açılıyor, arama eşleşenleri açıyor.
*/
export default async function KilavuzSayfasi() {
  const { membership, modules, hiddenModuleKeys, yetkiler, izin } = await getPanelContext();
  const gruplar = resolveNavigationGroups(modules, membership.role, hiddenModuleKeys)
    .filter((g) => g.items.length > 0)
    .map((g) => g.key);
  const erisim: KilavuzErisimi = {
    uygulamalar: new Set([...gruplar, ...(izin("posta.gor") ? ["posta"] : [])]),
    yetkiler,
  };
  const bolumler = kilavuzBolumleri(erisim);

  return <main className="panel-page kilavuz">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">YARDIM</small>
        <h1>Kullanım kılavuzu</h1>
        <p className="ek-alt">
          Panelin nasıl kullanıldığı, uygulama uygulama. Yalnızca sizin hesabınızda açık olan bölümler
          listeleniyor. Aradığınızı bulamazsanız <Link href="/panel/support">Destek</Link>&apos;e yazın.
        </p>
      </div>
    </header>

    <KilavuzArama />

    <div className="kilavuz-duzen">
      <nav className="panel-card kilavuz-icindekiler" aria-label="İçindekiler">
        <b>İçindekiler</b>
        <ol>
          {bolumler.map((b) => <li key={b.id}><a href={`#${b.id}`}>{b.baslik}</a></li>)}
        </ol>
      </nav>

      <div className="kilavuz-metin">
        {bolumler.map((b) => (
          <section key={b.id} id={b.id} className="panel-card kilavuz-bolum" data-kilavuz-bolum aria-labelledby={`${b.id}-baslik`}>
            <h2 id={`${b.id}-baslik`}>{b.baslik}</h2>
            <p className="kilavuz-giris">{b.giris}</p>
            {b.konular.map((k) => (
              <details key={k.id} id={`${b.id}-${k.id}`} className="kilavuz-konu" data-ara={aramaMetni(b, k)}>
                <summary>{k.baslik}</summary>
                <div className="kilavuz-konu-govde">
                  {k.metin?.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
                  {k.adimlar?.length ? (
                    <ol className="kilavuz-adimlar">
                      {k.adimlar.map((a) => <li key={a.slice(0, 40)}>{a}</li>)}
                    </ol>
                  ) : null}
                  {k.notlar?.length ? (
                    <ul className="kilavuz-notlar">
                      {k.notlar.map((n) => <li key={n.slice(0, 40)}>{n}</li>)}
                    </ul>
                  ) : null}
                  {k.baglanti ? <Link className="panel-secondary kilavuz-git" href={k.baglanti.href}>{k.baglanti.etiket} →</Link> : null}
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>
    </div>
  </main>;
}
