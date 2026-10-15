import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { ikincil } from "../konsol-oku";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberDirectory, type DirectoryRow } from "@/lib/member-directory";
import { productName } from "@/lib/products";
import { formatPersonName } from "@/lib/format-name";
import { Fragment, type ReactNode } from "react";
import { KBos, KKart, KListe, KNot, KOge } from "../konsol-ui";
import { sayi, tarih, tarihSaat } from "../bicim";
import { roleNames } from "../../hr/role-names";
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
          {/* Çipler rayda (konsol-ui.css): telefonda tek sıra kaydırılır,
              masaüstünde sarmalayıcı display:contents ile görünmez. */}
          <div className="suzgec-ray">
            {EVRELER.map((e) => (
              <Link key={e.kod} href={adres(e.kod)} className={secili === e.kod ? "is-active" : undefined} aria-current={secili === e.kod ? "page" : undefined}>
                {e.ad} <small>{sayi(sayim[e.kod])}</small>
              </Link>
            ))}
          </div>
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
            davetOkumasi.okunamadi ? (
              <KBos baslik="Davetler okunamadı" aciklama="Sorgu yanıt vermedi; “bekleyen davet yok” demek değil. Sayfayı yenileyin." />
            ) : davetler.length ? (
              /* iOS LİSTESİ (14.10.2026): eskiden yedi sütunlu tabloydu
                 (E-posta, Kurum, Rol, Durum, Davet, Geçerlilik). Şimdi
                 kurum · rol · davet tarihi tek satırda; sağda durum ve son
                 geçerlilik. */
              <KListe>
                {davetler.map((davet) => {
                  const { suresiGecti } = davet;
                  const kurumAdi = kurumAdlari.get(davet.organization_id) ?? "Kurum";
                  const kurumAdresi = `/panel/platform/musteriler/${davet.organization_id}?pencere=ayarlar`;
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
                      alt={[kurumAdi, davet.role ? rolAdi(davet.role, "arvoos") : null, `davet ${tarihSaat(davet.sent_at ?? davet.created_at)}`].filter(Boolean).join(" · ")}
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
              const kurumSayisi = kisi.uyelikler.filter((u) => !u.bireysel).length;
              const parcalar: ReactNode[] = [
                kisi.email && kisi.email !== kisi.ad ? <a href={`mailto:${kisi.email}`}>{kisi.email}</a> : null,
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
                  alt={parcalar.length ? parcalar.map((parca, i) => <Fragment key={i}>{i ? " · " : null}{parca}</Fragment>) : undefined}
                  etiketler={kisi.uyelikler.map((u) => ({
                    /* Kurum adı ürün adıyla aynıysa (ArvoOS kurumu · ArvoOS) tekrar yazılmaz. */
                    etiket: u.urunler.every((urun) => urun === u.kapsam) ? u.kapsam : `${u.kapsam} · ${u.urunler.join(", ")}`,
                    ton: u.acik ? "success" : "neutral",
                  }))}
                  durum={secili === "pasif" ? { etiket: kisi.sebep ?? "Erişim kapalı", ton: "danger" } : null}
                  deger={secili === "pasif" ? undefined : kisininRolu(kisi)}
                  degerAlt={secili === "pasif" ? undefined : kurumSayisi > 1 ? `${kurumSayisi} kurumda` : kisi.bireysel ? "bireysel" : undefined}
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
          ) : <KBos baslik="Pasif kullanıcı yok" aciklama="Erişimi kapatılan kullanıcı olduğunda sebepleri burada dağılır." />}
        </KKart>

        <KKart baslik="Aktiflerin ürünleri">
          {urunDagilimi.length ? (
            <KListe>
              {urunDagilimi.map((d) => <KOge key={d.ad} baslik={d.ad} deger={sayi(d.adet)} />)}
            </KListe>
          ) : <KBos baslik="Aktif kullanıcı yok" aciklama="Kullanıcılar ürünlere göre burada dağılır." />}
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
