import { konsolAlaniniAc } from "../konsol-alani";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { beklemeSuresi, DURUM_ADI, gecikmisMi, kuyrukHali, kuyrukSirala, KATEGORI_ADI, KUYRUK_SEKMELERI, ONCELIK_ADI, sureYazisi, yanitHizi } from "@/lib/destek-kuyrugu";
import { basHarfleri, tarihSaat } from "../bicim";
import { KonsolPanelAlanlar, KonsolPanelBas, KonsolPanelBos } from "../konsol-liste";
import { Gorusme, gorusmeAlanlari, gorusmeDurumu, gorusmeVerisi } from "./gorusme";
import { kaydirmaAnahtari, listeAdresi } from "@/lib/konsol/liste-secimi";
import { KonsolListeKaydirma } from "../konsol-liste-kaydirma";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import "../platform.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";
import "../konsol-liste.css";
import "./destek.css";

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

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const simdiOku = () => new Date();

export default async function DestekKuyrugu({ searchParams }: { searchParams: Promise<{ durum?: string; secili?: string }> }) {
  const { supabase, isPlatformOwner, konsolKapsami } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  konsolAlaniniAc(konsolKapsami, "destek");
  const { durum: istenen, secili: seciliParam } = await searchParams;
  const seciliId = seciliParam?.trim() || null;
  const sekme = KUYRUK_SEKMELERI.find((s) => s.anahtar === istenen) ?? KUYRUK_SEKMELERI[0];
  /* Sekme ve seçim adresin alanları: yenileme aynı ekranı getiriyor,
     tarayıcı geri/ileri liste ile görüşme arasında geziyor. */
  const destekAdresi = (degisiklik: Record<string, string | null>) =>
    listeAdresi("/panel/platform/destek", { durum: istenen ?? null, secili: seciliId }, degisiklik,
      { durum: KUYRUK_SEKMELERI[0].anahtar });

  const talepler = await tumSatirlar<Talep>("destek talepleri", (bas, son) =>
    supabase.from("support_tickets")
      .select("id,subject,category,priority,status,last_message_at,created_at,organization_id,organizations(name,display_name)")
      .order("last_message_at", { ascending: false })
      .order("id")
      .range(bas, son));

  const simdi = simdiOku();
  /*
    YANIT HIZI (lib/destek-kuyrugu yanitHizi): son 30 günde açılan
    talepler ve onlara yazılan EKİP mesajları. Mesajlar talep kimliğiyle,
    100'lük dilimlerle okunuyor (uzun bir `in` adresi taşırırdı). Okunamazsa
    şeritteki iki kutu "—" diyor; kuyruk yine çiziliyor.
  */
  const otuzGunOnce = new Date(simdi.getTime() - 30 * 86_400_000).toISOString();
  const sonTalepler = talepler.filter((t) => t.created_at >= otuzGunOnce);
  let hiz: ReturnType<typeof yanitHizi> | null = null;
  try {
    const mesajlar: { ticket_id: string; is_staff: boolean; created_at: string }[] = [];
    for (let i = 0; i < sonTalepler.length; i += 100) {
      const dilim = sonTalepler.slice(i, i + 100).map((t) => t.id);
      mesajlar.push(...await tumSatirlar<{ ticket_id: string; is_staff: boolean; created_at: string }>("destek yanıtları", (bas, son) =>
        supabase.from("support_messages").select("ticket_id,is_staff,created_at").in("ticket_id", dilim).eq("is_staff", true).order("id").range(bas, son)));
    }
    hiz = yanitHizi(sonTalepler, mesajlar, simdi);
  } catch (hata) {
    console.error("[destek] yanıt hızı okunamadı", hata instanceof Error ? hata.message : hata);
  }
  const sayi = (anahtar: string) => talepler.filter((t) => anahtar === "tumu" || kuyrukHali(t.status) === anahtar).length;
  const yanitBekleyen = talepler.filter((t) => kuyrukHali(t.status) === "yanit");
  const geciken = yanitBekleyen.filter((t) => gecikmisMi(t.last_message_at, simdi)).length;
  const acil = yanitBekleyen.filter((t) => t.priority === "urgent" || t.priority === "high").length;
  const gosterilen = kuyrukSirala(talepler.filter((t) => sekme.anahtar === "tumu" || kuyrukHali(t.status) === sekme.anahtar));
  /* Seçili görüşme sağ panelde. Talep hiç yoksa panel "bulunamadı"
     diyor; duruyor ama sekmede görünmüyorsa nedenini yazıyor —
     sessizce boşalan panel ikisi için de yanlış cevap. */
  const gorusme = seciliId ? await gorusmeVerisi(supabase, seciliId) : null;
  const seciliListede = Boolean(gorusme && gosterilen.some((t) => t.id === gorusme.id));

  return <main className="plt talep cari ekip finans-sayfa liste-sayfa">
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
        {/* Son 30 gün: ilk ekip yanıtına kadar geçen süre (medyan) ve 24 saatte yanıtlanan oranı. */}
        <div>
          <dt>İlk yanıt (medyan)</dt>
          <dd className={hiz?.medyanDakika === null || !hiz ? "talep-bos" : undefined}>{hiz && hiz.medyanDakika !== null ? sureYazisi(hiz.medyanDakika) : "—"}</dd>
          <small>{hiz ? `son 30 gün · ${hiz.yanitlanan}/${hiz.talep} talep yanıtlandı` : "okunamadı"}</small>
        </div>
        <div>
          <dt>24 saatte yanıt</dt>
          <dd className={hiz?.gunIcindeOran !== null && hiz && hiz.gunIcindeOran < 80 ? "talep-uyari" : hiz?.gunIcindeOran !== null && hiz ? "cari-arti" : "talep-bos"}>{hiz && hiz.gunIcindeOran !== null ? `%${hiz.gunIcindeOran}` : "—"}</dd>
          <small>{hiz ? (hiz.yanitsiz ? `${hiz.yanitsiz} talep henüz yanıtsız` : "yanıtsız talep yok") : "okunamadı"}</small>
        </div>
      </dl>
    </nav>

    {/*
      LİSTE – SEÇİLİ GÖRÜŞME (27.11.2026, onaylı tasarım). Müşteriler
      ve Ödeme onaylarıyla aynı iskelet: ortada talep listesi, sağda
      seçili görüşme. Konuşma, yanıt kutusu ve durum formu AYNI
      bileşenden (./gorusme) — /destek/[id] rotası da onu çiziyor ve
      paylaşılmış bağlantılar çalışmaya devam ediyor.
    */}
    <div className="kl-duzen" data-secim={gorusme ? "var" : "yok"}>
      <section className="kl-liste" aria-label={sekme.ad}>
      <div className="ek-arac">
        <nav className="ek-segment" aria-label="Talep durumu">
          {KUYRUK_SEKMELERI.map((s) => (
            /* Sekme SEÇİMİ TAŞIR: kullanıcı sekme değiştirirken açtığı
               görüşmeyi kaybetmiyor. */
            <Link key={s.anahtar} href={destekAdresi({ durum: s.anahtar })} className={s === sekme ? "is-active" : undefined} aria-current={s === sekme ? "page" : undefined}>
              {s.ad} · {sayi(s.anahtar)}
            </Link>
          ))}
        </nav>
      </div>
      <KonsolListeKaydirma anahtar={kaydirmaAnahtari("/panel/platform/destek", { durum: istenen })} adres={destekAdresi({})} />
      <div className="kl-liste-govde">
      {gosterilen.length === 0 ? (
        <div className="crm-empty-state talep-bos-kutu ek-bos">
          <h2>{sekme.anahtar === "yanit" ? "Yanıt bekleyen talep yok" : "Bu sekmede talep yok"}</h2>
          <p>Kurumlar panelin Destek ekranından talep açtığında burada görünür.</p>
        </div>
      ) : (
        <div className="talep-tablo">
          <table className="crm-data-table">
            {/* ÜÇ SÜTUN: liste sütunu 632 px ve beş sütunla durum rozeti
                sağdan kırpılıyordu (27.11.2026 ölçümü). Kategori ve
                öncelik satırın alt yazısına indi; ikisi de seçili
                görüşmenin künyesinde tam hâliyle duruyor. */}
            <thead><tr><th>Kurum ve konu</th><th className="crm-col-date">Son mesaj</th><th>Durum</th></tr></thead>
            <tbody>
              {gosterilen.map((t) => {
                /* Satır SEÇİYOR: görüşme sağ panelde açılıyor.
                   /destek/[id] paylaşılmış bağlantı olarak duruyor. */
                const href = destekAdresi({ secili: t.id });
                const bekliyor = kuyrukHali(t.status) === "yanit";
                const gec = bekliyor && gecikmisMi(t.last_message_at, simdi);
                const durum = { etiket: bekliyor ? `${beklemeSuresi(t.last_message_at, simdi)} bekliyor` : DURUM_ADI[t.status] ?? t.status, ton: bekliyor ? (gec ? "danger" : "gold") : t.status === "waiting_customer" ? "info" : "neutral" };
                return (
                  <tr key={t.id} className={t.id === seciliId ? "is-secili" : undefined}>
                    <td data-label="Kurum ve konu">
                      <Link className="crm-row-link ek-kisi" href={href} aria-current={t.id === seciliId ? "true" : undefined}>
                        <span className="ek-avatar" aria-hidden="true">{basHarfleri(kurumAdi(t))}</span>
                        <span className="ek-kisi-metin">
                          <span className="crm-table-title" title={t.subject}>{t.subject}</span>
                          <span className="crm-table-sub">{kurumAdi(t)} · {KATEGORI_ADI[t.category] ?? t.category} · {ONCELIK_ADI[t.priority] ?? t.priority}</span>
                        </span>
                      </Link>
                    </td>
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
      </div>
      </section>

      <aside className="kl-panel" aria-label={gorusme ? `${gorusme.subject} görüşmesi` : "Görüşme"}>
        {gorusme ? (
          <>
            <Link className="kl-geri" href={destekAdresi({ secili: null })}><span aria-hidden="true">‹</span> Listeye dön</Link>
            {!seciliListede ? (
              <p className="kl-suzgec-disi">
                Bu talep geçerli sekmede görünmüyor.{" "}
                <Link href={destekAdresi({ durum: "tumu" })}>Bütün talepleri göster →</Link>
              </p>
            ) : null}
            <KonsolPanelBas baslik={gorusme.subject}
              durum={{ etiket: gorusmeDurumu(gorusme.status).etiket, ton: gorusmeDurumu(gorusme.status).ton }}
              kapatAdresi={destekAdresi({ secili: null })} />
            <KonsolPanelAlanlar alanlar={gorusmeAlanlari(gorusme)} />
            <Gorusme veri={gorusme} />
          </>
        ) : seciliId ? (
          <>
            <Link className="kl-geri" href={destekAdresi({ secili: null })}><span aria-hidden="true">‹</span> Listeye dön</Link>
            <KonsolPanelBos ton="uyari" baslik="Talep bulunamadı"
              aciklama="Bu talep silinmiş ya da artık erişilebilir değil. Listeden başka bir talep seçebilirsiniz."
              eylem={<Link className="panel-secondary" href={destekAdresi({ secili: null })}>Listeye dön</Link>} />
          </>
        ) : (
          <KonsolPanelBos baslik="Görüşme seçilmedi"
            aciklama="Soldaki listeden bir talep seçin; konuşma ve yanıt kutusu burada açılır." />
        )}
      </aside>
    </div>
  </main>;
}
