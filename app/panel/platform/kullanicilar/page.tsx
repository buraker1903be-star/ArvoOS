import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory, type DirectoryRow } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { formatPersonName } from "@/lib/format-name";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { MobilSatir } from "../../crm/table-cells";
import { KBaslik, KBos, KDurum, KNot, KSatirSonu, KTablo } from "../konsol-ui";
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
              <KTablo kolonlar={[{ ad: "E-posta" }, { ad: "Kurum" }, { ad: "Rol" }, { ad: "Durum" }, { ad: "Davet", sinif: "crm-col-date" }, { ad: "Geçerlilik", sinif: "crm-col-date" }, { ad: "" }]}>
                {davetler.map((davet) => {
                  const { suresiGecti } = davet;
                  const kurumAdi = kurumAdlari.get(davet.organization_id) ?? "Kurum";
                  const kurumAdresi = `/panel/platform?organization=${davet.organization_id}`;
                  const durum = {
                    etiket: suresiGecti ? "Süresi geçti" : davet.status === "failed" ? "Gönderilemedi" : "Bekliyor",
                    ton: suresiGecti ? "danger" : davet.status === "failed" ? "danger" : "warning",
                  };
                  return (
                    <tr key={davet.id}>
                      {/* Satır kurumun dosyasına gider: davet orada yeniden gönderilir. */}
                      <KBaslik etiket="E-posta" href={kurumAdresi} baslik={davet.email} />
                      <td data-label="Kurum">{kurumAdi}</td>
                      <td data-label="Rol">{davet.role ?? "—"}</td>
                      <KDurum etiket={durum.etiket} ton={durum.ton} />
                      <td data-label="Davet" className="crm-col-date">{tarihSaat(davet.sent_at ?? davet.created_at)}</td>
                      <td data-label="Geçerlilik" className="crm-col-date">{tarih(davet.expires_at)}</td>
                      <KSatirSonu mobil={{
                        href: kurumAdresi,
                        baslik: davet.email,
                        durum,
                        alt: [kurumAdi, davet.role, `son geçerlilik ${tarih(davet.expires_at)}`],
                      }} />
                    </tr>
                  );
                })}
              </KTablo>
            ) : <KBos baslik="Bekleyen davet yok" aciklama="Davet edilip hiç giriş yapmamış kimse yok." />
          ) : <KBos baslik="Davetler okunamıyor" aciklama="Sunucu anahtarı tanımlı olmadığı için davetler okunamıyor — “davet yok” demek değil." />
        ) : gosterilen.length ? (
          /* Kişi satırının açılacak bir ekranı yok: ok sütunu bilerek konmadı,
             tıklanmayan satırda ok "açılır" diye yanlış söz verirdi. */
          <KTablo kolonlar={[{ ad: "Kişi" }, { ad: "İletişim" }, { ad: "Kurum" }, { ad: "Ürün" }, { ad: secili === "pasif" ? "Sebep" : "Rol" }]}>
            {gosterilen.map((kisi) => (
              <tr key={kisi.anahtar}>
                <KBaslik avatar etiket="Kişi" baslik={kisi.ad} alt={kisi.unvan} />
                <td data-label="İletişim">
                  {kisi.email ? <a href={`mailto:${kisi.email}`}>{kisi.email}</a> : "—"}
                  {/* Telefon yalnızca ArvoOS profilinde var; ArvoLab ayrı
                      veritabanında ve orada tutulmuyor. */}
                  {kisi.telefon ? <span className="crm-table-sub"><a href={`tel:${kisi.telefon}`}>{kisi.telefon}</a></span> : null}
                </td>
                <td data-label="Kurum">{kisi.bireysel ? "Bireysel" : kisi.kapsam}</td>
                <td data-label="Ürün">{kisi.urunler.join(", ")}</td>
                {secili === "pasif"
                  ? <KDurum baslik="Sebep" etiket={kisi.sebep ?? "Erişim kapalı"} ton="danger" />
                  : <td data-label="Rol">{kisi.rol ?? "—"}</td>}
                <MobilSatir
                  baslik={kisi.ad}
                  durum={secili === "pasif" ? { etiket: kisi.sebep ?? "Erişim kapalı", ton: "danger" } : null}
                  alt={[kisi.bireysel ? "Bireysel" : kisi.kapsam, kisi.urunler.join(", "), kisi.email, kisi.telefon]}
                />
              </tr>
            ))}
          </KTablo>
        ) : (
          <KBos baslik={aranan ? `“${aranan}” ile eşleşen kullanıcı yok` : "Bu evrede kullanıcı yok"} />
        )}
      </section>

      <IstatistikKarti
        kapsam={`aramadan bağımsız, bütün kullanıcılar${admin ? "; davetler en yeni 100 kayıttan" : ""}${!arvolabReachable || !kullanicilarTam ? " · liste eksik olabilir" : ""}`}
        kutular={[
          { ad: "Aktif", deger: sayi(aktifler.length), alt: "giriş yapabiliyor", ton: "arti" },
          { ad: "Pasif", deger: sayi(pasifler.length), alt: "erişimi kapalı", ton: pasifler.length ? "uyari" : undefined },
          { ad: "Davet bekleyen", deger: admin ? sayi(davetler.length) : "—", alt: admin ? `${sayi(suresiGecenDavet)} süresi geçti` : "okunamıyor", ton: admin && davetler.length ? "uyari" : undefined },
          { ad: "Kişi", deger: sayi(kisiler.length), alt: `${sayi(kisiler.filter((k) => k.bireysel).length)} bireysel` },
        ]}
        gruplar={[
          { baslik: "Pasiflik sebebi", satirlar: sebepDagilimi },
          { baslik: "Aktiflerin ürünleri", satirlar: urunDagilimi },
        ]}
      />
    </div>
  </main>;
}
