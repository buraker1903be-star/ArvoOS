import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { cronAralikMetni, cronIsleri } from "@/lib/cron-isleri";
import { basariOrani, kosuOzeti, sureMetni, type Kosu } from "@/lib/cron-gecmisi";
import { hataTeshisi, VERCEL_GUNLUGU } from "@/lib/hata-teshisi";
import { zorunlu } from "../../konsol-oku";
import { KKart, KNot } from "../../konsol-ui";
import { sayi, tarihSaat } from "../../bicim";
import { TeshisKarti } from "../teshis-karti";
import "../../platform.css";
import "../../../hr/hr.css";
import "../../../crm/crm.css";
import "../../../crm/kayit-detay/kayit-detay.css";
import "../../finans.css";

export const metadata: Metadata = { title: "Zamanlanmış iş", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
  ZAMANLANMIŞ İŞİN AYRINTISI (02.11.2026, lib/cron-gecmisi). Son 50
  çalışma: zaman, süre, sonuç ve işin kendi yazdığı ayrıntı (sayaçlar,
  hata metni). Arıza "ne zamandan beri" ve "hangi çalışmada ne dedi"
  soruları burada yanıtlanıyor; Vercel günlüğüne gitmeden önce.

  İş vercel.json'dan tanınıyor: adresteki yol listede değilse 404 —
  kayıt tablosundaki rastgele bir metni sayfa olarak açmak istemiyoruz.
  Başarı oranı head sorgularından (son 24 saat), listeden değil: liste
  50 satırla sınırlı ve iki dakikada bir koşan iş günde 720 kez çalışıyor.
*/
const LISTE = 50;
const SONUC: Record<string, { etiket: string; ton: string }> = {
  tamam: { etiket: "Tamam", ton: "success" },
  eksik: { etiket: "Kısmen", ton: "warning" },
  hata: { etiket: "Hata", ton: "danger" },
};

// Şimdiki zaman bileşen dışında okunur (react-hooks/purity).
const gunOnce = () => new Date(Date.now() - 86_400_000).toISOString();

/** Ayrıntı alanındaki hata metni (dizi ya da metin). */
function hataMetni(ayrinti: unknown): string | null {
  const hata = (ayrinti as { hata?: unknown } | null)?.hata;
  if (typeof hata === "string" && hata) return hata;
  if (Array.isArray(hata)) return hata.filter((h) => typeof h === "string").join("\n") || null;
  return null;
}

export default async function CronIsiSayfasi({ searchParams }: { searchParams: Promise<{ yol?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const { yol } = await searchParams;
  const is = cronIsleri().find((x) => x.yol === yol);
  if (!is) notFound();

  const birGunOnce = gunOnce();
  const [liste, toplam, basarili] = await Promise.all([
    supabase.from("platform_cron_kayitlari").select("id,sonuc,basladi_at,bitti_at,sure_ms,ayrinti")
      .eq("is_adi", is.yol).order("basladi_at", { ascending: false }).limit(LISTE),
    supabase.from("platform_cron_kayitlari").select("id", { count: "exact", head: true }).eq("is_adi", is.yol).gte("basladi_at", birGunOnce),
    supabase.from("platform_cron_kayitlari").select("id", { count: "exact", head: true }).eq("is_adi", is.yol).gte("basladi_at", birGunOnce).eq("sonuc", "tamam"),
  ]);
  const kosular = (zorunlu(liste, "Çalışma kayıtları") ?? []) as (Kosu & { id: number; bitti_at: string | null })[];
  /* Head sorgusunun verisi her zaman boş; sayı count'ta. Okunamazsa "—" (sıfır değil). */
  if (toplam.error) console.error("[sağlık] son 24 saat sayılamadı", toplam.error.message);
  if (basarili.error) console.error("[sağlık] başarılı çalışmalar sayılamadı", basarili.error.message);
  const gunToplam = toplam.error ? null : toplam.count ?? 0;
  const gunBasarili = basarili.error ? null : basarili.count ?? 0;
  const oran = gunToplam !== null && gunBasarili !== null ? basariOrani(gunToplam, gunBasarili) : null;
  const ozet = kosuOzeti(kosular);
  const sonHata = kosular.find((k) => k.sonuc !== "tamam");
  const sonHataMetni = sonHata ? hataMetni(sonHata.ayrinti) : null;

  return <main className="plt talep cari ekip sistem-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/saglik?sekme=isler">SİSTEM SAĞLIĞI · ZAMANLANMIŞ İŞLER</Link></small>
        <h1>{is.ad}</h1>
        <p className="ek-alt">{is.aciklama} Beklenen: {cronAralikMetni(is.aralikDk)}. Yol: <code>{is.yol}</code></p>
      </div>
      <div className="talep-bas-eylem">
        <a className="panel-secondary" href={VERCEL_GUNLUGU} target="_blank" rel="noreferrer">Vercel günlüğü</a>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="İşin özeti">
      <dl>
        <div><dt>Son 24 saat</dt><dd>{gunToplam === null ? "—" : sayi(gunToplam)}</dd><small>çalışma</small></div>
        <div><dt>Başarı oranı</dt><dd className={oran === null ? "talep-bos" : oran < 95 ? "talep-uyari" : "cari-arti"}>{oran === null ? "—" : `%${oran}`}</dd><small>son 24 saat</small></div>
        <div><dt>Üst üste düşen</dt><dd className={ozet.ardisikHata ? "talep-uyari" : undefined}>{ozet.ardisikHata}{ozet.diziPencereyiAsiyor ? "+" : ""}</dd><small>{ozet.hataBaslangici ? `${tarihSaat(ozet.hataBaslangici)}'den beri` : "son çalışma başarılı"}</small></div>
        <div><dt>Ortalama süre</dt><dd>{sureMetni(ozet.ortalamaMs)}</dd><small>son {sayi(kosular.length)} çalışma</small></div>
      </dl>
    </nav>

    {ozet.diziPencereyiAsiyor ? <KNot ton="uyari">Okunan son {LISTE} çalışmanın hepsi başarısız: düşüş bundan da eskiye uzanıyor olabilir (kayıtlar 14 gün saklanıyor).</KNot> : null}

    {sonHata ? (
      <TeshisKarti baslik={`Son başarısız çalışma · ${tarihSaat(sonHata.basladi_at)}`}
        neZamandir={ozet.hataBaslangici ? `${tarihSaat(ozet.hataBaslangici)}'den beri ${ozet.ardisikHata} kez üst üste` : "arada bir düşüyor; son çalışma başarılı"}
        hata={sonHataMetni} teshis={hataTeshisi(sonHataMetni)} gunlukYolu={is.yol} />
    ) : null}

    <KKart baslik="Son çalışmalar" aciklama={`En yeni ${LISTE} çalışma; ayrıntı işin kendi yazdığı sayaçlar ve hata metni.`}>
      {kosular.length ? (
        <div className="talep-tablo fn-ic-tablo">
          <table className="crm-data-table">
            <thead><tr><th className="crm-col-date">Başladı</th><th>Süre</th><th>Sonuç</th><th>Ayrıntı</th></tr></thead>
            <tbody>
              {kosular.map((k) => {
                const durum = SONUC[k.sonuc] ?? { etiket: k.sonuc, ton: "neutral" };
                const hata = hataMetni(k.ayrinti);
                const ayrinti = k.ayrinti && typeof k.ayrinti === "object" && Object.keys(k.ayrinti).length ? JSON.stringify(k.ayrinti) : null;
                return (
                  <tr key={k.id}>
                    <td className="crm-col-date" data-label="Başladı">{tarihSaat(k.basladi_at)}</td>
                    <td data-label="Süre">{sureMetni(k.sure_ms)}</td>
                    <td data-label="Sonuç"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                    <td data-label="Ayrıntı">
                      {hata ? <span className="crm-table-title talep-uyari" title={hata}>{hata}</span> : null}
                      {ayrinti ? <code className="sy-ayrinti" title={ayrinti}>{ayrinti}</code> : hata ? null : <span className="crm-table-sub">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="pu-bos">Bu işin kayıtlı çalışması yok (kayıtlar 14 gün saklanıyor).</p>}
    </KKart>
  </main>;
}
