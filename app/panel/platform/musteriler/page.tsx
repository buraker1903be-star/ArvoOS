import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { productName } from "@/lib/products";
import { para, sayi, tarih } from "../bicim";
import "../../settings/settings.css";
import "../platform.css";
// Panelin liste sayfası kalıbı: talep-bas, kayit-serit, talep-izgara.
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  MÜŞTERİLER (14.10.2026).

  Konsolda müşteri iki ayrı ekrandaydı: "Kiracılar" (kurumlar) ve
  "Bireysel aboneler". İkisi de aynı soruyu yanıtlıyordu — "bize kim
  ödüyor, kimin erişimi açık" — ama kurucunun iki ayrı yere bakması,
  iki ayrı sayım görmesi ve toplamı kafasında birleştirmesi gerekiyordu.
  Tek liste, iki süzgeç: Kurumsal ve Bireysel (panelin işler listesindeki
  kalıbın aynısı).

  Düzen de panelin liste sayfalarıyla aynı: SOLDA liste, SAĞDA
  istatistik kartı.

  Sayfa OKUNUR. Kurumsal satır kiracı dosyasına, bireysel satır abonelik
  ekranına götürür; düzenleme oralarda yapılır. Aynı işi iki yerde
  yapılabilir kılmak, birinin kuralı atlaması demek.
*/

type Kurum = {
  id: string;
  name: string;
  display_name: string | null;
  kind: string | null;
  provisioning_state: string;
  license_status: string | null;
  monthly_fee: number | null;
  user_limit: number | null;
  aktif_uye: number;
};

type Abone = {
  id: string;
  product: string;
  email: string;
  full_name: string | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
};

type Satir = {
  anahtar: string;
  tur: "kurumsal" | "bireysel";
  ad: string;
  alt: string;
  href: string;
  durum: string;
  ton: "success" | "warning" | "danger" | "neutral";
  ucret: number;
  olusma: string | null;
};

const KURUM_DURUMU: Record<string, { ad: string; ton: Satir["ton"] }> = {
  active: { ad: "Kullanımda", ton: "success" },
  trialing: { ad: "Denemede", ton: "warning" },
  past_due: { ad: "Ödeme gecikti", ton: "danger" },
  suspended: { ad: "Askıda", ton: "danger" },
  canceled: { ad: "İptal", ton: "neutral" },
};

const ODEYEN = new Set(["active", "past_due"]);

/* Deneme ya da aktif dönem sürüyorsa erişim açık (köprüdeki kuralın
   aynısı; abonelik ekranındaki hasAccess ile birebir). */
function bireyselErisim(abone: Abone, simdi: number) {
  if (abone.status === "trialing") return Boolean(abone.trial_ends_at && Date.parse(abone.trial_ends_at) > simdi);
  if (abone.status === "active") return !abone.current_period_end || Date.parse(abone.current_period_end) > simdi;
  return false;
}

/* Şimdiki zaman bileşen DIŞINDA okunuyor (react-hooks/purity): sunucu
   bileşeninin gövdesinde Date.now() çağırmak saf olmayan bir çağrı. */
function bireyselSatirlariKur(aboneler: Abone[]): Satir[] {
  const simdi = Date.now();
  return aboneler.map((abone) => {
    const acik = bireyselErisim(abone, simdi);
    return {
      anahtar: `b-${abone.id}`,
      tur: "bireysel" as const,
      ad: abone.full_name?.trim() || abone.email,
      /* Adı girilmemiş abonede ad zaten e-posta: alt satıra ikinci kez
         yazmak aynı adresi alt alta göstermek olurdu. */
      alt: abone.full_name?.trim()
        ? `${productName(abone.product as Parameters<typeof productName>[0])} · ${abone.email}`
        : productName(abone.product as Parameters<typeof productName>[0]),
      href: "/panel/platform/subscribers",
      durum: !acik ? "Erişim kapalı" : abone.status === "trialing" ? "Denemede" : "Ödüyor",
      ton: (!acik ? "danger" : abone.status === "trialing" ? "warning" : "success") as Satir["ton"],
      ucret: 0,
      olusma: abone.created_at,
    };
  });
}

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (deger: string) =>
  deger.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

export default async function MusterilerPage({ searchParams }: {
  searchParams: Promise<{ tur?: string; ara?: string }>;
}) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const { tur, ara } = await searchParams;
  const secilenTur = tur === "kurumsal" || tur === "bireysel" ? tur : null;
  const aranan = (ara ?? "").trim().slice(0, 80);

  /*
    İki kaynak, iki sorgu. Bireysel abone sınırı 1000: tamamını
    kapsamadığında ekranda yazıyor (eksikKapsam), sessiz bir eksilme yok.
  */
  const LISTE_SINIRI = 1000;
  const [{ data: kurumSatirlari }, { data: aboneSatirlari, count: aboneSayisi, error }] = await Promise.all([
    supabase.from("platform_kiraci_liste")
      .select("id,name,display_name,kind,provisioning_state,license_status,monthly_fee,user_limit,aktif_uye")
      .order("name"),
    supabase.from("product_subscribers")
      .select("id,product,email,full_name,status,trial_ends_at,current_period_end,created_at", { count: "exact" })
      .order("created_at", { ascending: false }).limit(LISTE_SINIRI),
  ]);
  if (error) throw new Error(`Bireysel aboneler okunamadı: ${error.message}`);

  /* Kendi markalarımız müşteri değil: aynı tüzel kişiliğin kendi kendine
     ödemesi geliri şişirir. Listede de sayımda da yoklar. */
  const kurumlar = ((kurumSatirlari ?? []) as unknown as Kurum[]).filter((kurum) => kurum.kind !== "internal");
  const aboneler = (aboneSatirlari ?? []) as Abone[];
  const toplamAbone = aboneSayisi ?? aboneler.length;
  const eksikKapsam = toplamAbone > aboneler.length;

  const kurumsalSatirlar: Satir[] = kurumlar.map((kurum) => {
    const durum = kurum.provisioning_state === "failed"
      ? { ad: "Kurulum hatası", ton: "danger" as const }
      : KURUM_DURUMU[kurum.license_status ?? ""] ?? { ad: "Kurulum sürüyor", ton: "warning" as const };
    return {
      anahtar: `k-${kurum.id}`,
      tur: "kurumsal",
      ad: kurum.display_name || kurum.name,
      alt: `${sayi(Number(kurum.aktif_uye))} kullanıcı${kurum.user_limit ? ` / ${sayi(Number(kurum.user_limit))} dahil` : ""}`,
      href: `/panel/platform?organization=${kurum.id}`,
      durum: durum.ad,
      ton: durum.ton,
      ucret: ODEYEN.has(kurum.license_status ?? "") ? Number(kurum.monthly_fee ?? 0) : 0,
      olusma: null,
    };
  });

  const bireyselSatirlar = bireyselSatirlariKur(aboneler);

  const tumSatirlar = [...kurumsalSatirlar, ...bireyselSatirlar];
  const desen = aranan ? sadelestir(aranan) : "";
  const liste = tumSatirlar
    .filter((satir) => (secilenTur ? satir.tur === secilenTur : true))
    .filter((satir) => (desen ? sadelestir(`${satir.ad} ${satir.alt}`).includes(desen) : true));

  /* Sağ karttaki istatistikler: süzgeçten BAĞIMSIZ, her zaman bütün
     müşterileri anlatır. Süzgeçle birlikte değişseydi "kaç müşterim var"
     sorusunun yanıtı seçili sekmeye göre değişirdi. */
  const kurumsalKullanimda = kurumsalSatirlar.filter((satir) => satir.durum === "Kullanımda").length;
  const kurumsalSorunlu = kurumsalSatirlar.filter((satir) => satir.ton === "danger").length;
  const bireyselOdeyen = bireyselSatirlar.filter((satir) => satir.durum === "Ödüyor").length;
  const bireyselDeneme = bireyselSatirlar.filter((satir) => satir.durum === "Denemede").length;
  const bireyselKapali = bireyselSatirlar.filter((satir) => satir.durum === "Erişim kapalı").length;
  const kurumsalGelir = kurumsalSatirlar.reduce((toplam, satir) => toplam + satir.ucret, 0);

  const adres = (yeni: { tur?: string | null; ara?: string | null }) => {
    const p = new URLSearchParams();
    const t = yeni.tur === undefined ? secilenTur : yeni.tur;
    const a = yeni.ara === undefined ? aranan : yeni.ara;
    if (t) p.set("tur", t);
    if (a) p.set("ara", a);
    const q = p.toString();
    return q ? `/panel/platform/musteriler?${q}` : "/panel/platform/musteriler";
  };

  return <main className="stg plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · MÜŞTERİLER</small>
        <h1>Müşteriler</h1>
        <p>Kurumsal kiracılar ve bireysel aboneler tek listede. Satıra tıklayınca kaydın kendi ekranı açılır.</p>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform">Kiracı kurulumu</Link>
        <Link className="panel-primary" href="/panel/platform/billing">Abonelikler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Müşteri özeti">
      <dl>
        <div className={!secilenTur ? "is-active" : undefined}>
          <dt>Tüm müşteri</dt>
          <dd><Link href={adres({ tur: null })} aria-current={!secilenTur ? "page" : undefined}>{sayi(tumSatirlar.length)}</Link></dd>
        </div>
        <div className={secilenTur === "kurumsal" ? "is-active" : undefined}>
          <dt>Kurumsal</dt>
          <dd><Link href={adres({ tur: "kurumsal" })} aria-current={secilenTur === "kurumsal" ? "page" : undefined}>{sayi(kurumsalSatirlar.length)}</Link></dd>
          <small>{sayi(kurumsalKullanimda)} kullanımda</small>
        </div>
        <div className={secilenTur === "bireysel" ? "is-active" : undefined}>
          <dt>Bireysel</dt>
          <dd><Link href={adres({ tur: "bireysel" })} aria-current={secilenTur === "bireysel" ? "page" : undefined}>{sayi(bireyselSatirlar.length)}</Link></dd>
          <small>{sayi(bireyselOdeyen)} ödüyor</small>
        </div>
        <div>
          <dt>Dikkat gerektiren</dt>
          <dd className={kurumsalSorunlu + bireyselKapali ? "talep-uyari" : undefined}>{sayi(kurumsalSorunlu + bireyselKapali)}</dd>
          <small>Kurulum hatası ya da kapalı erişim</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Müşteri listesi">
        <div className="ekip-suzgec talep-suzgec">
          <Link href={adres({ tur: null })} className={!secilenTur ? "is-active" : undefined}>Tümü <small>{sayi(tumSatirlar.length)}</small></Link>
          <Link href={adres({ tur: "kurumsal" })} className={secilenTur === "kurumsal" ? "is-active" : undefined}>Kurumsal <small>{sayi(kurumsalSatirlar.length)}</small></Link>
          <Link href={adres({ tur: "bireysel" })} className={secilenTur === "bireysel" ? "is-active" : undefined}>Bireysel <small>{sayi(bireyselSatirlar.length)}</small></Link>
          <form action="/panel/platform/musteriler" className="talep-ara" role="search">
            {secilenTur ? <input type="hidden" name="tur" value={secilenTur} /> : null}
            <input type="search" name="ara" defaultValue={aranan} placeholder="Ad, e-posta ya da ürün" aria-label="Müşteri ara" />
          </form>
        </div>

        {eksikKapsam ? (
          <p className="panel-muted">
            Bireysel abonelerin en yeni {sayi(aboneler.length)} kaydı listeleniyor (toplam {sayi(toplamAbone)}). Aradığınızı bulamazsanız arama kutusunu kullanın.
          </p>
        ) : null}

        {liste.length ? (
          <div className="plt-table-scroll">
            <table className="plt-table">
              <thead><tr><th>Müşteri</th><th>Tür</th><th>Durum</th><th>Aylık</th></tr></thead>
              <tbody>
                {liste.map((satir) => (
                  <tr key={satir.anahtar}>
                    <td>
                      <Link href={satir.href}>{satir.ad}</Link>
                      <small className="plt-substatus">{satir.alt}</small>
                    </td>
                    <td>{satir.tur === "kurumsal" ? "Kurumsal" : "Bireysel"}</td>
                    <td><span className="status-pill" data-tone={satir.ton}>{satir.durum}</span></td>
                    {/* Bireysel abonenin ücreti ürün planında, kişide değil:
                        kişi başına bir tutar yazmak yanlış olurdu. */}
                    <td>{satir.ucret ? para(satir.ucret) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-muted">
            {aranan ? `“${aranan}” ile eşleşen müşteri yok.` : "Bu süzgeçte müşteri yok."}
          </p>
        )}
      </section>

      <aside className="panel-card" aria-label="Müşteri istatistikleri">
        <h2>İstatistikler</h2>
        <p className="panel-muted">Süzgeçten bağımsız: her zaman bütün müşterileri anlatır.</p>

        <dl className="billing-summary">
          <div><dt>Kurumsal kiracı</dt><dd>{sayi(kurumsalSatirlar.length)}</dd></div>
          <div><dt>Kullanımda</dt><dd className="cari-arti">{sayi(kurumsalKullanimda)}</dd></div>
          <div><dt>Kurulum hatası ya da askıda</dt><dd className={kurumsalSorunlu ? "talep-uyari" : undefined}>{sayi(kurumsalSorunlu)}</dd></div>
          <div><dt>Kurumsal beklenen aylık</dt><dd>{para(kurumsalGelir)}</dd></div>
        </dl>

        <dl className="billing-summary">
          <div><dt>Bireysel abone</dt><dd>{sayi(bireyselSatirlar.length)}</dd></div>
          <div><dt>Ödüyor</dt><dd className="cari-arti">{sayi(bireyselOdeyen)}</dd></div>
          <div><dt>Denemede</dt><dd>{sayi(bireyselDeneme)}</dd></div>
          <div><dt>Erişimi kapalı</dt><dd className={bireyselKapali ? "talep-uyari" : undefined}>{sayi(bireyselKapali)}</dd></div>
        </dl>

        {/* Bireysel gelir burada YOK: tutar ürün planında duruyor ve
            abonelik ekranında ürün ürün hesaplanıyor. İki yerde ayrı
            hesaplamak, birinin sapması demek. */}
        <p className="panel-muted">
          Bireysel aylık gelir ve ürün fiyatları <Link href="/panel/platform/subscribers">Abonelik ayarları</Link> ekranında.
          Son kayıt {tarih(bireyselSatirlar[0]?.olusma ?? null)}.
        </p>
      </aside>
    </div>
  </main>;
}
