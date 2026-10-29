import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory } from "@/lib/member-directory";
import { aramaDeseni } from "@/lib/liste-arama";
import { ara } from "@/lib/konsol-arama";
import { productName } from "@/lib/products";
import { PROFORMA_DURUM_ADI, proformaGorunumu } from "@/lib/proforma";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ikincil } from "../konsol-oku";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { para, sayi, tarih } from "../bicim";
import { kisilereTopla, kisininRolu } from "../kullanicilar/kisiler";
import "../platform.css";
import "../konsol-ui.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../hr/hr.css";
import "../finans.css";
import "./ara.css";

export const metadata: Metadata = { title: "Konsolda ara", robots: { index: false, follow: false } };

/*
  KONSOL ARAMASI (29.10.2026, "tek kutudan müşteri, kullanıcı ve proforma
  numarası"). Ctrl+K'daki "konsolda ara" satırı buraya geliyor; eskiden
  yalnızca Müşteriler listesinin araması açılıyordu ve bir kişiyi ya da
  bir proforma numarasını aramanın yolu yoktu.

  Kural (Türkçe duyarsız, bütün kelimeler, sıralama) lib/konsol-arama.ts'te.
  Okuma:
   - Kurumlar ve kullanıcılar BELLEKTE süzülüyor: ikisi de küçük ve
     Postgres'in ilike'ı "ş"yi "s" saymıyor. Kullanıcılar Kullanıcılar
     sayfasıyla aynı rehberden (üç ürün, e-postayla birleşmiş kişi).
   - Bireysel aboneler ve proformalar büyüyebilen tablolar: veritabanında
     ilike ile, sınırlı. Proforma numarası ("PRF-2026-0012") ve müşteri
     adı aranıyor.
  Bir kaynak okunamazsa o grup "okunamadı" diyor, sayfa düşmüyor: arama
  bir yan araç, bir kaynağın arızası ötekileri götürmemeli.
*/
const SINIR = 20;

export default async function AraPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();
  const { q } = await searchParams;
  const sorgu = (q ?? "").trim().slice(0, 80);
  const desen = aramaDeseni(sorgu);

  const bos = { data: [], error: null };
  const [kurumSonucu, aboneSonucu, proformaSonucu, rehber] = desen ? await Promise.all([
    supabase.from("platform_kiraci_liste").select("id,name,display_name,slug,custom_domain,contact_phone,davet_eposta,license_status,plan_code"),
    supabase.from("product_subscribers").select("id,product,email,full_name,status")
      .or(`email.ilike.%${desen}%,full_name.ilike.%${desen}%`).order("created_at", { ascending: false }).limit(SINIR),
    admin
      ? admin.from("platform_proformalari").select("id,proforma_no,musteri_adi,product,toplam,para_birimi,durum,gecerlilik_tarihi,duzenleme_tarihi")
          .or(`proforma_no.ilike.%${desen}%,musteri_adi.ilike.%${desen}%`).order("created_at", { ascending: false }).limit(SINIR)
      : bos,
    getMemberDirectory().catch((hata: unknown) => { console.error("[ara] kullanıcı rehberi okunamadı", hata instanceof Error ? hata.message : hata); return null; }),
  ]) : [bos, bos, bos, null];

  const kurumOkumasi = ikincil(kurumSonucu as { data: { id: string; name: string; display_name: string | null; slug: string; custom_domain: string | null; contact_phone: string | null; davet_eposta: string | null; license_status: string | null; plan_code: string | null }[] | null; error: { message: string } | null }, "Kurumlar");
  const aboneOkumasi = ikincil(aboneSonucu as { data: { id: string; product: string; email: string; full_name: string | null; status: string }[] | null; error: { message: string } | null }, "Bireysel aboneler");
  const proformaOkumasi = ikincil(proformaSonucu as { data: { id: string; proforma_no: string; musteri_adi: string; product: string; toplam: number; para_birimi: string | null; durum: string; gecerlilik_tarihi: string; duzenleme_tarihi: string }[] | null; error: { message: string } | null }, "Proformalar");

  const kurumlar = desen ? ara(kurumOkumasi.veri ?? [], sorgu, (k) => ({ ad: k.display_name || k.name, diger: [k.name, k.slug, k.custom_domain, k.contact_phone, k.davet_eposta] }), SINIR) : [];
  const aboneler = aboneOkumasi.veri ?? [];
  const kisiler = desen && rehber ? ara(kisilereTopla(rehber.rows), sorgu, (k) => ({ ad: k.ad, diger: [k.email, k.telefon, k.unvan, ...k.uyelikler.map((u) => u.kapsam)] }), SINIR) : [];
  const proformalar = proformaOkumasi.veri ?? [];
  const bugun = todayInIstanbul();
  /*
    SAYI VE "NEREDE ARANDI" CÜMLESİ AYNI LİSTEDEN (30.10.2026).

    İkisi ayrı yazılıydı ve saptılar: toplam DÖRT koleksiyonu sayıyor,
    cümle ÜÇÜNÜ söylüyordu ("müşteri, kullanıcı ve proforma").
    "agca" araması "2 sonuç" diyordu; biri bireysel aboneydi ve
    kullanıcı cümlede geçmediği için sayı ile liste birbirini
    tutmuyor görünüyordu.

    Kutudaki sayıyla ekranın anlattığı yerin ayrı yazılması, bu depoda
    tekrar eden bir kusur; burada ikisi tek kaynaktan türüyor.
  */
  const bolumler = [
    { tur: "müşteri", adet: kurumlar.length },
    { tur: "kullanıcı", adet: kisiler.length },
    { tur: "proforma", adet: proformalar.length },
    { tur: "bireysel abone", adet: aboneler.length },
  ];
  const toplam = bolumler.reduce((t, b) => t + b.adet, 0);
  /* "a, b, c ve d": son öğeden önce virgül değil "ve". */
  const nerede = bolumler.map((b) => b.tur).reduce((cumle, tur, sira, hepsi) =>
    sira === 0 ? tur : sira === hepsi.length - 1 ? `${cumle} ve ${tur}` : `${cumle}, ${tur}`, "");

  return <main className="plt talep cari ekip finans-sayfa konsol-ara">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">KONSOL</small>
        <h1>{sorgu ? `“${sorgu}”` : "Konsolda ara"}</h1>
        <p className="ek-alt">{desen ? `${sayi(toplam)} sonuç · ${nerede}` : "Müşteri adı, e-posta, telefon, kullanıcı, bireysel abone ya da proforma numarası yazın."}</p>
      </div>
    </header>

    <form action="/panel/platform/ara" className="talep-ara ka-kutu" role="search">
      <input type="search" name="q" defaultValue={sorgu} placeholder="Ör. Akademik Merkez, ayse@…, 0532…, PRF-2026-0012" aria-label="Konsolda ara" autoFocus />
    </form>

    {!desen ? (
      sorgu ? <KNot>En az iki harf yazın.</KNot> : null
    ) : (
      <div className="ka-izgara">
        <KKart baslik="Kurumlar" sag={<span className="status-pill">{sayi(kurumlar.length)}</span>}>
          {kurumOkumasi.okunamadi ? <KBos baslik="Kurumlar okunamadı" aciklama="Sorgu yanıt vermedi; “sonuç yok” demek değil." />
            : kurumlar.length ? <KListe>{kurumlar.map((k) => (
              <KOge key={k.id} href={`/panel/platform/musteriler/${k.id}`} simge={k.display_name || k.name} baslik={k.display_name || k.name}
                alt={[k.custom_domain || `${k.slug}.arvo-os.com`, k.davet_eposta, k.contact_phone].filter(Boolean).join(" · ")} />
            ))}</KListe> : <KBos baslik="Eşleşen kurum yok" />}
        </KKart>

        <KKart baslik="Kullanıcılar" sag={<span className="status-pill">{sayi(kisiler.length)}</span>}>
          {!rehber ? <KBos baslik="Kullanıcılar okunamadı" aciklama="Kullanıcı rehberi yanıt vermedi; “sonuç yok” demek değil." />
            : kisiler.length ? <KListe>{kisiler.map((k) => (
              <KOge key={k.anahtar} href={`/panel/platform/kullanicilar/${k.kimlik}`} simge={k.ad} baslik={k.ad}
                alt={[k.email !== k.ad ? k.email : null, kisininRolu(k), k.uyelikler.map((u) => u.kapsam).join(", ")].filter(Boolean).join(" · ")}
                durum={k.acik ? null : { etiket: k.sebep ?? "Erişim kapalı", ton: "danger" }} />
            ))}</KListe> : <KBos baslik="Eşleşen kullanıcı yok" />}
          {rehber && !rehber.arvolabReachable ? <KNot ton="uyari">ArvoLab&apos;a ulaşılamadı; oradaki kullanıcılar sonuçta yok.</KNot> : null}
        </KKart>

        <KKart baslik="Proformalar" sag={<span className="status-pill">{sayi(proformalar.length)}</span>}>
          {proformaOkumasi.okunamadi ? <KBos baslik="Proformalar okunamadı" aciklama={admin ? "Sorgu yanıt vermedi; “sonuç yok” demek değil." : "Sunucu anahtarı tanımlı değil."} />
            : proformalar.length ? <KListe>{proformalar.map((p) => {
              const durum = proformaGorunumu(p.durum, p.gecerlilik_tarihi, bugun);
              return (
                <KOge key={p.id} href={`/panel/platform/tahsilat/proforma/${p.id}`} baslik={p.proforma_no}
                  alt={[p.musteri_adi, productName(p.product as Parameters<typeof productName>[0]), tarih(`${p.duzenleme_tarihi}T12:00:00Z`)].join(" · ")}
                  deger={para(Number(p.toplam), p.para_birimi || "TRY")}
                  durum={{ etiket: PROFORMA_DURUM_ADI[durum], ton: durum === "odendi" ? "success" : durum === "bekliyor" ? "info" : durum === "suresi_doldu" ? "warning" : "neutral" }} />
              );
            })}</KListe> : <KBos baslik="Eşleşen proforma yok" />}
        </KKart>

        <KKart baslik="Bireysel aboneler" sag={<span className="status-pill">{sayi(aboneler.length)}</span>}>
          {aboneOkumasi.okunamadi ? <KBos baslik="Aboneler okunamadı" aciklama="Sorgu yanıt vermedi; “sonuç yok” demek değil." />
            : aboneler.length ? <KListe>{aboneler.map((a) => (
              <KOge key={a.id} href="/panel/platform/subscribers" simge={a.full_name || a.email} baslik={a.full_name || a.email}
                alt={[a.full_name ? a.email : null, productName(a.product as Parameters<typeof productName>[0])].filter(Boolean).join(" · ")} />
            ))}</KListe> : <KBos baslik="Eşleşen abone yok" />}
        </KKart>
      </div>
    )}

    {desen && !toplam ? <p className="ka-ipucu">Hiçbir şey bulunamadı. <Link href={`/panel/platform/musteriler?ara=${encodeURIComponent(sorgu)}`}>Müşteriler listesinde ara →</Link></p> : null}
  </main>;
}
