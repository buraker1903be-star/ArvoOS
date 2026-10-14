import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory, type DirectoryRow } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { formatPersonName } from "@/lib/format-name";
import { Fragment, type ReactNode } from "react";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { sayi, tarih, tarihSaat } from "../bicim";
import "../platform.css";

/*
  KULLANICILAR (14.10.2026, kurum sahibinin tarifi).

  Üç yaşam evresi, üç ayrı soru:

    1. Aktif  — bugün giriş yapabilen kişiler; iletişim bilgisiyle.
    2. Pasif  — girmişti, artık giremiyor. ASIL SORU "NEDEN": kurumu
                pasife mi aldı, lisans mı askıda, ödeme mi gecikti,
                aboneliğini mi iptal etti. Sebebi yazmayan bir pasif
                listesi, aranacak kişiyi değil yalnızca sayıyı verir.
    3. Davet edilmiş, hiç girmemiş — kurum sahibinin sormadığı ama
                bence gereken üçüncüsü. Bunlar ne aktif ne pasif: davet
                gitti, kişi hiç gelmedi. Bugün hiçbir ekranda yoklar ve
                kurulumun en sık takıldığı yer tam burası.

  "Hareketsizler" (girmiş ama uzun süredir uğramayan) BİLEREK YOK:
  elimizdeki son görülme kaydı yalnızca panel varlığından geliyor
  (user_presence) ve ArvoLab ile ARC'ı kapsamıyor. Üç üründen birini
  ölçüp "hareketsiz" demek, iki ürünü hiç kullanmayan birini de aktif
  göstermek olurdu.
*/

type Evre = "aktif" | "pasif" | "davet";
const EVRELER: { kod: Evre; ad: string }[] = [
  { kod: "aktif", ad: "Aktif kullanıcı" },
  { kod: "pasif", ad: "Pasif kullanıcı" },
  { kod: "davet", ad: "Davet bekleyen" },
];

/*
  Pasifliğin sebebi. Sıra önemli: en DAR açıklama kazanıyor. Kurumu
  pasife aldıysa lisans da askıda olabilir; kurucuya söylenmesi gereken
  ilk şey kişiye özel olanıdır.
*/
function pasiflikSebebi(satir: DirectoryRow): string {
  if (satir.membershipActive === false) return "Kurum pasife aldı";
  const durum = (satir.status ?? "").toLocaleLowerCase("tr-TR");
  if (durum.includes("suspend") || durum.includes("askı")) return "Lisans askıya alındı";
  if (durum.includes("past_due") || durum.includes("gecik")) return "Ödeme gecikti";
  if (durum.includes("cancel") || durum.includes("iptal")) return "Abonelik iptal edildi";
  if (durum.includes("lisans yok") || durum.includes("abonelik yok")) return "Lisans/abonelik yok";
  if (satir.periodEnd && Date.parse(satir.periodEnd) < Date.now()) return "Dönem doldu";
  return "Erişim kapalı";
}

type Davet = {
  id: string; email: string; role: string | null; status: string;
  created_at: string; sent_at: string | null; expires_at: string | null; organization_id: string;
};

/* Şimdiki zaman bileşen DIŞINDA okunuyor (react-hooks/purity): sunucu
   bileşeninin gövdesinde Date.now() çağırmak saf olmayan bir çağrı. */
const davetleriIsaretle = (davetler: Davet[]) => {
  const simdi = Date.now();
  return davetler.map((davet) => ({
    ...davet,
    suresiGecti: Boolean(davet.expires_at && Date.parse(davet.expires_at) < simdi),
  }));
};

/** Kişi × kapsam: aynı kişinin aynı kurumdaki beş ürünü tek satır. */
type Kisi = {
  anahtar: string;
  ad: string;
  email: string | null;
  telefon: string | null;
  unvan: string | null;
  kapsam: string;
  rol: string | null;
  urunler: string[];
  acik: boolean;
  sebep: string | null;
  bireysel: boolean;
};

function kisilereTopla(satirlar: DirectoryRow[]): Kisi[] {
  const harita = new Map<string, Kisi>();
  for (const satir of satirlar) {
    const kimlik = satir.email?.toLocaleLowerCase("tr-TR") ?? `uid:${satir.userId}`;
    const anahtar = `${satir.scope}:${kimlik}`;
    const onceki = harita.get(anahtar);
    const urun = productName(satir.product as Parameters<typeof productName>[0]);
    if (onceki) {
      if (!onceki.urunler.includes(urun)) onceki.urunler.push(urun);
      /* Bir üründe bile girebiliyorsa kişi AKTİF: "hiçbir yere giremiyor"
         demek için bütün ürünlerin kapalı olması gerekiyor. */
      if (satir.access) { onceki.acik = true; onceki.sebep = null; }
      else if (!onceki.acik) onceki.sebep = pasiflikSebebi(satir);
      onceki.telefon ??= satir.phone;
      onceki.unvan ??= satir.title;
      continue;
    }
    harita.set(anahtar, {
      anahtar,
      ad: formatPersonName(satir.name) || satir.email || "Adsız kullanıcı",
      email: satir.email,
      telefon: satir.phone,
      unvan: satir.title,
      kapsam: satir.scope,
      rol: satir.role,
      urunler: [urun],
      acik: satir.access,
      sebep: satir.access ? null : pasiflikSebebi(satir),
      bireysel: satir.individual,
    });
  }
  return [...harita.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
}

export default async function KullanicilarPage({ searchParams }: {
  searchParams: Promise<{ evre?: string; ara?: string }>;
}) {
  const { isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();
  const admin = createAdminClient();

  const { evre, ara } = await searchParams;
  const secili: Evre = EVRELER.some((e) => e.kod === evre) ? (evre as Evre) : "aktif";
  const aranan = (ara ?? "").trim().slice(0, 80);

  const [{ rows, arvolabReachable, kullanicilarTam }, davetSonucu] = await Promise.all([
    getMemberDirectory(),
    /*
      Davetler yalnızca sunucu anahtarıyla okunuyor. Anahtar yoksa bölüm
      "davet yok" demiyor, okunamadığını yazıyor — bir onboarding
      ekranında söylenebilecek en yanlış şey "kimse beklemiyor"dur.
    */
    admin
      ? admin.from("organization_invitations")
          .select("id,email,role,status,created_at,sent_at,expires_at,organization_id")
          .is("accepted_at", null).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: null }),
  ]);

  const kisiler = kisilereTopla(rows);
  const aktifler = kisiler.filter((k) => k.acik);
  const pasifler = kisiler.filter((k) => !k.acik);
  const davetler = davetleriIsaretle((davetSonucu.data ?? []) as Davet[]);

  const kurumAdlari = new Map(rows.filter((r) => r.organizationId).map((r) => [r.organizationId!, r.scope]));

  const desen = aranan.toLocaleLowerCase("tr-TR");
  const suz = (liste: Kisi[]) => desen
    ? liste.filter((k) => `${k.ad} ${k.email ?? ""} ${k.telefon ?? ""} ${k.kapsam}`.toLocaleLowerCase("tr-TR").includes(desen))
    : liste;

  const gosterilen = secili === "aktif" ? suz(aktifler) : secili === "pasif" ? suz(pasifler) : [];
  const sayim: Record<Evre, number> = { aktif: aktifler.length, pasif: pasifler.length, davet: davetler.length };
  const adres = (kod: Evre) => `/panel/platform/kullanicilar?evre=${kod}${aranan ? `&ara=${encodeURIComponent(aranan)}` : ""}`;

  /* Sağ kartın dağılımları zaten okunmuş kişilerden sayılıyor; yeni sorgu
     yok. Arama ve evre süzgecinden bağımsız: kart her zaman bütün
     kullanıcıları anlatır. */
  const dagilim = (degerler: string[]) => {
    const sayac = new Map<string, number>();
    for (const deger of degerler) sayac.set(deger, (sayac.get(deger) ?? 0) + 1);
    return [...sayac.entries()].sort((a, b) => b[1] - a[1]).map(([ad, adet]) => ({ ad, adet }));
  };
  const sebepDagilimi = dagilim(pasifler.map((k) => k.sebep ?? "Erişim kapalı"));
  const urunDagilimi = dagilim(aktifler.flatMap((k) => k.urunler));
  const suresiGecenDavet = davetler.filter((d) => d.suresiGecti).length;

  return <main className="plt talep cari ekip liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">PLATFORM · KULLANICILAR</small>
        <h1>Kullanıcılar</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href="/panel/platform/musteriler">Müşteriler</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Kullanıcı evreleri">
      <dl>
        {EVRELER.map((e) => (
          <div key={e.kod} className={secili === e.kod ? "is-active" : undefined}>
            <dt>{e.ad}</dt>
            <dd className={e.kod !== "aktif" && sayim[e.kod] ? "talep-uyari" : undefined}>
              <Link href={adres(e.kod)} aria-current={secili === e.kod ? "page" : undefined}>{sayi(sayim[e.kod])}</Link>
            </dd>
          </div>
        ))}
        <div>
          <dt>Kişi</dt>
          <dd>{sayi(kisiler.length)}</dd>
          <small>{sayi(kisiler.filter((k) => k.bireysel).length)} bireysel</small>
        </div>
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label={EVRELER.find((e) => e.kod === secili)!.ad}>
        <div className="ekip-suzgec talep-suzgec">
          {EVRELER.map((e) => (
            <Link key={e.kod} href={adres(e.kod)} className={secili === e.kod ? "is-active" : undefined} aria-current={secili === e.kod ? "page" : undefined}>
              {e.ad} <small>{sayi(sayim[e.kod])}</small>
            </Link>
          ))}
          {secili !== "davet" ? (
            <form action="/panel/platform/kullanicilar" className="talep-ara" role="search">
              <input type="hidden" name="evre" value={secili} />
              <input type="search" name="ara" defaultValue={aranan} placeholder="Ad, e-posta, telefon ya da kurum" aria-label="Kullanıcı ara" />
            </form>
          ) : null}
        </div>

        {/* Eksik veriyle dolu bir liste, dolu bir liste gibi görünür.
            (Eskiden sayfanın üstünde renkli bir şeritti; şimdi listenin
            kendi kartında, okunduğu yerde.) */}
        {!arvolabReachable || !kullanicilarTam ? (
          <KNot ton="uyari">
            <b>Liste eksik olabilir.</b>
            {!arvolabReachable ? " ArvoLab'a ulaşılamadı; oradaki kullanıcılar listede yok." : ""}
            {!kullanicilarTam ? " Kullanıcı listesi sayfa sınırına takıldı." : ""}
          </KNot>
        ) : null}

        {secili === "davet" ? (
          admin ? (
            davetler.length ? (
              /* iOS LİSTESİ (14.10.2026): eskiden yedi sütunlu tabloydu
                 (E-posta, Kurum, Rol, Durum, Davet, Geçerlilik). Şimdi
                 kurum · rol · davet tarihi tek satırda; sağda durum ve son
                 geçerlilik. */
              <KListe>
                {davetler.map((davet) => {
                  const { suresiGecti } = davet;
                  const kurumAdi = kurumAdlari.get(davet.organization_id) ?? "Kurum";
                  const kurumAdresi = `/panel/platform?organization=${davet.organization_id}`;
                  const durum = {
                    etiket: suresiGecti ? "Süresi geçti" : davet.status === "failed" ? "Gönderilemedi" : "Bekliyor",
                    ton: suresiGecti ? "danger" : davet.status === "failed" ? "danger" : "warning",
                  };
                  return (
                    /* Satır kurumun dosyasına gider: davet orada yeniden gönderilir. */
                    <KOge
                      key={davet.id}
                      href={kurumAdresi}
                      baslik={davet.email}
                      alt={[kurumAdi, davet.role, `davet ${tarihSaat(davet.sent_at ?? davet.created_at)}`].filter(Boolean).join(" · ")}
                      durum={durum}
                      deger={tarih(davet.expires_at)}
                      degerAlt="son geçerlilik"
                    />
                  );
                })}
              </KListe>
            ) :<KBos baslik="Bekleyen davet yok" aciklama="Davet edilip hiç giriş yapmamış kimse yok." />
          ) : <KBos baslik="Davetler okunamıyor" aciklama="Sunucu anahtarı tanımlı olmadığı için davetler okunamıyor — “davet yok” demek değil." />
        ) : gosterilen.length ? (
          /* Kişi satırının açılacak bir ekranı yok: ok bilerek konmadı
             (href yok), tıklanmayan satırda ok "açılır" diye yanlış söz
             verirdi. iOS LİSTESİ (14.10.2026): eskiden beş sütunlu tabloydu
             (Kişi, İletişim, Kurum, Ürün, Rol/Sebep); şimdi kurum · ürün ·
             e-posta · telefon · unvan tek satırda, sağda rol ya da pasiflik
             sebebi. E-posta ve telefon yine tıklanır bağlantı. */
          <KListe>
            {gosterilen.map((kisi) => {
              const parcalar: ReactNode[] = [
                kisi.bireysel ? "Bireysel" : kisi.kapsam,
                kisi.urunler.join(", "),
                kisi.email ? <a href={`mailto:${kisi.email}`}>{kisi.email}</a> : null,
                /* Telefon yalnızca ArvoOS profilinde var; ArvoLab ayrı
                   veritabanında ve orada tutulmuyor. */
                kisi.telefon ? <a href={`tel:${kisi.telefon}`}>{kisi.telefon}</a> : null,
                kisi.unvan,
              ].filter(Boolean);
              return (
                <KOge
                  key={kisi.anahtar}
                  simge={kisi.ad}
                  baslik={kisi.ad}
                  alt={parcalar.map((parca, i) => <Fragment key={i}>{i ? " · " : null}{parca}</Fragment>)}
                  durum={secili === "pasif" ? { etiket: kisi.sebep ?? "Erişim kapalı", ton: "danger" } : null}
                  deger={secili === "pasif" ? undefined : kisi.rol ?? "—"}
                />
              );
            })}
          </KListe>
        ) : (
          <KBos baslik={aranan ? `“${aranan}” ile eşleşen kullanıcı yok` : "Bu evrede kullanıcı yok"} />
        )}
      </section>

      {/* 14.10.2026: İstatistik kartının dört kutusu (aktif, pasif, davet,
          kişi) şeritteki sayıların AYNISIYDI. Yerine yalnızca şeritte
          olmayanlar, iOS listesiyle: pasiflik sebepleri, aktiflerin
          ürünleri ve süresi geçen davetler. */}
      <div className="liste-sag">
        <KKart baslik="Pasiflik sebebi" aciklama={`Aramadan bağımsız, bütün kullanıcılar${!arvolabReachable || !kullanicilarTam ? " · liste eksik olabilir" : ""}`}>
          {sebepDagilimi.length ? (
            <KListe>
              {sebepDagilimi.map((d) => <KOge key={d.ad} baslik={d.ad} deger={sayi(d.adet)} />)}
            </KListe>
          ) : <KNot>Pasif kullanıcı yok.</KNot>}
        </KKart>

        <KKart baslik="Aktiflerin ürünleri">
          {urunDagilimi.length ? (
            <KListe>
              {urunDagilimi.map((d) => <KOge key={d.ad} baslik={d.ad} deger={sayi(d.adet)} />)}
            </KListe>
          ) : <KNot>Aktif kullanıcı yok.</KNot>}
        </KKart>

        <KKart baslik="Davetler" aciklama={admin ? "En yeni 100 kayıttan" : "Sunucu anahtarı yok, okunamıyor"}>
          <KListe>
            <KOge baslik="Süresi geçen" deger={admin ? sayi(suresiGecenDavet) : "—"} />
          </KListe>
        </KKart>
      </div>
    </div>
  </main>;
}
