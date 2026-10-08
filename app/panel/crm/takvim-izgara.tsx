import Link from "next/link";
import type { ReactNode } from "react";

/*
  TAKVİM IZGARASI (2026-10). Satış takvimi (randevular) ve iş takvimi
  (termin ve aşama tarihleri) aynı ay ızgarasını ve gün listesini
  kullanıyor; eskiden iki sayfada ayrı ayrı yazılıydı ve ızgara sayfa
  boyunca uzayıp seçili gün panelini ekranın altına itiyordu. Izgara artık
  bulunduğu kutunun yüksekliğini dolduruyor (takvim.css), seçili gün yanda.

  Saf çizim: veri ve bağlantılar sayfadan geliyor.
*/

export type TakvimMaddesi = { anahtar: string; etiket: string; tur?: string; ton?: string };

const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const pad = (n: number) => String(n).padStart(2, "0");
export const gunAnahtari = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ayAnahtari = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** "2026-10" → ayın ilk günü; geçersizse bugünün ayı (bugun: "YYYY-MM-DD", Türkiye). */
export function ayBasi(deger: string | undefined, bugun: string) {
  const [y, m] = (deger && /^\d{4}-\d{2}$/.test(deger) ? deger : bugun.slice(0, 7)).split("-").map(Number);
  return new Date(y, m - 1, 1);
}
/** "2026-10-08" → o gün; geçersizse bugün. */
export function gunTarihi(deger: string | undefined, bugun: string) {
  const [y, m, d] = (deger && /^\d{4}-\d{2}-\d{2}$/.test(deger) ? deger : bugun).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ayIzgarasi(ay: Date) {
  const ilkGun = (ay.getDay() + 6) % 7; // Pazartesi = 0
  const gunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
  const hucreler: { tarih: Date; ayIcinde: boolean }[] = [];
  for (let i = 0; i < ilkGun; i++) hucreler.push({ tarih: new Date(ay.getFullYear(), ay.getMonth(), i - ilkGun + 1), ayIcinde: false });
  for (let g = 1; g <= gunSayisi; g++) hucreler.push({ tarih: new Date(ay.getFullYear(), ay.getMonth(), g), ayIcinde: true });
  while (hucreler.length % 7 !== 0) {
    const son = hucreler[hucreler.length - 1].tarih;
    hucreler.push({ tarih: new Date(son.getFullYear(), son.getMonth(), son.getDate() + 1), ayIcinde: false });
  }
  return hucreler;
}

export function TakvimIzgarasi({ ay, maddeler, seciliGun, bugun, gunHref }: {
  ay: Date;
  /** Gün anahtarı → o günün maddeleri. */
  maddeler: Map<string, TakvimMaddesi[]>;
  seciliGun: string;
  bugun: string;
  gunHref: (gun: string) => string;
}) {
  const hucreler = ayIzgarasi(ay);
  return (
    <div className="tk-ay" style={{ ["--tk-satir" as string]: String(hucreler.length / 7) }}>
      <div className="tk-gunler" aria-hidden="true">{GUNLER.map((g) => <span key={g}>{g}</span>)}</div>
      <div className="tk-izgara">
        {hucreler.map(({ tarih, ayIcinde }) => {
          const anahtar = gunAnahtari(tarih);
          const liste = maddeler.get(anahtar) ?? [];
          const sinif = ["tk-gun", ayIcinde ? "" : "is-disinda", anahtar === bugun ? "is-bugun" : "", anahtar === seciliGun ? "is-secili" : "", liste.length ? "is-dolu" : ""].filter(Boolean).join(" ");
          return (
            <Link key={anahtar} href={gunHref(anahtar)} className={sinif} aria-label={`${tarih.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}${liste.length ? `, ${liste.length} kayıt` : ""}`}>
              <span className="tk-gun-no">{tarih.getDate()}</span>
              {liste.slice(0, 2).map((m) => <em key={m.anahtar} data-tur={m.tur} data-tone={m.ton}>{m.etiket}</em>)}
              {liste.length > 2 ? <small>+{liste.length - 2} daha</small> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Ay gezinme: ‹ Ekim 2026 › · Bugün. */
export function AyGezinme({ ay, oncekiHref, sonrakiHref, bugunHref }: { ay: Date; oncekiHref: string; sonrakiHref: string; bugunHref: string }) {
  return (
    <div className="tk-gezinme">
      <Link className="tk-ok" href={oncekiHref} aria-label="Önceki ay">‹</Link>
      <b>{ay.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</b>
      <Link className="tk-ok" href={sonrakiHref} aria-label="Sonraki ay">›</Link>
      <Link className="tk-bugun" href={bugunHref}>Bugün</Link>
    </div>
  );
}

/** Sağ paneldeki gün başlığı ve maddeleri. */
export function GunBolumu({ baslik, rozet, bos, children }: { baslik: string; rozet?: string; bos?: string; children?: ReactNode }) {
  return (
    <section className="tk-gun-bolum">
      <h3>{baslik}{rozet ? <span className="status-pill" data-tone="info">{rozet}</span> : null}</h3>
      {children ?? (bos ? <p className="tk-bos">{bos}</p> : null)}
    </section>
  );
}
