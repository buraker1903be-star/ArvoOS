import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { beklemeSuresi, DURUM_ADI, gecikmisMi, kuyrukHali, kuyrukSirala, KATEGORI_ADI, KUYRUK_SEKMELERI, ONCELIK_ADI } from "@/lib/destek-kuyrugu";
import { basHarfleri, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";

export const metadata: Metadata = { title: "Destek talepleri", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
  KONSOLUN DESTEK KUYRUĞU (02.11.2026). Kural ve gerekçe
  lib/destek-kuyrugu.ts'te: talepler konsolda hiç görünmüyordu.

  Okuma kurucunun oturumuyla: RLS (members_read_own_support_tickets)
  kurucuya bütün kurumların talebini açıyor. Sayfalı okunuyor
  (tumSatirlar): şerit sayıları listeden hesaplanıyor ve satır tavanı
  sessizce keserdi.
*/
type Talep = {
  id: string; subject: string; category: string; priority: string; status: string;
  last_message_at: string; created_at: string; organization_id: string;
  organizations: { name: string | null; display_name: string | null } | { name: string | null; display_name: string | null }[] | null;
};

const kurumAdi = (t: Talep) => {
  const o = Array.isArray(t.organizations) ? t.organizations[0] : t.organizations;
  return o?.display_name || o?.name || "Kurum";
};

export default async function DestekKuyrugu({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { durum: istenen } = await searchParams;
  const sekme = KUYRUK_SEKMELERI.find((s) => s.anahtar === istenen) ?? KUYRUK_SEKMELERI[0];

  const talepler = await tumSatirlar<Talep>("destek talepleri", (bas, son) =>
    supabase.from("support_tickets")
      .select("id,subject,category,priority,status,last_message_at,created_at,organization_id,organizations(name,display_name)")
      .order("last_message_at", { ascending: false })
      .order("id")
      .range(bas, son));

  const simdi = new Date();
  const sayi = (anahtar: string) => talepler.filter((t) => anahtar === "tumu" || kuyrukHali(t.status) === anahtar).length;
  const yanitBekleyen = talepler.filter((t) => kuyrukHali(t.status) === "yanit");
  const geciken = yanitBekleyen.filter((t) => gecikmisMi(t.last_message_at, simdi)).length;
  const acil = yanitBekleyen.filter((t) => t.priority === "urgent" || t.priority === "high").length;
  const gosterilen = kuyrukSirala(talepler.filter((t) => sekme.anahtar === "tumu" || kuyrukHali(t.status) === sekme.anahtar));

  return <main className="plt talep cari ekip finans-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">DESTEK</small>
        <h1>Destek talepleri</h1>
        <p className="ek-alt">
          Kurumların açtığı talepler. Yanıt yazdığınızda talep &quot;Müşteri bekleniyor&quot;a geçer ve kuruma
          panel bildirimi gider; müşteri yeniden yazınca talep kendiliğinden kuyruğa döner.
        </p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/destek/hazir">Hazır yanıtlar</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Destek özeti">
      <dl>
        <div><dt>Yanıt bekleyen</dt><dd className={yanitBekleyen.length ? "talep-uyari" : undefined}>{yanitBekleyen.length}</dd><small>{yanitBekleyen.length ? "Sıra bizde" : "Kuyruk boş"}</small></div>
        <div><dt>1 günü geçen</dt><dd className={geciken ? "talep-uyari" : undefined}>{geciken}</dd><small>{geciken ? "Yanıtsız 24 saatten uzun" : "Geciken yok"}</small></div>
        <div><dt>Acil / yüksek</dt><dd className={acil ? "talep-uyari" : undefined}>{acil}</dd><small>Yanıt bekleyenler arasında</small></div>
        <div><dt>Müşteri bekleniyor</dt><dd>{sayi("musteri")}</dd><small>Sıra müşteride</small></div>
      </dl>
    </nav>

    <div className="ek-arac">
      <nav className="ek-segment" aria-label="Talep durumu">
        {KUYRUK_SEKMELERI.map((s) => (
          <Link key={s.anahtar} href={`/panel/platform/destek?durum=${s.anahtar}`} className={s === sekme ? "is-active" : undefined} aria-current={s === sekme ? "page" : undefined}>
            {s.ad} · {sayi(s.anahtar)}
          </Link>
        ))}
      </nav>
    </div>

    <section className="panel-card talep-bilgi" aria-label={sekme.ad}>
      {gosterilen.length === 0 ? (
        <div className="crm-empty-state talep-bos-kutu ek-bos">
          <h2>{sekme.anahtar === "yanit" ? "Yanıt bekleyen talep yok" : "Bu sekmede talep yok"}</h2>
          <p>Kurumlar panelin Destek ekranından talep açtığında burada görünür.</p>
        </div>
      ) : (
        <div className="talep-tablo">
          <table className="crm-data-table">
            <thead><tr><th>Kurum ve konu</th><th>Kategori</th><th>Öncelik</th><th className="crm-col-date">Son mesaj</th><th>Durum</th></tr></thead>
            <tbody>
              {gosterilen.map((t) => {
                const href = `/panel/platform/destek/${t.id}`;
                const bekliyor = kuyrukHali(t.status) === "yanit";
                const gec = bekliyor && gecikmisMi(t.last_message_at, simdi);
                const durum = { etiket: bekliyor ? `${beklemeSuresi(t.last_message_at, simdi)} bekliyor` : DURUM_ADI[t.status] ?? t.status, ton: bekliyor ? (gec ? "danger" : "gold") : t.status === "waiting_customer" ? "info" : "neutral" };
                return (
                  <tr key={t.id}>
                    <td data-label="Kurum ve konu">
                      <Link className="crm-row-link ek-kisi" href={href}>
                        <span className="ek-avatar" aria-hidden="true">{basHarfleri(kurumAdi(t))}</span>
                        <span className="ek-kisi-metin"><span className="crm-table-title" title={t.subject}>{t.subject}</span><span className="crm-table-sub">{kurumAdi(t)}</span></span>
                      </Link>
                    </td>
                    <td data-label="Kategori">{KATEGORI_ADI[t.category] ?? t.category}</td>
                    <td data-label="Öncelik"><span className="status-pill" data-tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "gold" : "neutral"}>{ONCELIK_ADI[t.priority] ?? t.priority}</span></td>
                    <td className="crm-col-date" data-label="Son mesaj">{tarihSaat(t.last_message_at)}</td>
                    <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                    <MobilSatir href={href} baslik={t.subject} durum={durum} alt={[kurumAdi(t), ONCELIK_ADI[t.priority], tarihSaat(t.last_message_at)]} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SatirTiklama />
        </div>
      )}
    </section>
  </main>;
}
