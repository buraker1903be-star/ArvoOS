import { Fragment } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { ADD_ONS, YILLIK_BEDAVA_AY, YILLIK_ODENEN_AY, planlar, urunAdi } from "@/lib/site/pricing";
import { fiyatlariBirlestir } from "@/lib/site/fiyat-kaynagi";
import { bekleyenDegisiklikler, fiyatDenetimi, fiyatKaydi, yayimSonrasi, type FiyatKaydi } from "@/lib/fiyat-dogrulama";
import { fiyatlariYayimla, koddakiDegerleriTaslagaAl, taslagiGeriAl, taslagiKaydet, yayindanKaldir } from "../urunler/actions";
import { para, sayi } from "../bicim";
import { KKart, KListe, KNot, KOge } from "../konsol-ui";
import { MobilSatir } from "../../crm/table-cells";

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
export function FiyatSatiri({ kod, ad, birim, cozulmus, kayit, yillik }: {
  kod: string;
  ad: string;
  birim: string;
  /** Sitede şu an geçerli tutar (kod + yayımlanmış veritabanı değeri). */
  cozulmus: number | null;
  kayit?: FiyatKaydi;
  yillik?: boolean;
}) {
  const konsoldan = Boolean(kayit?.yayimlandi_at);
  const taslak = kayit?.taslak_kurus ?? null;
  const bekliyor = Boolean(kayit?.taslak_bekliyor);
  const durum = bekliyor ? { etiket: `Yayım bekliyor: ${taslak === null ? "Teklif" : para(taslak)}`, ton: "warning" } : null;
  return (
    <tr>
      <td data-label="Basamak">
        <span className="crm-table-title">{ad}</span>
        <span className="crm-table-sub">{birim} · <span className="plt-mono">{kod}</span></span>
      </td>
      <td data-label="Kaynak">
        <span className="crm-table-sub">{konsoldan ? "konsoldan yayımlı" : "koddaki değer"}</span>
        {durum ? <span className="status-pill" data-tone="warning">{durum.etiket}</span> : null}
      </td>
      <td className="crm-col-amount" data-label="Yayında">
        <span className="crm-table-title">{cozulmus === null ? "Teklif" : para(cozulmus)}</span>
        {/* Yıllıkta 10 ay bedeli ödeniyor; ek kalemler aylık, orada yıllık yok. */}
        <small>{yillik ? (cozulmus === null ? "yıllık teklif" : `${para(cozulmus * YILLIK_ODENEN_AY)} / yıl`) : "aylık"}</small>
      </td>
      <td className="crm-table-actions">
        {/* Yayım satır başına değil, önizlemeden TOPLU (14.10.2026):
            liste ya tamamen eski ya tamamen yeni. */}
        <div className="plt-fiyat-eylem">
          <form action={taslagiKaydet} className="plt-fiyat-form">
            <input type="hidden" name="kod" value={kod} />
            <input type="text" name="tutar" inputMode="decimal"
              defaultValue={taslak === null ? "" : String(taslak / 100)}
              placeholder="boş = teklif" aria-label={`${ad} taslak tutar`} />
            <button className="panel-secondary" type="submit">Kaydet</button>
          </form>
          {bekliyor ? (
            <form action={taslagiGeriAl}>
              <input type="hidden" name="kod" value={kod} />
              <button className="panel-secondary" type="submit">Geri al</button>
            </form>
          ) : null}
          {konsoldan ? (
            <form action={yayindanKaldir}>
              <input type="hidden" name="kod" value={kod} />
              <button className="panel-secondary" type="submit">Koda dön</button>
            </form>
          ) : null}
        </div>
      </td>
      <MobilSatir baslik={ad} durum={durum} alt={[cozulmus === null ? "Teklif" : para(cozulmus), birim, konsoldan ? "konsoldan yayımlı" : "koddaki değer"]} />
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
  const kayitlar = new Map(kayitlariHam.map((satir) => [satir.kod, satir]));
  const cozulmus = fiyatlariBirlestir(
    kayitlariHam.filter((satir) => satir.yayimlandi_at).map((satir) => ({ kod: satir.kod, aylikKurus: satir.aylik_kurus })),
  );
  const degisiklikler = bekleyenDegisiklikler(kayitlariHam, cozulmus);
  const denetim = fiyatDenetimi(yayimSonrasi(cozulmus, degisiklikler), degisiklikler);
  return {
    kayitlar,
    cozulmus,
    degisiklikler,
    denetim,
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
  const { kayitlar, cozulmus, degisiklikler, denetim, yayimliSayisi } = await fiyatVerisi();
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
  const tutarYazi = (kurus: number | null) => (kurus === null ? "Teklif" : para(Number(kurus)));

  return (
    <>
      <div className="talep-tablo fn-ic-tablo">
        <table className="crm-data-table" data-cols="ur-fiyat">
          <thead><tr><th>Basamak</th><th>Kaynak</th><th className="crm-col-amount">Yayında</th><th className="fn-eylem-bas">Taslak</th></tr></thead>
          <tbody>
            {urun === "ek"
              ? ADD_ONS.map((kalem) => (
                  <FiyatSatiri key={kalem.code} kod={kalem.code} ad={EK_KALEM_ADI[kalem.code] ?? kalem.code}
                    birim="ek kalem" cozulmus={cozulmus.get(kalem.code) ?? null} kayit={kayitlar.get(kalem.code)} />
                ))
              : planlar(urun).map((plan) => (
                  <FiyatSatiri key={plan.code} kod={plan.code} ad={plan.ad.tr}
                    birim={plan.kisiBasi ? `kullanıcı başına${plan.enAzKullanici ? ` · en az ${plan.enAzKullanici}` : ""}` : "kurum başına"}
                    cozulmus={cozulmus.get(plan.code) ?? null} kayit={kayitlar.get(plan.code)} yillik />
                ))}
          </tbody>
        </table>
      </div>

      {degisiklikler.length ? (
        <KKart
          baslik={`Yayım önizlemesi · ${sayi(degisiklikler.length)} değişiklik`}
          aciklama={<>
            Yayımlanınca ücretler sayfasında (TR ve EN), arama motorlarına giden fiyat bilgisinde (JSON-LD), llms-full.txt&apos;de
            (en geç on dakika içinde), kurulumun &quot;liste fiyatını uygula&quot; tutarında ve ArvoLab bireysel aboneliğinde
            geçerli olur. Liste tek seferde, birlikte yayımlanır.
          </>}
          sag={(
            <form action={fiyatlariYayimla} className="plt-fiyat-yayim">
              {denetim.uyarilar.length ? (
                <label className="plt-fiyat-onay"><input type="checkbox" name="onay" value="evet" required /> Uyarıları okudum, bu tutarlar doğru.</label>
              ) : null}
              {/*
                BAŞKA ÜRÜN VARSA AYRI ONAY (27.11.2026, kapanış turu ·
                madde 4). Toplu yayım kuralı DEĞİŞMEDİ, ama bölüm artık
                bir ürünün içinde duruyor: ArvoLab'ı düzenleyen kurucu
                başka ürünün taslağını farkında olmadan yayımlayabilir.
                Etkilenen ürünler yukarıda tek tek listeleniyor ve bu
                kutu işaretlenmeden düğme çalışmıyor.
              */}
              {baskaUrunler.length ? (
                <label className="plt-fiyat-onay">
                  <input type="checkbox" name="kapsam-onayi" value="evet" required />{" "}
                  {baskaUrunler.join(", ")} değişikliklerinin de yayımlanacağını anladım.
                </label>
              ) : null}
              <button className="panel-primary" type="submit" disabled={denetim.hatalar.length > 0}>
                {sayi(degisiklikler.length)} değişikliği yayımla
              </button>
            </form>
          )}
        >
          {/*
            BAŞKA ÜRÜNÜN TASLAĞI DA YAYIMLANIR (27.11.2026). Bölüm artık
            ürünün içinde duruyor ve düğme "3 değişikliği yayımla"
            diyor; o üçün biri başka üründe olabilir. Kural
            değiştirilmedi (toplu yayım bilerek böyle, 14.10.2026),
            ekranda YAZILIYOR.
          */}
          {baskaUrunler.length ? (
            <KNot ton="uyari">
              <b>Bu liste tek seferde yayımlanır.</b> Yayımlayınca aşağıdaki ürünlerin bekleyen değişiklikleri de canlıya çıkar:
              <br />
              {/* Ürün başına KAÇ değişiklik: "başka ürünler de var"
                  cümlesi tek başına kapsamı söylemiyor. */}
              {baskaUrunler.map((u) => `${u} (${sayi(degisiklikler.filter((d) => kodunUrunu(d.kod) === u).length)})`).join(" · ")}
            </KNot>
          ) : null}
          <KListe>
            {degisiklikler.map((d) => {
              const degisim = d.yuzde === null ? "—" : `%${d.yuzde > 0 ? "+" : ""}${d.yuzde.toLocaleString("tr-TR")}`;
              const buyuk = d.yuzde !== null && Math.abs(d.yuzde) >= 50;
              return (
                <KOge
                  key={d.kod}
                  baslik={basamakAdi(d.kod)}
                  alt={<span className="plt-mono">{kendiKodlari.has(d.kod) ? d.kod : `${kodunUrunu(d.kod)} · ${d.kod}`}</span>}
                  deger={tutarYazi(d.yeni)}
                  degerAlt={<>önce {tutarYazi(d.eski)} · <span className={buyuk ? "talep-uyari" : undefined}>{degisim}</span></>}
                />
              );
            })}
          </KListe>
          {denetim.hatalar.length ? (
            <KNot ton="tehlike">
              <b>Bu liste yayımlanamaz.</b>
              {denetim.hatalar.map((h) => <Fragment key={h}><br />{h}</Fragment>)}
            </KNot>
          ) : null}
          {denetim.uyarilar.length ? (
            <KNot ton="uyari">
              <b>Yayımlamadan önce kontrol edin.</b>
              {denetim.uyarilar.map((u) => <Fragment key={u}><br />{u}</Fragment>)}
            </KNot>
          ) : null}
          {etkilenenKiraci ? (
            <KNot>
              Liste fiyatından ödeyen {sayi(etkilenenKiraci)} ArvoOS kiracısının ücreti kendiliğinden değişmez (yürürlükteki
              dönem korunur); yayımdan sonra Kurulumlar&apos;da &quot;listeden farklı&quot; görünürler.
            </KNot>
          ) : null}
        </KKart>
      ) : null}

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
