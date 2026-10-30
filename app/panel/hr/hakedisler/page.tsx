import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { modulGerek } from "@/lib/modul-kapisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { money } from "@/lib/rapor-bicim";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { csvTutar } from "@/lib/csv";
import { BELGE_ADI, hakedisNeti, kadroluMu } from "@/lib/maas";
import { PanelModal } from "../../components/panel-modal";
import { hakedisGeriAl, hakedisKaydet, hakedisOde, hakedisSil } from "../maas-actions";
import { MusavirDosyasi } from "../maaslar/musavir-dosyasi";
import "../hr.css";
import "../../components/kayit-formu.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../hedefler/hedefler.css";
import "../maaslar/maaslar.css";

export const metadata: Metadata = { title: "Hakedişler" };

/*
  HAKEDİŞLER (30.10.2026). Sözleşmeli (freelance) çalışan bordroya
  girmiyor: iş başına anlaşılan tutar, kestiği belge (fatura / serbest
  meslek makbuzu), müşavirin söylediği stopaj ve ödeme. Stopajı
  ArvoOS HESAPLAMIYOR — oranı belge türüne ve kişinin durumuna göre
  değişiyor, müşavirin söylediği yazılıyor.

  Liste tek kurumun hakedişleri; yine de sayfalı okunuyor
  (tumSatirlar): şeritteki toplamlar listeden hesaplanıyor ve
  PostgREST'in satır tavanı sessizce keserdi.
*/

type Hakedis = {
  id: string; employee_id: string; aciklama: string; tarih: string; tutar: number; stopaj: number;
  belge_turu: string; belge_no: string | null; notlar: string | null; durum: string; odendi_on: string | null;
  odeme_yontemi: string | null;
};
type Kisi = { id: string; full_name: string; employment_type: string; employment_status: string };

const DURUMLAR: [string, string][] = [["bekliyor", "Ödeme bekleyen"], ["odendi", "Ödenen"], ["tumu", "Tümü"]];
const YONTEM_ADI: Record<string, string> = { havale: "Havale/EFT", nakit: "Nakit", diger: "Diğer" };
const gunYazisi = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;

export default async function HakedislerSayfasi({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const { durum: istenen } = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  modulGerek(modules, "hr");
  if (!izin("hr.maas.yonet")) notFound();
  const org = membership.organization_id;
  const durum = DURUMLAR.some(([k]) => k === istenen) ? istenen! : "bekliyor";
  const bugun = todayInIstanbul();

  const [{ data: kVeri, error: kHata }, hakedisler] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,employment_type,employment_status").eq("organization_id", org).order("full_name"),
    tumSatirlar<Hakedis>("hakedişler", (bas, son) =>
      supabase.from("hr_hakedisler")
        .select("id,employee_id,aciklama,tarih,tutar,stopaj,belge_turu,belge_no,notlar,durum,odendi_on,odeme_yontemi")
        .eq("organization_id", org).neq("durum", "iptal")
        .order("tarih", { ascending: false }).order("id")
        .range(bas, son)),
  ]);
  if (kHata) throw new Error("Personel okunamadı: " + kHata.message);
  const kisiler = (kVeri ?? []) as Kisi[];
  const ad = new Map(kisiler.map((k) => [k.id, k.full_name]));
  /* Seçimde önce sözleşmeliler. Kurum serbest çalışanı personel
     kaydında "Sözleşmeli" işaretlememiş olabilir: hiç yoksa kadrolu
     olmayan herkes değil, BÜTÜN çalışanlar listelenir — kişi seçilemeyen
     bir form, hakedişi hiç girilemez kılardı. */
  const calisan = kisiler.filter((k) => k.employment_status !== "terminated" && k.employment_status !== "inactive");
  const sozlesmeli = calisan.filter((k) => !kadroluMu(k.employment_type));
  const secilebilir = sozlesmeli.length ? sozlesmeli : calisan;

  const bekleyen = hakedisler.filter((h) => h.durum === "bekliyor");
  const odenen = hakedisler.filter((h) => h.durum === "odendi");
  const buAy = bugun.slice(0, 7);
  const toplam = (liste: Hakedis[]) => liste.reduce((t, h) => t + hakedisNeti(h), 0);
  const buAyOdenen = odenen.filter((h) => h.odendi_on?.slice(0, 7) === buAy);
  const stopajBuAy = buAyOdenen.reduce((t, h) => t + Number(h.stopaj), 0);
  const gosterilen = durum === "tumu" ? hakedisler : durum === "odendi" ? odenen : bekleyen;

  const csvSatirlari = gosterilen.map((h) => [
    ad.get(h.employee_id) ?? "", h.aciklama, h.tarih, BELGE_ADI[h.belge_turu] ?? h.belge_turu, h.belge_no ?? "",
    csvTutar(h.tutar), csvTutar(h.stopaj), csvTutar(hakedisNeti(h)), h.durum === "odendi" ? "Ödendi" : "Bekliyor", h.odendi_on ?? "",
  ]);

  return <main className="talep cari ekip talepler teklifler liste-sayfa hedefler-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">İNSAN KAYNAKLARI</small>
        <h1>Hakedişler</h1>
        <p className="ek-alt">
          Sözleşmeli (serbest) çalışanların iş başına ödemeleri; bordroya girmez. Stopajı mali müşaviriniz
          söyler, ödenecek tutar anlaşılan tutardan düşülerek bulunur. Kadrolu personel{" "}
          <Link href="/panel/hr/maaslar">Maaşlar</Link>&apos;da.
        </p>
      </div>
      <div className="talep-bas-eylem">
        <MusavirDosyasi
          basliklar={["Çalışan", "İş", "Tarih", "Belge", "Belge no", "Tutar", "Stopaj", "Ödenecek", "Durum", "Ödeme tarihi"]}
          satirlar={csvSatirlari}
          dosyaAdi={`hakedisler-${bugun}.csv`}
        />
        <PanelModal triggerLabel="Yeni hakediş" triggerClassName="panel-primary" kicker="Hakediş" title="Yeni hakediş" basaridaKapan>
          {secilebilir.length === 0 ? (
            <p>Önce <Link href="/panel/hr">personel kaydı</Link> açın; serbest çalışanı &quot;Sözleşmeli&quot; tipiyle ekleyin.</p>
          ) : (
            <form action={hakedisKaydet} className="panel-form kayit-formu">
              <label>Çalışan
                <select name="employee_id" required defaultValue="">
                  <option value="" disabled>Seçin</option>
                  {secilebilir.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}
                </select>
              </label>
              <label>Tarih<input type="date" name="tarih" defaultValue={bugun} required /></label>
              <label className="wide">Yapılan iş<input name="aciklama" required minLength={2} maxLength={200} placeholder="ör. Ekim ayı kurulum işleri" /></label>
              {/* Tutar kutusu metin + inputMode="decimal" (AGENTS.md): sayı
                  kutusu "12.500" yazımını geçersiz sayıyor. */}
              <label>Tutar (₺)<input name="tutar" type="text" inputMode="decimal" autoComplete="off" required placeholder="12.500,00" /></label>
              <label>Stopaj (₺)<input name="stopaj" type="text" inputMode="decimal" autoComplete="off" placeholder="Müşavirin söylediği" /></label>
              <label>Belge
                <select name="belge_turu" defaultValue="smm">
                  {Object.entries(BELGE_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Belge no<input name="belge_no" maxLength={60} /></label>
              <label className="wide">Not<input name="notlar" maxLength={500} /></label>
              <div className="wide panel-form-actions kayit-formu-eylem">
                <button className="panel-primary" type="submit">Kaydet</button>
              </div>
            </form>
          )}
        </PanelModal>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Hakediş özeti">
      <dl>
        <div><dt>Ödeme bekleyen</dt><dd className={bekleyen.length ? "talep-uyari" : "talep-bos"}>{bekleyen.length ? money(toplam(bekleyen)) : "—"}</dd><small>{bekleyen.length} hakediş</small></div>
        <div><dt>Bu ay ödenen</dt><dd className={buAyOdenen.length ? "cari-arti" : "talep-bos"}>{buAyOdenen.length ? money(toplam(buAyOdenen)) : "—"}</dd><small>{buAyOdenen.length} hakediş</small></div>
        {/* Müşavirin muhtasar beyannamesine giren rakam: bu ay ödenenlerin stopajı. */}
        <div><dt>Bu ayın stopajı</dt><dd className={stopajBuAy ? undefined : "talep-bos"}>{stopajBuAy ? money(stopajBuAy) : "—"}</dd><small>müşavire bildirilecek</small></div>
        <div><dt>Sözleşmeli çalışan</dt><dd>{sozlesmeli.length}</dd><small>personel kaydında</small></div>
      </dl>
    </nav>

    <div className="ek-arac hedefler-arac">
      <nav className="ek-segment" aria-label="Hakediş durumu">
        {DURUMLAR.map(([k, v]) => (
          <Link key={k} href={`/panel/hr/hakedisler?durum=${k}`} className={k === durum ? "is-active" : undefined} aria-current={k === durum ? "page" : undefined}>{v}</Link>
        ))}
      </nav>
    </div>

    <section className="panel-card talep-bilgi hedefler-kart" aria-label="Hakedişler">
      {gosterilen.length === 0 ? (
        <div className="panel-empty hedefler-bos">
          <b>{durum === "bekliyor" ? "Ödeme bekleyen hakediş yok" : "Hakediş yok"}</b>
          <p>Serbest çalışanın tamamladığı işi &quot;Yeni hakediş&quot; ile girin; ödeyince finansa gider olarak yazılır.</p>
        </div>
      ) : (
        <div className="talep-tablo crm-table-wrap hedefler-tablo-sarmal">
          <table className="crm-data-table hakedisler-tablo">
            <thead>
              <tr>
                <th>Çalışan</th>
                <th>İş</th>
                <th>Belge</th>
                <th className="crm-col-amount">Tutar</th>
                <th className="crm-col-amount">Stopaj</th>
                <th className="crm-col-amount">Ödenecek</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {gosterilen.map((h) => (
                <tr key={h.id}>
                  <td><Link href={`/panel/hr/${h.employee_id}`}>{ad.get(h.employee_id) ?? "—"}</Link></td>
                  <td data-label="İş">
                    <span className="maaslar-deger">{h.aciklama}<small>{gunYazisi(h.tarih)}{h.notlar ? ` · ${h.notlar}` : ""}</small></span>
                  </td>
                  <td data-label="Belge">
                    <span className="maaslar-deger">{BELGE_ADI[h.belge_turu] ?? h.belge_turu}{h.belge_no ? <small>{h.belge_no}</small> : null}</span>
                  </td>
                  <td className="crm-col-amount" data-label="Tutar">{money(h.tutar)}</td>
                  <td className="crm-col-amount" data-label="Stopaj">{h.stopaj ? money(h.stopaj) : <span className="talep-bos">—</span>}</td>
                  <td className="crm-col-amount" data-label="Ödenecek"><b>{money(hakedisNeti(h))}</b></td>
                  <td data-label="Durum">
                    {h.durum === "odendi" ? (
                      <span className="maaslar-durum">
                        <span className="status-pill" data-tone="success">{gunYazisi(h.odendi_on!)}</span>
                        <small>{YONTEM_ADI[h.odeme_yontemi ?? ""] ?? ""}</small>
                        <form action={hakedisGeriAl}>
                          <input type="hidden" name="id" value={h.id} />
                          <button type="submit" className="panel-secondary maaslar-kucuk" title="Ödeme kaydını ve finanstaki gideri kaldırır">Geri al</button>
                        </form>
                      </span>
                    ) : (
                      <span className="maaslar-durum">
                        <PanelModal triggerLabel="Öde" triggerClassName="panel-primary maaslar-kucuk" kicker="Hakediş ödemesi"
                          title={`${ad.get(h.employee_id) ?? "Hakediş"} · ${h.aciklama}`} boy="dar" basaridaKapan>
                          <form action={hakedisOde} className="panel-form kayit-formu">
                            <input type="hidden" name="id" value={h.id} />
                            <p className="maaslar-odeme-tutar">Ödenecek: <b>{money(hakedisNeti(h))}</b></p>
                            <label>Ödeme tarihi<input type="date" name="tarih" defaultValue={bugun} required /></label>
                            <label>Yöntem
                              <select name="yontem" defaultValue="havale">
                                {Object.entries(YONTEM_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            </label>
                            <p className="maaslar-not-yazi">Finansa &quot;Serbest Çalışan Hakedişi&quot; gideri olarak yazılır.</p>
                            <div className="panel-form-actions kayit-formu-eylem">
                              <button className="panel-primary" type="submit">Ödendi olarak kaydet</button>
                            </div>
                          </form>
                        </PanelModal>
                        <form action={hakedisSil}>
                          <input type="hidden" name="id" value={h.id} />
                          <button type="submit" className="panel-secondary maaslar-kucuk">Sil</button>
                        </form>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </main>;
}
