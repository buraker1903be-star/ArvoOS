import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ikincil } from "../konsol-oku";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory, type DirectoryRow } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { formatPersonName } from "@/lib/format-name";
import { KNot } from "../konsol-ui";
import { basHarfleri, sayi, tarih, tarihSaat } from "../bicim";
import { MobilSatir } from "../../crm/table-cells";
import { SatirTiklama } from "../../crm/satir-tiklama";
import { IstatistikKarti } from "../../crm/istatistik-karti";
import { TalepAkis } from "../../crm/kayit-detay/kayit-akis";
import { roleNames } from "../../hr/role-names";
import "../platform.css";
import "../../hr/hr.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../finans.css";

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

/*
  KİŞİ BAŞINA TEK SATIR (14.10.2026, "tablo çok kötü gözüküyor"). Eskiden
  satır kişi × kurumdu: üç kurumda olan kurucu üç ayrı satırda, sağda üç
  ayrı ham rol koduyla ("owner", "system_admin") görünüyordu. Şimdi kişi
  bir kez; kurumları satırın altında rozet (kurum · ürünler), erişimi açık
  olan kurum yeşil, kapalı olan soluk. Sağda kişinin EN YETKİLİ rolü
  Türkçe adıyla ve kaç kurumda olduğu.

  Kişi e-postaya göre birleşiyor: ArvoLab'ın kullanıcı kimliği ArvoOS'unkiyle
  aynı değil (lib/member-directory'deki kuralın aynısı).
*/
/** rol: kurumdaki ArvoOS rolü; yoksa (yalnızca ArvoLab'daysa) ArvoLab rolü — rolUrunu hangisi olduğunu söyler. */
type Uyelik = { kapsam: string; urunler: string[]; rol: string | null; rolUrunu: string | null; acik: boolean; sebep: string | null; bireysel: boolean };
type Kisi = {
  anahtar: string;
  ad: string;
  email: string | null;
  telefon: string | null;
  unvan: string | null;
  uyelikler: Uyelik[];
  /** Bir kurumda bile girebiliyorsa AKTİF; pasif = hiçbir yere giremiyor. */
  acik: boolean;
  sebep: string | null;
  bireysel: boolean;
};

/*
  ROL = KURUMDAKİ ArvoOS ROLÜ, panelin kendi adıyla (app/panel/hr/role-names).
  İlk sürümde (14.10.2026) "en yetkili rol" ArvoOS ve ArvoLab rolleri
  arasından seçiliyordu: ArvoLab'da teknik olarak "system_admin" olan
  Gizem Atar, panelde Operasyon Personeli iken "Sistem yöneticisi"
  görünüyordu (kurum sahibi düzeltti). İki ürünün rolleri aynı şeyi
  anlatmıyor; kişinin kurumdaki görevi ArvoOS rolü. ArvoLab rolü yalnızca
  kişinin hiç ArvoOS üyeliği yoksa yazılıyor, kendi adlarıyla.
*/
const ARVOOS_ROL_SIRASI = ["owner", "admin", "manager", "operasyoncu", "member"];
const ARVOLAB_ROL_ADI: Record<string, string> = {
  founder: "Kurucu", system_admin: "Sistem yöneticisi", academic_manager: "Akademik yönetici",
  controller: "Kontrolör", expert: "Uzman", client: "Üye / öğrenci",
};
const rolAdi = (rol: string | null, urun: string | null) => {
  if (!rol) return "—";
  const ad = urun === "arvoos" ? roleNames[rol] : ARVOLAB_ROL_ADI[rol];
  return ad ?? rol.replace(/_/g, " ").replace(/^./, (h) => h.toLocaleUpperCase("tr-TR"));
};
const arvoosSirasi = (rol: string | null) => {
  const i = ARVOOS_ROL_SIRASI.indexOf(rol ?? "");
  return i < 0 ? ARVOOS_ROL_SIRASI.length : i;
};

function kisilereTopla(satirlar: DirectoryRow[]): Kisi[] {
  const harita = new Map<string, Kisi>();
  for (const satir of satirlar) {
    const anahtar = satir.email?.toLocaleLowerCase("tr-TR") ?? `uid:${satir.userId}`;
    const urun = productName(satir.product as Parameters<typeof productName>[0]);
    let kisi = harita.get(anahtar);
    if (!kisi) {
      kisi = {
        anahtar,
        ad: formatPersonName(satir.name) || satir.email || "Adsız kullanıcı",
        email: satir.email, telefon: satir.phone, unvan: satir.title,
        uyelikler: [], acik: false, sebep: null, bireysel: false,
      };
      harita.set(anahtar, kisi);
    }
    // Adı olan kayıt adsız olanı ezer (ArvoLab satırında ad boş olabiliyor).
    if (kisi.ad === kisi.email && satir.name) kisi.ad = formatPersonName(satir.name) || kisi.ad;
    kisi.telefon ??= satir.phone;
    kisi.unvan ??= satir.title;

    const kapsam = satir.individual ? "Bireysel" : satir.scope;
    let uyelik = kisi.uyelikler.find((u) => u.kapsam === kapsam);
    if (!uyelik) {
      uyelik = { kapsam, urunler: [], rol: null, rolUrunu: null, acik: false, sebep: null, bireysel: satir.individual };
      kisi.uyelikler.push(uyelik);
    }
    if (!uyelik.urunler.includes(urun)) uyelik.urunler.push(urun);
    /* ArvoOS rolü her zaman kazanır; öteki ürünün rolü yalnızca boşluğu doldurur. */
    if (satir.role && (satir.product === "arvoos" || (uyelik.rolUrunu !== "arvoos" && !uyelik.rol))) {
      uyelik.rol = satir.role;
      uyelik.rolUrunu = satir.product;
    }
    /* Bir üründe bile girebiliyorsa o kurumda açık. */
    if (satir.access) { uyelik.acik = true; uyelik.sebep = null; }
    else if (!uyelik.acik) uyelik.sebep = pasiflikSebebi(satir);
  }
  for (const kisi of harita.values()) {
    kisi.acik = kisi.uyelikler.some((u) => u.acik);
    kisi.sebep = kisi.acik ? null : kisi.uyelikler.find((u) => u.sebep)?.sebep ?? "Erişim kapalı";
    kisi.bireysel = kisi.uyelikler.every((u) => u.bireysel);
    kisi.uyelikler.sort((a, b) => Number(b.acik) - Number(a.acik) || a.kapsam.localeCompare(b.kapsam, "tr-TR"));
  }
  return [...harita.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
}

/** Kişinin rolü: ArvoOS üyeliği varsa kurumları arasındaki en yetkili ArvoOS rolü, yoksa ilk ürün rolü. */
const kisininRolu = (kisi: Kisi) => {
  const arvoos = kisi.uyelikler.filter((u) => u.rolUrunu === "arvoos").sort((a, b) => arvoosSirasi(a.rol) - arvoosSirasi(b.rol))[0];
  const secilen = arvoos ?? kisi.uyelikler.find((u) => u.rol) ?? null;
  return rolAdi(secilen?.rol ?? null, secilen?.rolUrunu ?? null);
};

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
  /*
    Sorgu DÜŞERSE de "davet yok" denmiyor. Anahtar yokluğu zaten
    ayrılmıştı ama hata hâlâ boş listeye düşüyordu: ikisi de aynı
    sessizliği üretiyor (konsol-oku.ts → ikincil).
  */
  const davetOkumasi = ikincil(davetSonucu as { data: Davet[] | null; error: { message: string } | null }, "Davetler");
  const davetler = davetleriIsaretle(davetOkumasi.veri ?? []);

  const kurumAdlari = new Map(rows.filter((r) => r.organizationId).map((r) => [r.organizationId!, r.scope]));

  const desen = aranan.toLocaleLowerCase("tr-TR");
  const suz = (liste: Kisi[]) => desen
    ? liste.filter((k) => `${k.ad} ${k.email ?? ""} ${k.telefon ?? ""} ${k.uyelikler.map((u) => u.kapsam).join(" ")}`.toLocaleLowerCase("tr-TR").includes(desen))
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
  const urunDagilimi = dagilim(aktifler.flatMap((k) => [...new Set(k.uyelikler.filter((u) => u.acik).flatMap((u) => u.urunler))]));
  const suresiGecenDavet = davetler.filter((d) => d.suresiGecti).length;

  const bos = (baslik: string, aciklama: string) => (
    <div className="crm-empty-state talep-bos-kutu ek-bos"><h2>{baslik}</h2><p>{aciklama}</p></div>
  );
  const kisiYazisi = (kisi: Kisi) => [kisi.email && kisi.email !== kisi.ad ? kisi.email : null, kisi.unvan].filter(Boolean).join(" · ");

  /*
    PANELİN TABLOSU (29.10.2026, konsol yeniden kurulurken). Kişi satırı
    iOS satırıydı: e-posta, telefon, unvan, kurum rozetleri ve rol aynı
    satırın altına ve sonuna dağılıyordu; kalabalık bir kişide kurum
    rozetleri ikinci, üçüncü satıra taşıp listeyi okunmaz yapıyordu.
    Artık Ekip ve Müşteriler listesiyle aynı tablo: kişi, kurumlar,
    telefon, rol ve durum ayrı sütunlarda. Evre seçimi segment.

    Kişi satırının açılacak bir ekranı yok: ok bilerek konmadı; e-posta
    ve telefon yine tıklanır bağlantı.
  */
  return <main className="plt talep cari ekip talepler teklifler liste-sayfa kisi-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker"><Link href="/panel/platform/musteriler">MÜŞTERİLER</Link></small>
        <h1>Kullanıcılar</h1>
        <p className="ek-alt">{sayi(kisiler.length)} kişi · {sayi(aktifler.length)} aktif · {sayi(kisiler.filter((k) => k.bireysel).length)} bireysel · ArvoOS ve ArvoLab birlikte</p>
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
        <div className="ekip-suzgec talep-suzgec ek-arac">
          <nav className="ek-segment" aria-label="Evre">
            {EVRELER.map((e) => (
              <Link key={e.kod} href={adres(e.kod)} className={secili === e.kod ? "is-active" : undefined} aria-current={secili === e.kod ? "page" : undefined}>
                {e.ad} <small>{sayi(sayim[e.kod])}</small>
              </Link>
            ))}
          </nav>
          {secili !== "davet" ? (
            <form action="/panel/platform/kullanicilar" className="talep-ara" role="search">
              <input type="hidden" name="evre" value={secili} />
              <input type="search" name="ara" defaultValue={aranan} placeholder="Ad, e-posta, telefon ya da kurum" aria-label="Kullanıcı ara" />
            </form>
          ) : null}
        </div>

        {/* Eksik veriyle dolu bir liste, dolu bir liste gibi görünür. */}
        {!arvolabReachable || !kullanicilarTam ? (
          <KNot ton="uyari">
            <b>Liste eksik olabilir.</b>
            {!arvolabReachable ? " ArvoLab'a ulaşılamadı; oradaki kullanıcılar listede yok." : ""}
            {!kullanicilarTam ? " Kullanıcı listesi sayfa sınırına takıldı." : ""}
          </KNot>
        ) : null}

        {secili === "davet" ? (
          admin ? (
            davetOkumasi.okunamadi ? (
              bos("Davetler okunamadı", "Sorgu yanıt vermedi; “bekleyen davet yok” demek değil. Sayfayı yenileyin.")
            ) : davetler.length ? (
              <div className="talep-tablo">
                <table className="crm-data-table" data-cols="ku-davet">
                  <thead><tr><th>E-posta</th><th>Kurum</th><th>Rol</th><th className="crm-col-date">Davet</th><th className="crm-col-date">Son geçerlilik</th><th>Durum</th><th></th></tr></thead>
                  <tbody>
                    {davetler.map((davet) => {
                      const { suresiGecti } = davet;
                      const kurumAdi = kurumAdlari.get(davet.organization_id) ?? "Kurum";
                      /* Satır kurumun Kurulum sekmesine gider: davet orada yeniden gönderilir. */
                      const kurumAdresi = `/panel/platform/musteriler/${davet.organization_id}?pencere=ayarlar`;
                      const durum = {
                        etiket: suresiGecti ? "Süresi geçti" : davet.status === "failed" ? "Gönderilemedi" : "Bekliyor",
                        ton: suresiGecti ? "danger" : davet.status === "failed" ? "danger" : "warning",
                      };
                      return (
                        <tr key={davet.id}>
                          <td data-label="E-posta">
                            <Link className="crm-row-link ek-kisi" href={kurumAdresi}>
                              <span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(davet.email)}</span>
                              <span className="ek-kisi-metin"><span className="crm-table-title" title={davet.email}>{davet.email}</span><span className="crm-table-sub">davet edildi</span></span>
                            </Link>
                          </td>
                          <td data-label="Kurum"><span className="crm-table-title">{kurumAdi}</span></td>
                          <td data-label="Rol"><span className="crm-table-sub">{davet.role ? rolAdi(davet.role, "arvoos") : "—"}</span></td>
                          <td className="crm-col-date" data-label="Davet">{tarihSaat(davet.sent_at ?? davet.created_at)}</td>
                          <td className="crm-col-date" data-label="Son geçerlilik">{tarih(davet.expires_at)}</td>
                          <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                          <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                          <MobilSatir href={kurumAdresi} baslik={davet.email} durum={durum}
                            alt={[kurumAdi, davet.role ? rolAdi(davet.role, "arvoos") : null, `son gün ${tarih(davet.expires_at)}`]} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <SatirTiklama />
              </div>
            ) : bos("Bekleyen davet yok", "Davet edilip hiç giriş yapmamış kimse yok.")
          ) : bos("Davetler okunamıyor", "Sunucu anahtarı tanımlı olmadığı için davetler okunamıyor — “davet yok” demek değil.")
        ) : gosterilen.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="ku-kisi">
              <thead><tr><th>Kişi</th><th>Kurumlar</th><th>Telefon</th><th>Rol</th><th>Durum</th></tr></thead>
              <tbody>
                {gosterilen.map((kisi) => {
                  const kurumSayisi = kisi.uyelikler.filter((u) => !u.bireysel).length;
                  const rol = kisininRolu(kisi);
                  const durum = kisi.acik ? { etiket: "Aktif", ton: "success" } : { etiket: kisi.sebep ?? "Erişim kapalı", ton: "danger" };
                  const alt = kisiYazisi(kisi);
                  return (
                    <tr key={kisi.anahtar} className={kisi.acik ? undefined : "is-pasif"}>
                      <td data-label="Kişi">
                        <span className="ek-kisi">
                          <span className="ek-avatar" data-tur="bireysel" aria-hidden="true">{basHarfleri(kisi.ad)}</span>
                          <span className="ek-kisi-metin">
                            <span className="crm-table-title" title={kisi.ad}>{kisi.ad}</span>
                            {kisi.email && kisi.email !== kisi.ad
                              ? <a className="crm-table-sub" href={`mailto:${kisi.email}`} title={alt}>{alt}</a>
                              : alt ? <span className="crm-table-sub">{alt}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td data-label="Kurumlar">
                        <span className="fn-urunler">
                          {kisi.uyelikler.map((u) => (
                            /* Kurum adı ürün adıyla aynıysa (ArvoOS kurumu · ArvoOS) tekrar yazılmaz. */
                            <span key={u.kapsam} data-tone={u.acik ? "success" : "neutral"} title={u.urunler.join(", ")}>
                              {u.urunler.every((urun) => urun === u.kapsam) ? u.kapsam : `${u.kapsam} · ${u.urunler.join(", ")}`}
                            </span>
                          ))}
                        </span>
                      </td>
                      {/* Telefon yalnızca ArvoOS profilinde var; ArvoLab ayrı veritabanında ve orada tutulmuyor. */}
                      <td data-label="Telefon">{kisi.telefon ? <a className="crm-table-title" href={`tel:${kisi.telefon}`}>{kisi.telefon}</a> : <span className="crm-table-sub">—</span>}</td>
                      <td data-label="Rol"><span className="crm-table-title">{rol}</span>{kurumSayisi > 1 ? <small>{kurumSayisi} kurumda</small> : kisi.bireysel ? <small>bireysel</small> : null}</td>
                      <td data-label="Durum"><span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span></td>
                      <MobilSatir baslik={kisi.ad} durum={durum}
                        alt={[kisi.email !== kisi.ad ? kisi.email : null, rol, kisi.uyelikler.map((u) => u.kapsam).join(", ")]} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : bos(aranan ? `“${aranan}” ile eşleşen kullanıcı yok` : "Bu evrede kullanıcı yok", "Aramayı ya da evreyi değiştirip yeniden deneyin.")}
      </section>

      {/* Sağ sütun aramadan ve evreden bağımsız: bütün kullanıcıları anlatır. */}
      <div className="liste-sag">
        <TalepAkis kimlik="kullanici-sag" sinif="ek-sag" etiket="Kullanıcı istatistikleri" sekmeler={["İstatistikler"]}>
          <IstatistikKarti
            kapsam={`bütün kullanıcılar${!arvolabReachable || !kullanicilarTam ? " · liste eksik olabilir" : ""}`}
            kutular={[
              { ad: "Aktif", deger: sayi(aktifler.length), alt: "en az bir kurumda girebiliyor" },
              { ad: "Pasif", deger: sayi(pasifler.length), alt: "hiçbir yere giremiyor", ton: pasifler.length ? "uyari" : undefined },
              { ad: "Bekleyen davet", deger: admin ? sayi(davetler.length) : "—", alt: admin ? "en yeni 100 kayıttan" : "sunucu anahtarı yok" },
              { ad: "Süresi geçen davet", deger: admin ? sayi(suresiGecenDavet) : "—", alt: "yeniden gönderilmeli", ton: suresiGecenDavet ? "uyari" : undefined },
            ]}
            gruplar={[
              { baslik: "Aktiflerin ürünleri", satirlar: urunDagilimi },
              { baslik: "Pasiflik sebebi", satirlar: sebepDagilimi },
            ]}
          />
        </TalepAkis>
      </div>
    </div>
  </main>;
}
