import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { modulGerek } from "@/lib/modul-kapisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { money } from "@/lib/rapor-bicim";
import { ayEtiketi, aySecenekleri } from "@/lib/personel-hedefi";
import { liraYazisi } from "@/lib/turkish-amount";
import { csvTutar } from "@/lib/csv";
import { IZIN_ADI, ayinIzinleri, ayinSonu, eksikGun, kadroluMu, odenecekTutar, type IzinKaydi } from "@/lib/maas";
import { PanelModal } from "../../components/panel-modal";
import { maaslariKaydet, maasOde, maasOdemesiGeriAl, maasOncekiAydanKopyala } from "../maas-actions";
import { MusavirDosyasi } from "./musavir-dosyasi";
import "../hr.css";
import "../../components/kayit-formu.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../hedefler/hedefler.css";
import "./maaslar.css";

export const metadata: Metadata = { title: "Maaşlar" };

/*
  MAAŞ TAKİBİ (30.10.2026, müşteri isteği: "bordro").

  BORDRO HESAPLANMIYOR (gerekçe migration 20261030065444'te): SGK ve
  vergiyi mali müşavir hesaplıyor. Bu ekran ayın maaş listesini tutuyor:
  anlaşılan net, müşavirin hesapladığı net (girilirse esas o), ek ödeme,
  avans, kesinti ve ödemenin kendisi. Müşavirin istediği iki bilgi —
  eksik gün (ücretsiz izin + rapor) ve o ay ödenen prim — ayrıca
  YAZILMIYOR, izin ve prim kayıtlarından okunuyor: iki yerde tutulan
  sayı ayrışır.

  YALNIZCA KADROLU personel (lib/maas KADROLU_TIPLER). Sözleşmeli
  (freelance) çalışan bordroya girmiyor, Hakedişler ekranında.

  DÜZEN Satış hedefleri ekranının (hedefler/page.tsx) iskeleti; ay
  seçici, şerit ve kart aynı sınıflarla.

  KAYDET FORMU TABLOYU SARMIYOR: satır başına "Öde" ve "Geri al"
  formları var ve form form içine konamaz. Kutular `form="maas-kaydet"`
  ile tablonun dışındaki forma bağlı.
*/

type Personel = { id: string; full_name: string; job_title: string | null; employment_type: string; employment_status: string };
type Maas = {
  id: string; employee_id: string; anlasilan_net: number | null; resmi_net: number | null; resmi_brut: number | null;
  ek_odeme: number; avans: number; kesinti: number; notlar: string | null;
  odendi_on: string | null; odenen: number | null; odeme_yontemi: string | null;
};

const CALISAN = ["active", "on_leave"];
const YONTEM_ADI: Record<string, string> = { havale: "Havale/EFT", nakit: "Nakit", diger: "Diğer" };
const FORM = "maas-kaydet";
const kutuDegeri = (k: number | null | undefined) => (k === null || k === undefined || k === 0 ? "" : liraYazisi(k));
const gunYazisi = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;

export default async function MaaslarSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { ay: istenenAy } = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  modulGerek(modules, "hr");
  /* Maaş kurumdaki en hassas veri: yetkisi olmayana ekran hiç yok
     (menüde de görünmüyor). RLS zaten satır vermezdi; boş bir tablo
     "kimseye maaş girilmemiş" gibi okunurdu. */
  if (!izin("hr.maas.yonet")) notFound();
  const org = membership.organization_id;

  const bugun = todayInIstanbul();
  const secenekler = aySecenekleri(bugun, 6, 1);
  const buAy = secenekler.find((a) => a.slice(0, 7) === bugun.slice(0, 7))!;
  const ay = istenenAy && secenekler.includes(istenenAy) ? istenenAy : buAy;
  const oncekiAy = secenekler[Math.max(0, secenekler.indexOf(ay) - 1)];
  const son = ayinSonu(ay);

  const [pS, mS, iS, prS, oS] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,employment_type,employment_status").eq("organization_id", org).order("full_name"),
    supabase.from("hr_maaslar")
      .select("id,employee_id,anlasilan_net,resmi_net,resmi_brut,ek_odeme,avans,kesinti,notlar,odendi_on,odenen,odeme_yontemi")
      .eq("organization_id", org).eq("donem", ay),
    /* Aya DOKUNAN onaylı izinler: ay sınırını aşanın yalnızca bu aya
       düşen günleri lib/maas'ta sayılıyor. */
    supabase.from("hr_leave_requests").select("employee_id,leave_type,start_date,end_date,status")
      .eq("organization_id", org).eq("status", "approved").lte("start_date", son).gte("end_date", ay),
    supabase.from("hr_commission_payments").select("employee_id,amount")
      .eq("organization_id", org).gte("paid_on", ay).lte("paid_on", son),
    ay === oncekiAy
      ? Promise.resolve({ data: [] as { employee_id: string }[], error: null })
      : supabase.from("hr_maaslar").select("employee_id").eq("organization_id", org).eq("donem", oncekiAy).not("anlasilan_net", "is", null),
  ]);
  /* Okunamayan bir sorgu "maaş yok / izin yok / prim yok" diye
     çizilmesin: müşavire eksik dosya giderdi. */
  for (const [ad, s] of [["Personel", pS], ["Maaş kayıtları", mS], ["İzinler", iS], ["Prim ödemeleri", prS], ["Önceki ay", oS]] as const) {
    if (s.error) throw new Error(`${ad} okunamadı: ${s.error.message}`);
  }

  const maaslar = (mS.data ?? []) as Maas[];
  const maas = new Map(maaslar.map((m) => [m.employee_id, m]));
  /* Kadrolu ve çalışan herkes; ayrılmış ya da tipi değişmiş biri o ay
     için satırı varsa yine listede — ödenmiş maaşı ekrandan düşürmek
     ayın toplamını eksik gösterirdi. */
  const personel = ((pS.data ?? []) as Personel[])
    .filter((p) => (kadroluMu(p.employment_type) && CALISAN.includes(p.employment_status)) || maas.has(p.id));
  const izinler = new Map<string, IzinKaydi[]>();
  for (const i of (iS.data ?? []) as (IzinKaydi & { employee_id: string })[]) {
    izinler.set(i.employee_id, [...(izinler.get(i.employee_id) ?? []), i]);
  }
  const prim = new Map<string, number>();
  for (const p of (prS.data ?? []) as { employee_id: string; amount: number }[]) prim.set(p.employee_id, (prim.get(p.employee_id) ?? 0) + Number(p.amount));

  const satirlar = personel.map((p) => {
    const m = maas.get(p.id) ?? null;
    const izin = ayinIzinleri(izinler.get(p.id) ?? [], ay);
    const odenecek = m ? odenecekTutar(m) : { tutar: null, eksi: false };
    return { p, m, izin, eksik: eksikGun(izin), prim: prim.get(p.id) ?? 0, odenecek };
  });
  const odenen = satirlar.reduce((t, s) => t + (s.m?.odenen ?? 0), 0);
  const bekleyen = satirlar.reduce((t, s) => t + (!s.m?.odendi_on ? s.odenecek.tutar ?? 0 : 0), 0);
  const odenmisSayi = satirlar.filter((s) => s.m?.odendi_on).length;
  const tutarsiz = satirlar.filter((s) => s.odenecek.tutar === null).length;
  const bosSatir = personel.filter((p) => !maas.has(p.id)).length;
  const oncekiSayi = (oS.data ?? []).length;

  const izinYazisi = (izin: Record<string, number>) =>
    Object.entries(izin).map(([tur, gun]) => `${IZIN_ADI[tur] ?? tur} ${gun} gün`).join(", ");
  const csvSatirlari = satirlar.map((s) => [
    s.p.full_name, s.p.job_title ?? "", s.eksik || "", izinYazisi(s.izin),
    csvTutar(s.m?.anlasilan_net), csvTutar(s.m?.resmi_net), csvTutar(s.m?.ek_odeme || null),
    csvTutar(s.m?.avans || null), csvTutar(s.m?.kesinti || null), csvTutar(s.prim || null),
    csvTutar(s.odenecek.tutar), s.m?.odendi_on ?? "", s.m?.notlar ?? "",
  ]);

  return <main className="talep cari ekip talepler teklifler liste-sayfa hedefler-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">İNSAN KAYNAKLARI</small>
        <h1>Maaşlar</h1>
        <p className="ek-alt">
          Kadrolu personelin aylık maaş listesi. SGK ve vergiyi mali müşaviriniz hesaplar; burada anlaşılan
          net, müşavirin bildirdiği net ve ödemenin kendisi tutulur. Sözleşmeli çalışanlar{" "}
          <Link href="/panel/hr/hakedisler">Hakedişler</Link>&apos;de.
        </p>
      </div>
      <div className="talep-bas-eylem">
        {/* Ayrı form: kaydet formundaki ikinci düğme, Enter'a basanın
            yazdıklarının üstüne geçen ayı kopyalardı (hedeflerdeki kural). */}
        {oncekiSayi > 0 && bosSatir > 0 ? (
          <form action={maasOncekiAydanKopyala}>
            <input type="hidden" name="ay" value={ay} />
            <input type="hidden" name="kaynak" value={oncekiAy} />
            <button className="panel-secondary" type="submit" title="Yalnızca bu ay satırı olmayan kişilere, anlaşılan net kopyalanır">
              {ayEtiketi(oncekiAy)} maaşlarını kopyala
            </button>
          </form>
        ) : null}
        <MusavirDosyasi
          basliklar={["Personel", "Unvan", "Eksik gün", "İzinler", "Anlaşılan net", "Müşavir neti", "Ek ödeme", "Avans", "Kesinti", "Bu ay ödenen prim", "Ödenecek", "Ödeme tarihi", "Not"]}
          satirlar={csvSatirlari}
          dosyaAdi={`maaslar-${ay.slice(0, 7)}.csv`}
        />
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Maaş özeti">
      <dl>
        <div><dt>Seçili ay</dt><dd>{ayEtiketi(ay)}</dd><small>{personel.length} kadrolu personel</small></div>
        <div><dt>Ödenen</dt><dd className={odenen ? "cari-arti" : "talep-bos"}>{odenen ? money(odenen) : "—"}</dd><small>{odenmisSayi} kişi</small></div>
        <div><dt>Ödenecek</dt><dd className={bekleyen ? "talep-uyari" : "talep-bos"}>{bekleyen ? money(bekleyen) : "—"}</dd><small>{personel.length - odenmisSayi} kişi bekliyor</small></div>
        {/* Maaşı girilmemiş kişi ayrı sayılıyor: "ödenecek ₺0" diyip
            unutulmuş bir maaşı ödenmiş gibi göstermemek için. */}
        <div><dt>Maaşı girilmemiş</dt><dd className={tutarsiz ? "talep-uyari" : undefined}>{tutarsiz}</dd><small>tutar yok</small></div>
      </dl>
    </nav>

    <div className="ek-arac hedefler-arac">
      <nav className="ek-segment hedefler-aylar" aria-label="Maaş ayı">
        {secenekler.map((s) => (
          <Link key={s} href={`/panel/hr/maaslar?ay=${s}`} className={s === ay ? "is-active" : undefined} aria-current={s === ay ? "page" : undefined}>
            {ayEtiketi(s)}
          </Link>
        ))}
      </nav>
    </div>

    <section className="panel-card talep-bilgi hedefler-kart" aria-label={`${ayEtiketi(ay)} maaşları`}>
      {personel.length === 0 ? (
        <div className="panel-empty hedefler-bos">
          <b>Kadrolu personel yok</b>
          <p>Maaş listesine tam zamanlı, yarı zamanlı ve stajyer personel girer. <Link href="/panel/hr">Personel kaydında</Link> çalışma tipini kontrol edin.</p>
        </div>
      ) : (
        <div className="panel-form kayit-formu hedefler-form">
          <form id={FORM} action={maaslariKaydet} className="maaslar-gizli-form">
            <input type="hidden" name="ay" value={ay} />
          </form>
          <div className="talep-tablo crm-table-wrap hedefler-tablo-sarmal">
            <table className="crm-data-table maaslar-tablo">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>İzin / prim</th>
                  <th className="crm-col-amount">Anlaşılan net</th>
                  <th className="crm-col-amount">Müşavir neti</th>
                  <th className="crm-col-amount">Ek ödeme</th>
                  <th className="crm-col-amount">Avans</th>
                  <th className="crm-col-amount">Kesinti</th>
                  <th>Not</th>
                  <th className="crm-col-amount">Ödenecek</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map(({ p, m, izin, eksik, prim: primTutari, odenecek }) => {
                  const kilitli = Boolean(m?.odendi_on);
                  const kutu = (ad: string, deger: number | null | undefined, etiket: string) => (
                    <input form={FORM} name={`${ad}_${p.id}`} type="text" inputMode="decimal" autoComplete="off" maxLength={18}
                      defaultValue={kutuDegeri(deger)} disabled={kilitli} aria-label={`${p.full_name} · ${etiket}`} />
                  );
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/panel/hr/${p.id}`}>{p.full_name}</Link>
                        <small className="maaslar-alt">{p.job_title?.trim() || "—"}</small>
                      </td>
                      <td data-label="İzin / prim">
                        {/* Eksik gün müşavirin SGK bildirimine giriyor; diğer
                            izinler ücreti etkilemiyor ama soruluyor. */}
                        {Object.keys(izin).length ? (
                          <span className="maaslar-deger" title={izinYazisi(izin)}>
                            {eksik ? <b className="talep-uyari">{eksik} eksik gün</b> : "İzin var"}
                            <small>{izinYazisi(izin)}</small>
                          </span>
                        ) : <span className="talep-bos">İzin yok</span>}
                        {primTutari ? <small className="maaslar-alt">Prim ödendi: {money(primTutari)}</small> : null}
                      </td>
                      <td className="crm-col-amount maaslar-kutu" data-label="Anlaşılan net">{kutu("anlasilan", m?.anlasilan_net, "anlaşılan net")}</td>
                      <td className="crm-col-amount maaslar-kutu" data-label="Müşavir neti">{kutu("resmi", m?.resmi_net, "müşavirin hesapladığı net")}</td>
                      <td className="crm-col-amount maaslar-kutu" data-label="Ek ödeme">{kutu("ek", m?.ek_odeme, "ek ödeme")}</td>
                      <td className="crm-col-amount maaslar-kutu" data-label="Avans">{kutu("avans", m?.avans, "avans")}</td>
                      <td className="crm-col-amount maaslar-kutu" data-label="Kesinti">{kutu("kesinti", m?.kesinti, "kesinti")}</td>
                      <td className="maaslar-not" data-label="Not">
                        <input form={FORM} name={`not_${p.id}`} type="text" maxLength={500} defaultValue={m?.notlar ?? ""}
                          disabled={kilitli} aria-label={`${p.full_name} · not`} />
                      </td>
                      <td className="crm-col-amount" data-label="Ödenecek">
                        {kilitli ? <span className="maaslar-deger">{money(m!.odenen!)}<small>ödendi</small></span>
                          : odenecek.tutar === null ? <span className="talep-bos">—</span>
                          : (
                            <span className="maaslar-deger">
                              {money(odenecek.tutar)}
                              {/* Avans/kesinti maaşı aşıyor: fark gelecek aya
                                  devreden bir alacak, sessizce yok olmamalı. */}
                              {odenecek.eksi ? <small className="talep-uyari">kesinti maaşı aşıyor</small>
                                : <small>{m?.resmi_net !== null && m?.resmi_net !== undefined ? "müşavir netinden" : "anlaşılan netten"}</small>}
                            </span>
                          )}
                      </td>
                      <td data-label="Durum">
                        {kilitli ? (
                          <span className="maaslar-durum">
                            <span className="status-pill" data-tone="success">{gunYazisi(m!.odendi_on!)}</span>
                            <small>{YONTEM_ADI[m!.odeme_yontemi ?? ""] ?? ""}</small>
                            <form action={maasOdemesiGeriAl}>
                              <input type="hidden" name="id" value={m!.id} />
                              <button type="submit" className="panel-secondary maaslar-kucuk" title="Ödeme kaydını ve finanstaki gideri kaldırır">Geri al</button>
                            </form>
                          </span>
                        ) : m && odenecek.tutar ? (
                          <PanelModal triggerLabel="Öde" triggerClassName="panel-primary maaslar-kucuk" kicker="Maaş ödemesi"
                            title={`${p.full_name} · ${ayEtiketi(ay)}`} boy="dar" basaridaKapan>
                            {/* Tutar formda YOK: sunucu kayıttan hesaplıyor, ekrandaki
                                rakamla ödenen ayrışmasın. Önce kaydedilmemiş kutu
                                değişiklikleri buraya yansımaz — not bunu söylüyor. */}
                            <form action={maasOde} className="panel-form kayit-formu">
                              <input type="hidden" name="id" value={m.id} />
                              <p className="maaslar-odeme-tutar">Ödenecek: <b>{money(odenecek.tutar)}</b></p>
                              <label>Ödeme tarihi<input type="date" name="tarih" defaultValue={bugun} required /></label>
                              <label>Yöntem
                                <select name="yontem" defaultValue="havale">
                                  {Object.entries(YONTEM_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                              </label>
                              <p className="maaslar-not-yazi">Finansa &quot;Personel Maaşı&quot; gideri olarak yazılır. Tutarları değiştirdiyseniz önce kaydedin.</p>
                              <div className="panel-form-actions kayit-formu-eylem">
                                <button className="panel-primary" type="submit">Ödendi olarak kaydet</button>
                              </div>
                            </form>
                          </PanelModal>
                        ) : <span className="talep-bos">{m ? "tutar yok" : "girilmedi"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="wide panel-form-actions kayit-formu-eylem hedefler-eylem">
            <p>
              Müşavir neti girilirse ödenecek tutar ondan hesaplanır, girilmezse anlaşılan netten.
              Bir satırı tamamen boşaltmak o ayın kaydını kaldırır; ödenmiş satır değişmez.
            </p>
            <button className="panel-primary" type="submit" form={FORM}>Maaşları kaydet</button>
          </div>
        </div>
      )}
    </section>
  </main>;
}
