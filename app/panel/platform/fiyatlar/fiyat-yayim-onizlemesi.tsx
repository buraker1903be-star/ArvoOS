import { kapsamImzasi } from "@/lib/fiyat-dogrulama";
import { paraYaz, tutar as paraTutari, type ParaBirimi } from "@/lib/para";
import { Fragment } from "react";
import { sayi } from "../bicim";
import { KKart, KListe, KNot, KOge } from "../konsol-ui";

/**
 * YAYIM ÖNİZLEMESİ — SAF (27.11.2026, kapanış turu · madde 4/5).
 *
 * Veri okumasından ayrıldı ki ölçüm düzeneği onu ÖRNEK GİRDİYLE
 * çizebilsin: onay penceresinin kanıtı elle yazılmış bir taklitten
 * değil, ÜRETİMİN çizdiği bileşenden geliyor. Kapsam uyarısının ve
 * onay kutusunun gerçekten göründüğünü ancak böyle gösterebiliyoruz.
 *
 * Yayım kuralı burada DEĞİŞMİYOR; bu bileşen yalnızca çiziyor.
 */
export function YayimOnizlemesi({ degisiklikler, denetim, baskaUrunler, basamakAdi, kodunUrunu, kendiKodlari, etkilenenKiraci, eylem }: {
  degisiklikler: { kod: string; paraBirimi: ParaBirimi; eski: number | null; yeni: number | null; yuzde: number | null }[];
  denetim: { hatalar: string[]; uyarilar: string[] };
  baskaUrunler: string[];
  basamakAdi: (kod: string) => string;
  kodunUrunu: (kod: string) => string;
  kendiKodlari: Set<string>;
  etkilenenKiraci?: number;
  /**
   * Yayım sunucu işlemi. PROP olarak geçiyor ki bu dosya sunucu
   * modüllerini import etmesin: ölçüm düzeneği bileşeni tarayıcıda
   * çizebiliyor ve onay penceresinin kanıtı taklit değil, üretimin
   * kendisi oluyor. Üretimde `fiyatlariYayimla` geçiliyor.
   */
  eylem?: (formData: FormData) => void | Promise<void>;
}) {
  /* Tutar KENDİ para biriminde yazılıyor: aynı listede TRY ve USD
     satırları yan yana durabiliyor ve "4.990" ile "119" rakamlarının
     hangi birimde olduğu satırdan okunmalı. */
  const tutarYazi = (kurus: number | null, birim: ParaBirimi) => (kurus === null ? "Teklif" : paraYaz(paraTutari(Number(kurus), birim)));
  if (!degisiklikler.length) return null;
  return (
        <KKart
          baslik={`Yayım önizlemesi · ${sayi(degisiklikler.length)} değişiklik`}
          aciklama={<>
            Yayımlanınca ücretler sayfasında (TR ve EN), arama motorlarına giden fiyat bilgisinde (JSON-LD), llms-full.txt&apos;de
            (en geç on dakika içinde), kurulumun &quot;liste fiyatını uygula&quot; tutarında ve ArvoLab bireysel aboneliğinde
            geçerli olur. Liste tek seferde, birlikte yayımlanır.
          </>}
          sag={(
            <form id="fiyat-yayim-formu" action={eylem} className="plt-fiyat-yayim">
              {/*
                KAPSAM İMZASI (27.11.2026): bu önizlemede GÖSTERİLEN
                taslak kümesi. İşlem onu yeniden hesaplayıp
                karşılaştırıyor; arada başka bir sekmede ya da başka
                bir kurucu tarafından yeni bir basamak taslağa
                alınırsa onay düşüyor ve liste yeniden gösteriliyor.
                Yoksa kurucu görmediği bir değişikliği yayımlamış
                oluyordu.
              */}
              <input type="hidden" name="kapsam" value={kapsamImzasi(degisiklikler)} />
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
              {/*
                ONAY KUTUSU LİSTENİN ALTINDA, form'a `form` özniteliğiyle
                bağlı (27.11.2026). Başlık satırındayken iki onay kutusu
                ve düğme kartın açıklamasını kırpıyordu; üstelik
                "neyi onaylıyorum" sorusunun cevabı burada, etkilenen
                ürünlerin hemen altında.
              */}
              <label className="plt-fiyat-onay plt-fiyat-kapsam">
                <input type="checkbox" form="fiyat-yayim-formu" name="kapsam-onayi" value="evet" required />{" "}
                {baskaUrunler.join(", ")} değişikliklerinin de yayımlanacağını anladım.
              </label>
            </KNot>
          ) : null}
          <KListe>
            {degisiklikler.map((d) => {
              const degisim = d.yuzde === null ? "—" : `%${d.yuzde > 0 ? "+" : ""}${d.yuzde.toLocaleString("tr-TR")}`;
              const buyuk = d.yuzde !== null && Math.abs(d.yuzde) >= 50;
              return (
                <KOge
                  key={`${d.kod}|${d.paraBirimi}`}
                  baslik={`${basamakAdi(d.kod)} · ${d.paraBirimi}`}
                  alt={<span className="plt-mono">{kendiKodlari.has(d.kod) ? d.kod : `${kodunUrunu(d.kod)} · ${d.kod}`}</span>}
                  deger={tutarYazi(d.yeni, d.paraBirimi)}
                  degerAlt={<>önce {tutarYazi(d.eski, d.paraBirimi)} · <span className={buyuk ? "talep-uyari" : undefined}>{degisim}</span></>}
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
  );
}
