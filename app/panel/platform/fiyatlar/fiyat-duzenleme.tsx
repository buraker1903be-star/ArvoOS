import { Fragment } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { ADD_ONS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, planlar, urunAdi } from "@/lib/site/pricing";
import { birimliPlanTutari, cokParaliBirlestir, type CokParaliSatir } from "@/lib/site/fiyat-kaynagi";
import { SATIS_PARA_BIRIMLERI, paraYaz, tutar as paraTutari, type ParaBirimi } from "@/lib/para";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi, type FiyatKaydi } from "@/lib/fiyat-dogrulama";
import { fiyatlariYayimla, koddakiDegerleriTaslagaAl, taslagiGeriAl, taslagiKaydet, yayindanKaldir } from "../urunler/actions";
import { sayi } from "../bicim";
import { KKart, KListe, KNot, KOge } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";
import { YayimOnizlemesi } from "./fiyat-yayim-onizlemesi";

/*
  FİYAT DÜZENLEME — İKİ ROTANIN PAYLAŞTIĞI BÖLÜM (27.11.2026).

  Fiyat yönetimi 27.11.2026'ya kadar yalnızca /panel/platform/fiyatlar
  ekranındaydı; ürün detayındaki "Fiyat basamakları" bölümü salt
  okunurdu ve "Fiyatları düzenle" düğmesi kullanıcıyı ürün bağlamından
  çıkarıp o ekrana atıyordu. Artık aynı akış ürünün kendi sekmesinde
  çalışıyor; bileşen tek, çağıran iki.

  YETKİ DEĞİŞMEDİ. Bütün yazma işlemleri aynı sunucu işlemleri
  (../urunler/actions): her biri isPlatformOwner ve
  konsolAlaniniDogrula(..., "urunler") kapısından geçiyor. Bu bölümün
  ürün detayından çağrılması yeni bir uç nokta açmıyor.

  YAYIM LİSTENİN TAMAMINI KAPSAR. `fiyatlariYayimla` bekleyen BÜTÜN
  taslakları tek UPDATE ile yayımlıyor (14.10.2026 kararı: yarı güncel
  bir liste yayımlanmasın). Bu bölüm bir ürünün içinde durduğu için
  tehlike şu: ArvoLab'ı düzenleyen kurucu "3 değişikliği yayımla"
  derken ArvoOS'ta bekleyen bir taslağı da yayımlar. Önizleme bu
  yüzden BÜTÜN bekleyenleri gösteriyor ve başka ürüne ait olanlar
  ayrıca yazılıyor — düğmenin ne yapacağı ekranda okunuyor.
*/

export type FiyatUrunu = Parameters<typeof planlar>[0] | "ek";

/*
  Ek kalemlerin konsoldaki adı. Pazarlama metni (app/(site)/_content)
  BURAYA IMPORT EDİLMİYOR: o ağacı panel rotasına çekmek site
  sınıflarını da sürüklüyor ve CSS denetimi haklı olarak kırılıyor.
  RAKAM yine tek kaynakta (lib/site/pricing → ADD_ONS).
*/
export const EK_KALEM_ADI: Record<string, string> = {
  "ek-kullanici": "Ek kullanıcı",
  "ek-sube": "Ek şube",
  "veri-aktarimi": "Veri aktarımı ve kurulum",
  "ozel-gelistirme": "Kuruma özel geliştirme",
};

/*
  Fiyat satırı: yayındaki tutar, yıllık karşılığı, taslak kutusu ve iki
  düğme. Taslak ile yayın AYRI: tek adım olsaydı yanlış yazılan bir
  rakam yazıldığı anda sitede görünürdü.
*/
export function FiyatSatiri({ kod, ad, birim, cozulmus, kayitlar, yillik }: {
  kod: string;
  ad: string;
  birim: string;
  /** Sitede şu an geçerli tutarlar (kod + yayımlanmış veritabanı değeri). */
  cozulmus: ReturnType<typeof cokParaliBirlestir>;
  /** Anahtar `kod|BIRIM`. */
  kayitlar: Map<string, FiyatKaydi>;
  yillik?: boolean;
}) {
  const hucre = (pb: ParaBirimi) => {
    const kayit = kayitlar.get(`${kod}|${pb}`);
    const gecerli = birimliPlanTutari(kod, pb, cozulmus);
    const taslak = kayit?.taslak_kurus ?? null;
    return {
      pb,
      kayit,
      gecerli,
      taslak,
      konsoldan: Boolean(kayit?.yayimlandi_at),
      bekliyor: Boolean(kayit?.taslak_bekliyor),
      yazi: gecerli === null ? "Teklif" : paraYaz(paraTutari(gecerli, pb)),
      yillikYazi: gecerli === null ? "yıllık teklif" : `${paraYaz(paraTutari(gecerli * YILLIK_ODENEN_AY, pb))} / yıl`,
    };
  };
  const hucreler = SATIS_PARA_BIRIMLERI.map(hucre);
  const bekleyen = hucreler.filter((h) => h.bekliyor);
  const durum = bekleyen.length
    ? {
        etiket: bekleyen
          .map((h) => `${h.pb} → ${h.taslak === null ? "Teklif" : paraYaz(paraTutari(h.taslak, h.pb))}`)
          .join(" · "),
        ton: "warning",
      }
    : null;

  return (
    <tr>
      <td data-label="Basamak">
        <span className="crm-table-title">{ad}</span>
        <span className="crm-table-sub">{birim} · <span className="plt-mono">{kod}</span></span>
      </td>
      {/*
        HER PARA BİRİMİ KENDİ HÜCRESİNDE (28.11.2026). Eskiden ekranda
        iki ayrı fiyat tablosu vardı ve ikisi de TL'ydi; USD rakamları
        yalnızca sitede, elle yazılı duruyordu. Artık tek satırda
        planın TRY ve USD fiyatı yan yana: yayındaki değer, yıllık
        karşılığı ve kendi taslak kutusu. İki birim BAĞIMSIZ —
        birindeki tutar ötekine kopyalanmıyor.
      */}
      {hucreler.map((h) => (
        <td key={h.pb} className="crm-col-amount" data-label={`Yayında (${h.pb})`}>
          <span className="crm-table-title">{h.yazi}</span>
          <small>{yillik ? h.yillikYazi : "aylık"}</small>
          <small className="crm-table-sub">{h.konsoldan ? "konsoldan yayımlı" : "koddaki değer"}</small>
          <div className="plt-fiyat-eylem">
            <form action={taslagiKaydet} className="plt-fiyat-form">
              <input type="hidden" name="kod" value={kod} />
              <input type="hidden" name="para_birimi" value={h.pb} />
              {/* Para kutusu type="number" DEĞİL: iki ayırıcılı tutarı
                  ("1.234.567") sayı kutusu geçersiz sayıp boşaltıyor. */}
              <input type="text" name="tutar" inputMode="decimal"
                defaultValue={h.taslak === null ? "" : String(h.taslak / 100)}
                placeholder="boş = teklif" aria-label={`${ad} ${h.pb} taslak tutar`} />
              <button className="panel-secondary" type="submit">Kaydet</button>
            </form>
            {h.bekliyor ? (
              <form action={taslagiGeriAl}>
                <input type="hidden" name="kod" value={kod} />
                <input type="hidden" name="para_birimi" value={h.pb} />
                <button className="panel-secondary" type="submit">Geri al</button>
              </form>
            ) : null}
            {h.konsoldan ? (
              <form action={yayindanKaldir}>
                <input type="hidden" name="kod" value={kod} />
                <input type="hidden" name="para_birimi" value={h.pb} />
                <button className="panel-secondary" type="submit">Koda dön</button>
              </form>
            ) : null}
          </div>
        </td>
      ))}
      <MobilSatir
        baslik={ad}
        durum={durum}
        alt={[...hucreler.map((h) => `${h.pb}: ${h.yazi}`), birim]}
      />
    </tr>
  );
}

/** Bir kodun hangi ürüne ait olduğu; önizlemedeki "başka ürün" notu için. */
function kodunUrunu(kod: string): string {
  if (ADD_ONS.some((a) => a.code === kod)) return "Ek hizmetler";
  for (const u of ["arvoos", "arvolab", "arc", "randevu"] as const) {
    if (planlar(u).some((p) => p.code === kod)) return urunAdi(u);
  }
  return "Bilinmeyen";
}

/** Fiyat kayıtlarını okuyup çözülmüş tutarları ve denetimi hazırlar. */
export async function fiyatVerisi() {
  const { supabase } = await getPanelContext();
  /* Kurucu taslağı da görüyor (RLS: kurucu_fiyati_okur); site yalnızca
     yayımlanmış satırı okuyor. "*": taslak_bekliyor sütunu 20261014064505
     ile geldi; uygulanmadan önce de ekran açılsın. */
  /* sınırsız-tamam: fiyat kataloğu: ürün × paket, elle yönetilen onlarca satır */
  const { data, error } = await supabase.from("platform_fiyat_listesi").select("*");
  /* Fiyat listesi düşerse YAYIMLANMIŞ tutarlar görünmez ve ekran koddaki
     varsayılanları yayımlıymış gibi gösterir. Sessiz kalmamalı: buradan
     müşteriye giden fiyat yayımlanıyor. */
  if (error) throw new Error("Fiyat listesi okunamadı: " + error.message);
  const kayitlariHam = ((data ?? []) as Parameters<typeof fiyatKaydi>[0][]).map(fiyatKaydi);
  /* Anahtar kod+birim: aynı planın TRY ve USD satırı birlikte yaşıyor. */
  const kayitlar = new Map(kayitlariHam.map((satir) => [`${satir.kod}|${satir.para_birimi}`, satir]));
  const cozulmus = cokParaliBirlestir(
    kayitlariHam
      .filter((satir) => satir.yayimlandi_at)
      .map((satir): CokParaliSatir => ({ kod: satir.kod, paraBirimi: satir.para_birimi, aylikKurus: satir.aylik_kurus })),
  );
  const degisiklikler = bekleyenDegisiklikler(kayitlariHam, cozulmus);
  const denetim = fiyatDenetimi(yayimSonrasi(cozulmus, degisiklikler), degisiklikler);
  /*
    KAPSAM İMZASI VERİTABANINDAN (28.11.2026). Eskiden arayüz imzayı
    kendi hesaplıyordu ve biçim iki yerde yaşıyordu; yayım işlevi
    biçimi değiştirdiğinde (çok para birimi) uygulama ile veritabanı
    ayrışıyor, dağıtım ile migration arasındaki aralıkta yayım hiç
    çalışmıyordu. Artık önizleme, veritabanının O ANDA ürettiği imzayı
    taşıyor: iki taraf tanım gereği aynı biçimi konuşuyor.
    Okunamazsa null kalıyor ve yayım düğmesi onay kutusuna rağmen
    reddediliyor — sessizce yanlış kapsam göndermektense durmak doğru.
  */
  const { data: imza } = await supabase.rpc("platform_fiyat_kapsam_imzasi");
  return {
    kayitlar,
    cozulmus,
    degisiklikler,
    denetim,
    kapsam: typeof imza === "string" ? imza : null,
    yayimliSayisi: kayitlariHam.filter((satir) => satir.yayimlandi_at).length,
  };
}

/**
 * Bir ürünün fiyat basamakları: taslak düzenleme tablosu ve yayım
 * önizlemesi. Ürün detayının "Fiyat basamakları" sekmesi ve Fiyatlar
 * ekranının tek ürün görünümü AYNI bileşeni çiziyor.
 */
export async function FiyatDuzenleme({ urun, etkilenenKiraci }: {
  urun: FiyatUrunu;
  /**
   * Liste fiyatından ödeyen ve yayımdan sonra "listeden farklı"
   * görünecek ArvoOS kiracısı sayısı. Kiracı listesini okuyan çağıran
   * veriyor (Fiyatlar ekranı zaten okuyor); verilmediğinde not
   * çizilmiyor — var olmayan bir sayı uydurulmuyor.
   */
  etkilenenKiraci?: number;
}) {
  const { kayitlar, cozulmus, degisiklikler, denetim, kapsam, yayimliSayisi } = await fiyatVerisi();
  const kendiKodlari = new Set(
    urun === "ek" ? ADD_ONS.map((a) => a.code) : planlar(urun).map((p) => p.code),
  );
  /* Önizleme BÜTÜN bekleyenleri gösteriyor; başkalarına ait olanlar
     ayrıca sayılıyor, çünkü düğme hepsini birden yayımlıyor. */
  const baskaUrunler = [...new Set(
    degisiklikler.filter((d) => !kendiKodlari.has(d.kod)).map((d) => kodunUrunu(d.kod)),
  )];
  const basamakAdi = (kod: string) => {
    if (EK_KALEM_ADI[kod]) return EK_KALEM_ADI[kod];
    for (const u of ["arvoos", "arvolab", "arc", "randevu"] as const) {
      const p = planlar(u).find((x) => x.code === kod);
      if (p) return p.ad.tr;
    }
    return kod;
  };

  return (
    <>
      <div className="talep-tablo fn-ic-tablo">
        <table className="crm-data-table" data-cols="ur-fiyat">
          <thead><tr><th>Basamak</th>{SATIS_PARA_BIRIMLERI.map((pb) => <th key={pb} className="crm-col-amount">{pb}</th>)}</tr></thead>
          <tbody>
            {urun === "ek"
              ? ADD_ONS.map((kalem) => (
                  <FiyatSatiri key={kalem.code} kod={kalem.code} ad={EK_KALEM_ADI[kalem.code] ?? kalem.code}
                    birim="ek kalem" cozulmus={cozulmus} kayitlar={kayitlar} />
                ))
              : planlar(urun).map((plan) => (
                  <FiyatSatiri key={plan.code} kod={plan.code} ad={plan.ad.tr}
                    birim={plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}
                    cozulmus={cozulmus} kayitlar={kayitlar} yillik />
                ))}
          </tbody>
        </table>
      </div>

      <YayimOnizlemesi degisiklikler={degisiklikler} denetim={denetim} baskaUrunler={baskaUrunler}
        basamakAdi={basamakAdi} kodunUrunu={kodunUrunu} kendiKodlari={kendiKodlari} etkilenenKiraci={etkilenenKiraci}
        kapsam={kapsam} eylem={fiyatlariYayimla} />

      <KKart baslik="Yayın" aciklama="Taslak hiçbir yerde görünmez; bekleyenler önizlemede birlikte yayımlanır.">
        {/* 14.10.2026: iki sayı kutusu yerine iki iOS satırı; şerit
            bu ikisinden yalnızca birini yazıyor. */}
        <KListe>
          <KOge baslik="Konsoldan yayımlı" alt="kalanı koddaki değer" deger={sayi(yayimliSayisi)} />
          <KOge baslik="Yayım bekleyen" alt="taslak"
            durum={degisiklikler.length ? { etiket: "Önizlemede", ton: "warning" } : null} deger={sayi(degisiklikler.length)} />
        </KListe>
        <KNot>
          Yıllıkta {sayi(YILLIK_ODENEN_AY)} ay bedeliyle 12 ay ({sayi(YILLIK_BEDAVA_AY)} ay bedava). TL tutarlar KDV dahil. Ücretler
          sayfası, JSON-LD, llms-full.txt, kurulum ve ArvoLab bireysel aboneliği bu listeyi okur.
        </KNot>
      </KKart>

      {/*
        LİSTEYİ SAHİPLENME ADIMI (14.10.2026). Hiçbir tutar yayımlı
        değilken site koddaki yedek değerlerle çalışıyor: rakamlar doğru
        ama bir fiyatı değiştirmek hâlâ dağıtım istiyor. İşlem her kodun
        BUGÜN GEÇERLİ değerini taslağa alıyor; yayımlandığında sitede
        hiçbir rakam değişmiyor. Yalnızca gerçekten gerektiğinde
        görünüyor.
      */}
      {!yayimliSayisi && !degisiklikler.length ? (
        <form action={koddakiDegerleriTaslagaAl}>
          <KNot ton="uyari">
            Hiçbir tutar konsoldan yayımlı değil: site koddaki yedek değerleri okuyor ve fiyat değişikliği dağıtım
            gerektiriyor. Koddaki değerleri taslağa alıp yayımlarsanız liste bu ekranın sahipliğine geçer —
            sitedeki rakamlar aynı kalır.
          </KNot>
          <button type="submit" className="panel-secondary">Koddaki değerleri taslağa al</button>
        </form>
      ) : null}
    </>
  );
}
