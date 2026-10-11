import Link from "next/link";
import type { CSSProperties } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { activeStatuses, adimIlerlemesi, surenStatuses } from "../ops-shared";
import { SatirTiklama } from "../../crm/satir-tiklama";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../operations.css";

/*
  EKİP YÜKÜ — operasyon müdürünün "kimde ne var" ekranı.

  Müdür (rol: manager) işlerin tamamını zaten görüyor ve atayabiliyor;
  eksik olan, organizasyonu KİŞİ KİŞİ gösteren tek bir yüzeydi. İşler
  listesi sorumluya göre süzülebiliyor ama "kimde kaç iş birikti,
  kimin termini geçti, kim müsait" sorusu için personeli tek tek
  süzmek gerekiyordu.

  Sayılar veritabanından (operasyon_ekip_yuku): süzme ve sayma
  sunucuda, satır sayısı personel kadar. Her sayı işler listesine
  SÜZGEÇLİ bağlantı veriyor — ekran bakılıp geçilen bir tablo değil,
  işin başladığı yer.

  Yetki: operations.ekip.gor (varsayılan yönetici + müdür). İşlerin
  tamamını görmek RLS'te ayrıca müdüre bağlı; bu sayfa yeni bir
  görünürlük açmıyor, var olanı kişi kişi topluyor.
*/

type Satir = {
  employee_id: string | null;
  ad: string | null;
  unvan: string | null;
  durum: string | null;
  acik_is: number;
  suren_is: number;
  termin_gecmis: number;
  termin_yakin: number;
  adim_toplam: number;
  adim_tamam: number;
  adim_gecmis: number;
  okunmamis_mesaj: number;
};

const ISLER = "/panel/operations/isler";
const sayi = (deger: number | null | undefined) => Number(deger ?? 0);

/** Satırın işler listesindeki karşılığı; atanmamışlar için "atanmamis". */
const sorumluAdresi = (satir: Satir, ek: Record<string, string> = {}) => {
  const q = new URLSearchParams({ sorumlu: satir.employee_id ?? "atanmamis", ...ek });
  return `${ISLER}?${q.toString()}`;
};

export default async function EkipYukuPage() {
  const { supabase, membership, modules, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  if (!izin("operations.ekip.gor")) throw new Error("Ekip yükünü görme yetkiniz yok.");

  const { data, error } = await supabase.rpc("operasyon_ekip_yuku", {
    p_organization_id: membership.organization_id,
    p_aktif: [...activeStatuses],
    p_suren: [...surenStatuses],
  });
  if (error) throw new Error("Ekip yükü okunamadı: " + error.message);
  const satirlar = (data ?? []) as Satir[];

  const toplam = satirlar.reduce((t, s) => ({
    acik: t.acik + sayi(s.acik_is),
    gecikenIs: t.gecikenIs + sayi(s.termin_gecmis),
    gecikenAdim: t.gecikenAdim + sayi(s.adim_gecmis),
    mesaj: t.mesaj + sayi(s.okunmamis_mesaj),
  }), { acik: 0, gecikenIs: 0, gecikenAdim: 0, mesaj: 0 });
  const atanmamis = satirlar.find((s) => !s.employee_id);
  /* "Müsait" ölçütü: aktif personel ve hiç açık işi yok. Pasif
     personel üstünde iş kaldıysa listede duruyor ama müsait sayılmaz. */
  const musait = satirlar.filter((s) => s.employee_id && s.durum === "active" && !sayi(s.acik_is)).length;

  return <main className="talep cari ekip talepler liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">OPERASYON</small>
        <h1>Ekip yükü</h1>
      </div>
      <div className="talep-bas-eylem">
        <Link className="panel-secondary" href={ISLER}>Tüm işler</Link>
        <Link className="panel-secondary" href="/panel/operations/pano">Pano</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Ekip özeti">
      <dl>
        <div><dt>Açık iş</dt><dd><Link href={ISLER}>{toplam.acik}</Link></dd></div>
        <div><dt>Termini geçen</dt><dd className={toplam.gecikenIs ? "talep-uyari" : undefined}><Link href={`${ISLER}?termin=geciken`}>{toplam.gecikenIs}</Link></dd></div>
        <div><dt>Geciken adım</dt><dd className={toplam.gecikenAdim ? "talep-uyari" : undefined}>{toplam.gecikenAdim}</dd></div>
        <div><dt>Yeni müşteri mesajı</dt><dd className={toplam.mesaj ? "talep-uyari" : undefined}><Link href={`${ISLER}?mesaj=yeni`}>{toplam.mesaj}</Link></dd></div>
        {atanmamis ? <div><dt>Atanmamış iş</dt><dd className="cari-eksi"><Link href={sorumluAdresi(atanmamis)}>{sayi(atanmamis.acik_is)}</Link></dd></div> : null}
        <div><dt>Müsait personel</dt><dd className={musait ? "cari-arti" : undefined}>{musait}</dd></div>
      </dl>
    </nav>

    <div className="talep-tablo">
      <table className="crm-data-table" data-cols="ekip-yuku">
        <thead><tr>
          <th>Kişi</th><th>Açık iş</th><th>Süren</th><th>Termini geçen</th><th>Bu hafta teslim</th>
          <th>İlerleme</th><th>Geciken adım</th><th>Yeni mesaj</th>
        </tr></thead>
        <tbody>{satirlar.map((satir) => {
          const { percentage } = adimIlerlemesi(sayi(satir.adim_tamam), sayi(satir.adim_toplam));
          const gecikenIs = sayi(satir.termin_gecmis);
          const gecikenAdim = sayi(satir.adim_gecmis);
          const mesaj = sayi(satir.okunmamis_mesaj);
          const bosta = Boolean(satir.employee_id) && !sayi(satir.acik_is);
          return (
            <tr key={satir.employee_id ?? "atanmamis"} data-href={sorumluAdresi(satir)}>
              <td data-label="Kişi">
                <b>{satir.employee_id ? formatPersonName(satir.ad ?? "") || "İsimsiz personel" : "Atanmamış işler"}</b>
                <small>
                  {satir.employee_id
                    ? [satir.unvan, satir.durum !== "active" ? "pasif" : null, bosta ? "müsait" : null].filter(Boolean).join(" · ") || "—"
                    : "Sorumlusu olmayan işler en kolay kaybolan iştir"}
                </small>
              </td>
              <td data-label="Açık iş"><Link href={sorumluAdresi(satir)}>{sayi(satir.acik_is)}</Link></td>
              <td data-label="Süren">{sayi(satir.suren_is)}</td>
              <td data-label="Termini geçen" className={gecikenIs ? "talep-uyari" : undefined}>
                {gecikenIs ? <Link href={sorumluAdresi(satir, { termin: "geciken" })}>{gecikenIs}</Link> : 0}
              </td>
              <td data-label="Bu hafta teslim">
                {sayi(satir.termin_yakin) ? <Link href={sorumluAdresi(satir, { termin: "hafta" })}>{sayi(satir.termin_yakin)}</Link> : 0}
              </td>
              <td data-label="İlerleme" className="crm-col-progress">
                {sayi(satir.adim_toplam)
                  ? <><span className="ops-progress-mini" aria-hidden="true"><i style={{ "--p": `${percentage}%` } as CSSProperties} /></span><b>%{percentage}</b></>
                  : <span className="talep-bos">adım yok</span>}
              </td>
              <td data-label="Geciken adım" className={gecikenAdim ? "talep-uyari" : undefined}>{gecikenAdim}</td>
              <td data-label="Yeni mesaj" className={mesaj ? "talep-uyari" : undefined}>
                {mesaj ? <Link href={sorumluAdresi(satir, { mesaj: "yeni" })}>{mesaj}</Link> : 0}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      <SatirTiklama />
    </div>

    {!satirlar.length ? (
      <div className="crm-empty-state talep-bos-kutu">
        <h2>Personel kaydı yok</h2>
        <p>İşleri kişilere atayabilmek için önce İnsan Kaynakları bölümünde personel kaydı açın.</p>
      </div>
    ) : null}
  </main>;
}
