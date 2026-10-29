import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { kimlikMi } from "@/lib/kimlik";
import { modulGerek } from "@/lib/modul-kapisi";
import { istanbulDateTime, todayInIstanbul } from "@/lib/istanbul-date";
import { primDonemi } from "@/lib/prim-donemi";
import { isKapandi } from "@/lib/prim-is-dagilimi";
import { organizationBrandName } from "@/lib/kurum-adi";
import { PRIM_BOLUMLERI, primBolumuMu, primDokumu, type PrimBolumu } from "@/lib/prim-dokumu";
import { primVerisi } from "../../prim-verisi";
import { PrimYazdir } from "./yazdir";
import "./prim-yazdir.css";

/*
  PRİM DÖKÜMÜ — PDF (29.10.2026). Prim penceresinin kartlarındaki "PDF"
  düğmesi bu sayfayı yeni sekmede açar; tarayıcının yazdırma penceresinden
  PDF olarak kaydedilir (depo PDF'i elle üretmiyor, teklif ve sözleşme de
  böyle). Rakamlar pencereyle aynı dökümden (lib/prim-dokumu). Kapı
  pencerenin kapısı: İK modülü ve hr.prim.gor.
*/
export const metadata: Metadata = { title: "Prim dökümü", robots: { index: false, follow: false } };

type Arama = { bolum?: string; prim?: string; prim_bas?: string; prim_bit?: string };

const tl = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const gun = (anahtar: string) => new Date(`${anahtar.slice(0, 10)}T12:00:00+03:00`).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });

export default async function PrimYazdirSayfasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Arama> }) {
  const { id } = await params;
  if (!kimlikMi(id)) notFound();
  const arama = await searchParams;
  const { supabase, membership, modules, organization, izin, isPlatformOwner } = await getPanelContext();
  modulGerek(modules, "hr");
  if (!isPlatformOwner && !izin("hr.prim.gor")) notFound();

  const veri = await primVerisi(supabase, membership.organization_id);
  const personel = veri.employees.find((e) => e.id === id);
  if (!personel) notFound();
  const donem = primDonemi(arama.prim, todayInIstanbul(), arama.prim_bas, arama.prim_bit);
  const d = primDokumu(veri, id, donem);
  const bolumler: PrimBolumu[] = primBolumuMu(arama.bolum) ? [arama.bolum] : ["ozet", "hareket", "is"];
  const baslik = bolumler.length === 1 ? PRIM_BOLUMLERI[bolumler[0]] : "Prim dökümü";
  const marka = organizationBrandName({ slug: organization.slug, displayName: organization.display_name, legalName: organization.name });
  const dosyaAdi = `${personel.full_name} - ${baslik} - ${d.donemYazisi}`;
  const geri = `/panel/hr/${id}?pencere=prim${arama.prim ? `&prim=${encodeURIComponent(arama.prim)}` : ""}`;

  return (
    <div className="pyz">
      <div className="pyz-eylem">
        <Link className="panel-secondary" href={geri}>← Prim hesabına dön</Link>
        <PrimYazdir dosyaAdi={dosyaAdi} />
      </div>
      <article className="pyz-belge">
        <header className="pyz-bas">
          <div>
            <small>{marka}</small>
            <h1>{baslik}</h1>
            <p>{personel.full_name}{personel.job_title ? ` · ${personel.job_title}` : ""}</p>
          </div>
          <dl>
            <div><dt>Dönem</dt><dd>{d.donemYazisi}</dd></div>
            <div><dt>Hazırlandı</dt><dd>{istanbulDateTime(new Date(), { dateStyle: "medium", timeStyle: "short" })}</dd></div>
          </dl>
        </header>

        <dl className="pyz-ozet">
          <div><dt>Hak edilen (tüm zamanlar)</dt><dd>{tl(d.toplam.accrued)}</dd></div>
          <div><dt>Ödenen (tüm zamanlar)</dt><dd>{tl(d.toplam.paid)}</dd></div>
          <div><dt>Ödenecek bakiye</dt><dd>{tl(d.toplam.balance)}</dd></div>
        </dl>

        {bolumler.includes("ozet") ? (
          <section>
            <h2>Dönem özeti</h2>
            <table className="pyz-tablo">
              <tbody>
                <tr><th>Satış primi</th><td>{d.ozet.satisAdet} tahsilat</td><td className="pyz-sayi">{tl(d.ozet.satisToplam)}</td></tr>
                <tr><th>Operasyon primi</th><td>{d.ozet.operasyonAdet} iş</td><td className="pyz-sayi">{tl(d.ozet.operasyonToplam)}</td></tr>
                <tr className="pyz-toplam"><th>Dönemde hak ediş</th><td /><td className="pyz-sayi">{tl(d.ozet.hakEdis)}</td></tr>
                <tr><th>Dönemde ödenen</th><td>{d.ozet.odemeAdet} ödeme</td><td className="pyz-sayi">{tl(d.ozet.donemOdemesi)}</td></tr>
              </tbody>
            </table>
          </section>
        ) : null}

        {bolumler.includes("hareket") ? (
          <section>
            <h2>Hareket dökümü <small>{d.hareketler.length} hareket</small></h2>
            {d.hareketler.length ? (
              <table className="pyz-tablo">
                <thead><tr><th>Tarih</th><th>Açıklama</th><th className="pyz-sayi">Hak ediş</th><th className="pyz-sayi">Ödeme</th><th className="pyz-sayi">Bakiye</th></tr></thead>
                <tbody>
                  {d.hareketler.map((h) => (
                    <tr key={`${h.kind}-${h.id}`}>
                      <td>{gun(h.date)}</td>
                      <td><b>{h.title}</b>{h.detail ? <small>{h.detail}</small> : null}{h.kind === "payment" && d.dagilimYazisi(h.id, tl) ? <small>İstinaden: {d.dagilimYazisi(h.id, tl)}</small> : null}</td>
                      <td className="pyz-sayi">{h.kind === "payment" ? "" : tl(h.accrual)}</td>
                      <td className="pyz-sayi">{h.kind === "payment" ? tl(h.payment) : ""}</td>
                      <td className="pyz-sayi">{tl(h.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="pyz-bos">Bu dönemde prim hareketi yok.</p>}
          </section>
        ) : null}

        {bolumler.includes("is") ? (
          <section>
            <h2>İş bazında prim <small>{d.acikIsler.length} açık · {d.kapananIsler.length} kapanan</small></h2>
            {!d.dagitimAcik ? <p className="pyz-bos">İş bazında dağılım şu an okunamıyor.</p> : d.isler.length ? (
              <table className="pyz-tablo">
                <thead><tr><th>İş</th><th>Durum</th><th className="pyz-sayi">Hak edilen</th><th className="pyz-sayi">Ödenen</th><th className="pyz-sayi">Açık prim</th></tr></thead>
                <tbody>
                  {d.isler.map((is) => (
                    <tr key={is.contractId}>
                      <td><b>{is.reference}</b><small>{is.customer}</small></td>
                      <td>{isKapandi(is) ? "Kapandı" : is.devam ? "İş sürüyor" : "Açık"}</td>
                      <td className="pyz-sayi">{tl(is.hakEdilen)}</td>
                      <td className="pyz-sayi">{tl(is.odenen)}</td>
                      <td className="pyz-sayi">{is.acik < 0 ? `${tl(-is.acik)} avans` : tl(is.acik)}{is.beklenen > 0 ? <small>hak edilecek ~{tl(is.beklenen)}</small> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="pyz-bos">Prim doğmuş iş yok.</p>}
          </section>
        ) : null}

        <footer className="pyz-not">
          Satış primi müşteriden gerçekleşen tahsilat üzerinden, tahsilat tarihindeki oranla hesaplanır; operasyon primi iş tamamlanınca hak edilir. Bakiye tüm geçmişten hesaplanır.
        </footer>
      </article>
    </div>
  );
}
