import Link from "next/link";
import type { Donem } from "@/lib/konsol/donem";
import type { Olcum, UrunSatiri } from "@/lib/konsol/urun-performansi";
import "./urun-genel-bakis.css";

/*
  ÜRÜN DETAYI — GENEL BAKIŞ SEKMESİ (26.11.2026, onaylı mockup).

  Üç metrik yüzeyi, deneme dönüşümü ve işlem bekleyenler. Sayılar Ana
  Sayfa'daki tabloyla AYNI çekirdekten (lib/konsol/urun-performansi):
  iki ekranda iki farklı sayı çıkmasın.

  27.11.2026: metrikler ince bir şerit yerine ÜÇ EŞİT KART (onaylı
  mockup) — ikon, etiket, kapsam ve değer bir arada okunuyor. Kapsam
  etikete bitişik: "Aktif müşteri" anlık bir ölçüm ("bugün"), öteki
  ikisi seçili dönemin.

  "Veri bağlı değil" ile "Veri okunamadı" ayrı yazılır ve ikisinde de
  sıfır basılmaz; okunamayan bir sorgudan gelen 0 "satış yok" diye
  okunur.
*/

function Deger({ olcum, bicim }: { olcum: Olcum<number>; bicim: (n: number) => string }) {
  if (olcum.durum === "kaynak_yok") return <span className="ugb-yok">Veri bağlı değil</span>;
  if (olcum.durum === "okunamadi") return <span className="ugb-yok" data-tone="danger">Veri okunamadı</span>;
  return <>{bicim(olcum.deger)}</>;
}

export type IslemBekleyen = { anahtar: string; baslik: string; alt?: string; href: string; eylem: string };

export function UrunGenelBakis({ satir, donem, para, sayi, bekleyenler }: {
  satir: UrunSatiri;
  donem: Donem;
  para: (n: number) => string;
  sayi: (n: number) => string;
  bekleyenler: IslemBekleyen[];
}) {
  const donusum = satir.donusum;
  return (
    <section className="ugb">
      <dl className="ugb-serit" aria-label={`${satir.ad} · ${donem.etiket}`}>
        <div>
          <dt>Aktif müşteri <small>bugün</small></dt>
          <dd><Deger olcum={satir.aktifMusteri} bicim={sayi} /></dd>
        </div>
        <div>
          <dt>Denemeden ücretliye <small>{donem.etiket}</small></dt>
          <dd>
            {donusum.durum === "var"
              ? donusum.deger.oran === null
                ? <span className="ugb-yok">Dönemde deneme yok</span>
                : <>%{Math.round(donusum.deger.oran * 100)}</>
              : <Deger olcum={donusum.durum === "kaynak_yok" ? { durum: "kaynak_yok" } : { durum: "okunamadi" }} bicim={sayi} />}
          </dd>
        </div>
        <div>
          <dt>Tahsilat <small>{donem.etiket}</small></dt>
          <dd><Deger olcum={satir.tahsilat} bicim={para} /></dd>
        </div>
      </dl>

      <div className="ugb-izgara">
        <article className="panel-card ugb-kart">
          <header className="fn-alt-bas"><h2>Deneme dönüşümü</h2><small>{donem.etiket} · bireysel aboneler</small></header>
          {donusum.durum === "kaynak_yok" ? (
            /* ÖLÇÜTTEKİ DURUM BURADA TEKRARLANMIYOR (27.11.2026).
               Üstteki ölçüt zaten "Veri bağlı değil" yazıyor; kart da
               kalın harflerle aynı cümleyle başlayınca ekranda aynı
               hüküm iki kez okunuyordu. Ölçütte kısa durum, burada
               yalnızca NEDENİ. */
            <p className="ugb-bos">
              Bu üründe bireysel abone yok; kurum lisansında durum geçmişi
              tutulmadığı için &quot;deneme → ücretli&quot; geçişi ölçülemiyor.
            </p>
          ) : donusum.durum === "okunamadi" ? (
            <p className="ugb-bos" data-tone="danger">Abone kayıtları ya da ödemeler bu açılışta okunamadı.</p>
          ) : (
            <>
              <ol className="ugb-huni">
                <li><span>Denemeye başlayan</span><b>{sayi(donusum.deger.denemeye)}</b></li>
                <li><span>Ücretliye geçen</span><b>{sayi(donusum.deger.ucretliye)}</b></li>
                {/* Oran hesaplanmış bir değer, ayrı bir kaynak değil:
                    ücretliye geçen / denemeye başlayan. Payda sıfırsa
                    yukarıdaki dalda zaten "deneme yok" yazıyor. */}
                <li className="ugb-oran"><span>Dönüşüm oranı</span><b>{donusum.deger.oran === null ? "—" : `%${Math.round(donusum.deger.oran * 100)}`}</b></li>
              </ol>
              {/*
                MOCKUP'TAKİ İKİ SATIR ÇİZİLMİYOR, ikisi de kaynaksız:
                "ortalama deneme süresi" için abone başına deneme
                başlangıç/bitiş geçmişi tutulmuyor (product_subscribers
                yalnızca mevcut trial_ends_at'i taşıyor), "ilk çalışmayı
                oluşturan" için de ürünün etkinliği köprüden ABONE
                KIRILIMIYLA gelmiyor (lib/urun-kullanimi yalnızca toplam
                veriyor). Örnek bir ortalamayı gerçek veri gibi yazmak
                bu ekranın tek işini — güvenilir sayı — bozardı.
              */}
              <p className="ugb-not">
                Ortalama deneme süresi ve ilk kullanım adımı <b>veri bağlı değil</b>: abone başına deneme geçmişi tutulmuyor,
                ürün etkinliği de köprüden abone kırılımıyla gelmiyor.
              </p>
            </>
          )}
        </article>

        <article className="panel-card ugb-kart">
          <header className="fn-alt-bas"><h2>İşlem bekleyenler</h2><small>Satır ilgili kayda açılır</small></header>
          {bekleyenler.length ? (
            <ul className="ugb-liste">
              {bekleyenler.map((b) => (
                <li key={b.anahtar}>
                  <Link href={b.href}>
                    <span className="ugb-govde"><b>{b.baslik}</b>{b.alt ? <small>{b.alt}</small> : null}</span>
                    <span className="ugb-eylem">{b.eylem}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="ugb-bos">Bekleyen işlem yok.</p>}
        </article>
      </div>
    </section>
  );
}
