import Link from "next/link";
import type { Donem } from "@/lib/konsol/donem";
import type { Olcum, UrunSatiri } from "@/lib/konsol/urun-performansi";
import "./urun-genel-bakis.css";

/*
  ÜRÜN DETAYI — GENEL BAKIŞ SEKMESİ (26.11.2026, onaylı mockup).

  Şerit, deneme dönüşümü ve işlem bekleyenler. Sayılar Genel Bakış'taki
  tabloyla AYNI çekirdekten (lib/konsol/urun-performansi): iki ekranda
  iki farklı sayı çıkmasın.

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
          <dt>Aktif müşteri</dt>
          <small>bugün</small>
          <dd><Deger olcum={satir.aktifMusteri} bicim={sayi} /></dd>
        </div>
        <div>
          <dt>Denemeden ücretliye</dt>
          <small>{donem.etiket}</small>
          <dd>
            {donusum.durum === "var"
              ? donusum.deger.oran === null
                ? <span className="ugb-yok">Dönemde deneme yok</span>
                : <>%{Math.round(donusum.deger.oran * 100)}</>
              : <Deger olcum={donusum.durum === "kaynak_yok" ? { durum: "kaynak_yok" } : { durum: "okunamadi" }} bicim={sayi} />}
          </dd>
        </div>
        <div>
          <dt>Tahsilat</dt>
          <small>{donem.etiket}</small>
          <dd><Deger olcum={satir.tahsilat} bicim={para} /></dd>
        </div>
      </dl>

      <div className="ugb-izgara">
        <article className="panel-card ugb-kart">
          <header className="fn-alt-bas"><h2>Deneme dönüşümü</h2><small>{donem.etiket} · bireysel aboneler</small></header>
          {donusum.durum === "kaynak_yok" ? (
            <p className="ugb-bos">
              <b>Veri bağlı değil.</b> Bu üründe bireysel abone yok; kurum lisansında
              durum geçmişi tutulmadığı için &quot;deneme → ücretli&quot; geçişi ölçülemiyor.
            </p>
          ) : donusum.durum === "okunamadi" ? (
            <p className="ugb-bos" data-tone="danger"><b>Veri okunamadı.</b> Abone kayıtları ya da ödemeler bu açılışta okunamadı.</p>
          ) : (
            <>
              <ol className="ugb-huni">
                <li><span>Denemeye başlayan</span><b>{sayi(donusum.deger.denemeye)}</b></li>
                <li><span>Ücretliye geçen</span><b>{sayi(donusum.deger.ucretliye)}</b></li>
              </ol>
              {/*
                İKİ ADIM, ÜÇ DEĞİL. Mockup'taki "İlk çalışmayı oluşturan"
                adımı çizilmiyor: ürünün kendi veritabanındaki etkinlik
                köprüden ABONE KIRILIMIYLA gelmiyor (lib/urun-kullanimi
                yalnızca toplam veriyor). Kaynağı olmayan bir adımı huniye
                koymak oranı uydurmak olurdu.
              */}
              <p className="ugb-not">
                İlk kullanım adımı <b>veri bağlı değil</b>: ürünün etkinliği köprüden abone kırılımıyla gelmiyor.
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
