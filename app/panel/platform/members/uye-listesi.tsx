"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { DirectoryRow, MemberProduct } from "@/lib/member-directory";
import { KBos, KListe, KOge } from "../konsol-ui";
import { uyeErisimiDegistir } from "./actions";

/*
  Tüm üyeler: KİRACI BAZINDA.

  Liste önce ürün × kişi düz listesiydi ve iki şeyi birden yanlış
  yapıyordu:

    1. Kurucu kiracı ekseninde çalışıyor ("AkademikMerkez'de kimler var"),
       liste ise kişi ekseninde diziliyordu. Bir kurumun üyelerini görmek
       için listeyi baştan sona taramak gerekiyordu.
    2. Aynı kişi, aynı kurumda her ürün için ayrı bir satırdı ve her
       satırda ayrı bir erişim anahtarı vardı. Oysa ERİŞİM ÜRÜN BAZINDA
       DEĞİL: uyeErisimiDegistir kurum + kişi alıyor, yani beş anahtar tek
       bir şeyi açıp kapatıyordu. Beş anahtardan birini kapatmak
       diğerlerini de kapatıyordu ve ekranda bunu anlatan hiçbir şey yoktu.

  Artık her kurum bir grup, her kişi grupta TEK satır, ürünler o satırda
  etiket. Anahtar da tek: kişinin o kurumdaki erişimi.

  Gruplar kapalı açılıyor: on kiracının tüm üyeleri aynı anda açık
  olduğunda sayfa yine taranması gereken bir listeye dönüyor. Arama
  yapıldığında eşleşen gruplar kendiliğinden açılıyor — aranan kişiyi
  bulup bir de grubu açmak zorunda kalmak, aramanın yarısını yapmak olur.
*/

const URUN_ADI: Record<MemberProduct, string> = {
  arvoos: "ArvoOS", arvolab: "ArvoLab", arc: "ArvoARC", randevu: "Randevu",
};

const ROL_ADI: Record<string, string> = {
  owner: "Kurum sahibi", admin: "Yönetici", manager: "Müdür", member: "Üye", viewer: "İzleyici",
  client: "Üye", employee: "Çalışan", expert: "Uzman", controller: "Kontrolör",
  operasyoncu: "Operasyon personeli",
  academic_manager: "Akademik yönetici", system_admin: "Sistem yöneticisi", founder: "Kurucu",
};

const DURUM_ADI: Record<string, string> = {
  active: "Aktif", trialing: "Deneme", past_due: "Ödeme gecikmiş", suspended: "Askıda",
  canceled: "İptal", inactive: "Kapalı", "lisans yok": "Lisans yok",
  "abonelik yok": "Abonelik yok", "iç ekip": "İç ekip", "erişim kapalı": "Erişim kapalı",
};

/** Türkçe duyarsız arama: "İş" ile "is" eşleşsin. */
const sadelestir = (value: string) =>
  value
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");

type Suzgec = "hepsi" | "acik" | "kapali";

type UrunRozeti = { product: MemberProduct; access: boolean; status: string };
type Kisi = {
  anahtar: string;
  userId: string;
  ad: string;
  eposta: string | null;
  rol: string | null;
  organizationId: string | null;
  membershipActive: boolean | null;
  individual: boolean;
  urunler: UrunRozeti[];
  erisimVar: boolean;
};
type Grup = { anahtar: string; ad: string; bireysel: boolean; kisiler: Kisi[]; acik: number };

/** ust: listenin üstünde, kartın içinde duran notlar (eksik veri uyarıları). */
export function UyeListesi({ satirlar, ust }: { satirlar: DirectoryRow[]; ust?: ReactNode }) {
  const [arama, setArama] = useState("");
  const [urun, setUrun] = useState<MemberProduct | "hepsi">("hepsi");
  const [erisim, setErisim] = useState<Suzgec>("hepsi");
  const [acilanlar, setAcilanlar] = useState<Set<string>>(new Set());
  const [islenen, setIslenen] = useState<string | null>(null);
  const [, basla] = useTransition();

  const aranan = sadelestir(arama.trim());

  const gruplar = useMemo<Grup[]>(() => {
    const suzulmus = satirlar.filter((satir) => {
      if (urun !== "hepsi" && satir.product !== urun) return false;
      if (erisim === "acik" && !satir.access) return false;
      if (erisim === "kapali" && satir.access) return false;
      if (!aranan) return true;
      return sadelestir(`${satir.name ?? ""} ${satir.email ?? ""} ${satir.scope}`).includes(aranan);
    });

    /*
      GRUPLAMA İKİ GEÇİŞTE.

      ArvoLab ayrı bir Supabase projesi: satırlarında ArvoOS kurum kimliği
      yok (organizationId null) ve kullanıcı kimliği de o veritabanının
      kendi kimliği. Tek geçişte gruplayınca AkademikMerkez iki kez
      listeleniyordu — biri dört ArvoOS üyesiyle, diğeri tek ArvoLab
      üyesiyle. Aynı kurum, iki ayrı satır.

      Önce kurum kimliği OLAN satırlardan gruplar kuruluyor ve adları
      kaydediliyor; sonra kimliksiz satırlar adı tutan gruba katılıyor.
      Ad eşleşmesi yalnızca bu yönde: var olan bir kuruma katılmak için.
      İki ayrı kiracıyı adları benzediği için birleştirmiyor.
    */
    const grupHarita = new Map<string, Grup>();
    const isimdenGrup = new Map<string, string>();

    const grubuAl = (satir: DirectoryRow): Grup => {
      if (satir.individual) {
        let grup = grupHarita.get("bireysel");
        if (!grup) {
          grup = { anahtar: "bireysel", ad: "Bireysel aboneler", bireysel: true, kisiler: [], acik: 0 };
          grupHarita.set("bireysel", grup);
        }
        return grup;
      }
      const isim = sadelestir(satir.scope);
      const anahtar = satir.organizationId ?? isimdenGrup.get(isim) ?? `ad:${isim}`;
      let grup = grupHarita.get(anahtar);
      if (!grup) {
        grup = { anahtar, ad: satir.scope, bireysel: false, kisiler: [], acik: 0 };
        grupHarita.set(anahtar, grup);
      }
      if (satir.organizationId) isimdenGrup.set(isim, satir.organizationId);
      return grup;
    };

    // Kurum kimliği olanlar önce: adı tutan grup onlardan kuruluyor.
    const sirali = [...suzulmus].sort((a, b) => Number(Boolean(b.organizationId)) - Number(Boolean(a.organizationId)));

    for (const satir of sirali) {
      const grup = grubuAl(satir);
      /*
        Kişi anahtarı E-POSTA: ArvoLab'ın kullanıcı kimliği ArvoOS'unkiyle
        aynı değil, aynı insanın iki veritabanındaki iki hesabı. Kimliğe
        göre birleştirmek aynı kişiyi grupta iki satır yapıyordu. E-posta
        yoksa kimliğe düşülüyor.
      */
      const kisiAnahtari = `${grup.anahtar}:${satir.email?.toLocaleLowerCase("tr-TR") ?? `uid:${satir.userId}`}`;
      let kisi = grup.kisiler.find((mevcut) => mevcut.anahtar === kisiAnahtari);
      if (!kisi) {
        kisi = {
          anahtar: kisiAnahtari,
          userId: satir.userId,
          ad: satir.name || satir.email || "Adı kayıtlı değil",
          eposta: satir.email,
          rol: satir.role,
          organizationId: satir.organizationId,
          membershipActive: satir.membershipActive,
          individual: satir.individual,
          urunler: [],
          erisimVar: false,
        };
        grup.kisiler.push(kisi);
      } else {
        /*
          Anahtarı çizen kayıt, kurum üyeliği OLAN kayıt olmalı: ArvoLab
          satırının kimliği yok ve onun üzerinden erişim değiştirilemiyor.
          Ad da boşsa doluyla dolduruluyor — ArvoLab profili adı tutuyor
          ama ArvoOS metadata'sı tutmayabiliyor.
        */
        if (!kisi.organizationId && satir.organizationId) {
          kisi.organizationId = satir.organizationId;
          kisi.membershipActive = satir.membershipActive;
          kisi.rol = satir.role ?? kisi.rol;
        }
        if ((!kisi.ad || kisi.ad === kisi.eposta || kisi.ad === "Adı kayıtlı değil") && satir.name) kisi.ad = satir.name;
        if (!kisi.eposta && satir.email) kisi.eposta = satir.email;
      }
      kisi.urunler.push({ product: satir.product, access: satir.access, status: satir.status });
      if (satir.access) kisi.erisimVar = true;
    }

    const URUN_SIRASI: MemberProduct[] = ["arvoos", "arvolab", "arc", "randevu"];
    for (const grup of grupHarita.values()) {
      for (const kisi of grup.kisiler) {
        // Sabit sıra: etiketler satırdan satıra yer değiştirmesin.
        kisi.urunler.sort((a, b) => URUN_SIRASI.indexOf(a.product) - URUN_SIRASI.indexOf(b.product));
      }
      grup.kisiler.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
      grup.acik = grup.kisiler.filter((kisi) => kisi.erisimVar).length;
    }

    // Bireysel en sonda: kiracılar kurucunun asıl ekseni.
    return [...grupHarita.values()].sort((a, b) =>
      Number(a.bireysel) - Number(b.bireysel) || a.ad.localeCompare(b.ad, "tr"));
  }, [satirlar, aranan, urun, erisim]);

  const kisiSayisi = gruplar.reduce((toplam, grup) => toplam + grup.kisiler.length, 0);

  const degistir = (kisi: Kisi, grupAdi: string) => {
    if (!kisi.organizationId) return;
    const acilacak = !kisi.membershipActive;
    if (!window.confirm(acilacak
      ? `${kisi.ad} için ${grupAdi} erişimi açılsın mı?`
      : `${kisi.ad} için ${grupAdi} erişimi kapatılsın mı? Kişi kurumun paneline giremez; bu kurumdaki bütün ürünleri kapanır.`)) return;

    const anahtar = `${kisi.organizationId}:${kisi.userId}`;
    setIslenen(anahtar);
    basla(async () => {
      try {
        const veri = new FormData();
        veri.set("organization_id", kisi.organizationId!);
        veri.set("user_id", kisi.userId);
        veri.set("acik", acilacak ? "1" : "0");
        await uyeErisimiDegistir(veri);
      } finally {
        // Başarısızlıkta da bırakılmalı; yoksa düğme kilitli kalır.
        setIslenen(null);
      }
    });
  };

  const cevir = (anahtar: string) => setAcilanlar((eski) => {
    const yeni = new Set(eski);
    if (yeni.has(anahtar)) yeni.delete(anahtar); else yeni.add(anahtar);
    return yeni;
  });

  /* Erişim süzgeci panelin süzgeç çipleriyle çiziliyor. Çipler sayfa
     değiştirmiyor (süzme tarayıcıda, eskiden de bir açılır listeydi);
     panel stili yalnızca <a>'ya tanımlı olduğu için adresi olmayan <a>
     düğme rolüyle kullanılıyor. */
  const ERISIM_CIPLERI: { kod: Suzgec; ad: string }[] = [
    { kod: "hepsi", ad: "Tümü" },
    { kod: "acik", ad: "Erişimi açık" },
    { kod: "kapali", ad: "Erişimi kapalı" },
  ];

  return (
    <section className="panel-card talep-bilgi" aria-label="Üyeler">
      <div className="ekip-suzgec talep-suzgec">
        {ERISIM_CIPLERI.map((cip) => (
          <a
            key={cip.kod}
            role="button"
            tabIndex={0}
            aria-pressed={erisim === cip.kod}
            className={erisim === cip.kod ? "is-active" : undefined}
            onClick={() => setErisim(cip.kod)}
            onKeyDown={(olay) => { if (olay.key === "Enter" || olay.key === " ") { olay.preventDefault(); setErisim(cip.kod); } }}
          >{cip.ad}</a>
        ))}
        <span className="talep-suzgec-etiket">{gruplar.length} kurum · {kisiSayisi} kişi</span>
        <div className="talep-ara talep-ara--secimli" role="search">
          <input
            type="search" value={arama} placeholder="Ad, e-posta ya da kurum ara" aria-label="Üyelerde ara"
            onChange={(olay) => setArama(olay.target.value)}
          />
          <select className="talep-temsilci-sec" value={urun} onChange={(olay) => setUrun(olay.target.value as MemberProduct | "hepsi")} aria-label="Ürün">
            <option value="hepsi">Tüm ürünler</option>
            {(Object.keys(URUN_ADI) as MemberProduct[]).map((kod) => (
              <option key={kod} value={kod}>{URUN_ADI[kod]}</option>
            ))}
          </select>
        </div>
      </div>

      {ust}

      {gruplar.length ? (
        /* iOS LİSTESİ (14.10.2026, "iOS gibi olmalı"). Eskiden dört
           sütunlu tabloydu (Kurum / kişi, Rol, Ürünler, Erişim); kurum
           başlığı tablonun içinde colSpan'li bir satırdı ve satıra
           tıklamak grubu açıyordu (SatirTiklama, button.satir-ac).

           Şimdi kurum bir başlık satırı: simge, ad, altında kapalı erişim
           özeti, sağda kişi sayısı ve aç/kapa düğmesi. Altında kişi
           satırları: rol · e-posta · ürünler tek satırda, sağ uçta erişim
           anahtarı. Kişi satırının açılacak bir ekranı yok; ok bu yüzden
           yok. */
        <KListe>
          {gruplar.flatMap((grup) => {
            // Arama yapılırken gruplar kendiliğinden açık.
            const acikMi = Boolean(aranan) || acilanlar.has(grup.anahtar);
            const grupAlt = grup.acik < grup.kisiler.length ? `${grup.kisiler.length - grup.acik} erişimi kapalı` : "tümünün erişimi açık";
            const baslikSatiri = (
              <KOge
                key={grup.anahtar}
                simge={grup.ad}
                baslik={grup.ad}
                alt={grupAlt}
                deger={grup.kisiler.length}
                degerAlt="kişi"
                sonu={
                  /* Ok, grubun açık mı kapalı mı olduğunu söyleyen tek
                     işaret: açıkken döner (platform.css'teki kuralın
                     karşılığı; o kural tablo satırının data-acik'ine
                     bakıyordu, iOS satırında o kap yok). */
                  <button
                    type="button"
                    className="plt-uye-grup-ok"
                    aria-expanded={acikMi}
                    aria-label={`${grup.ad}: ${acikMi ? "kişileri gizle" : "kişileri göster"}`}
                    onClick={() => cevir(grup.anahtar)}
                    style={{ border: 0, cursor: "pointer", ...(acikMi ? { transform: "rotate(90deg)", color: "var(--primary)" } : null) }}
                  >›</button>
                }
              />
            );
            if (!acikMi) return [baslikSatiri];
            return [baslikSatiri, ...grup.kisiler.map((kisi) => {
              const islem = kisi.organizationId ? `${kisi.organizationId}:${kisi.userId}` : null;
              const rolAdi = kisi.rol ? ROL_ADI[kisi.rol] ?? kisi.rol : "—";
              /* Ürün adının yanında kendi durumu: kişinin kurumdaki
                 üyeliği açık olsa bile o ürünün lisansı kapalıysa ürüne
                 giremiyor. (Eskiden renkli etiketti, kapalı olan soluk.) */
              const urunler = kisi.urunler
                .map((rozet) => `${URUN_ADI[rozet.product]}${rozet.access ? "" : ` (${DURUM_ADI[rozet.status] ?? rozet.status})`}`)
                .join(", ");
              return (
                <KOge
                  key={kisi.anahtar}
                  simge={kisi.ad}
                  baslik={kisi.ad}
                  alt={[rolAdi !== "—" ? rolAdi : null, kisi.eposta && kisi.eposta !== kisi.ad ? kisi.eposta : null, urunler].filter(Boolean).join(" · ")}
                  durum={kisi.erisimVar ? null : { etiket: "Erişim kapalı", ton: "danger" }}
                  sonu={kisi.organizationId ? (
                    <button
                      type="button"
                      className={kisi.membershipActive ? "plt-switch is-on" : "plt-switch is-off"}
                      role="switch"
                      aria-checked={Boolean(kisi.membershipActive)}
                      aria-label={`${kisi.ad} · ${grup.ad} erişimi: ${kisi.membershipActive ? "kapat" : "aç"}`}
                      disabled={islenen === islem}
                      onClick={() => degistir(kisi, grup.ad)}
                    ><i /></button>
                  ) : (
                    /* ArvoLab ayrı veritabanında, bireysel abone ise
                       Bireysel Aboneler ekranından yönetiliyor. Boş
                       bırakmak yerine nedenini yazıyoruz. */
                    <span className="k-ios-alt">
                      {kisi.individual ? "Bireysel abonelerden" : "ArvoLab'dan"}
                    </span>
                  )}
                />
              );
            })];
          })}
        </KListe>
      ) : (
        <KBos baslik="Aramanıza uyan üye yok" />
      )}
    </section>
  );
}
