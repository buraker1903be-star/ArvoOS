import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { inPeriod } from "@/lib/commission-accruals";
import { employeeLedger, ledgerTotals } from "@/lib/commission-ledger";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { gunDonemde, PRIM_DONEMLERI, primDonemi, primDonemiYazisi } from "@/lib/prim-donemi";
import { PanelDrawer } from "../components/panel-drawer";
import { primOdemesiDuzenle, primOdemesiKaydet, primOdemesiSil } from "./prim-actions";
import { baglanmamisKisim, isPrimleri } from "@/lib/prim-is-dagilimi";
import { PrimOdemeFormu, type FormIsi } from "./prim-odeme-formu";
import type { primVerisi } from "./prim-verisi";
import "../finance/finance.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";

/*
  PRİM PENCERESİ (2026-10): personel detayında "Prim" düğmesiyle ortada
  açılan pencere — finanstaki cari penceresiyle aynı kalıp. Eskiden iki
  ayrı sayfaydı ve aynı personel için ikisine birden bakmak gerekiyordu:
    - Prim Hesaplama (/panel/hr/commissions): dönemde ne hak edildi,
    - Prim Hesabı (/panel/hr/prim-hesabi): bakiye, ödemeler, ödeme formu.
  İkisi tek pencerede: üstte tüm geçmişin bakiyesi (hak edilen, ödenen,
  kalan), solda hareketler (dönem süzgeçli, yürüyen bakiyeyle), sağda
  seçili dönemin özeti.

  Dönem süzgeci adreste (?prim=bu-ay): pencere yeniden yüklendiğinde açık
  ve süzgeç yerinde kalsın, bağlantı paylaşılabilsin.
*/

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const dateText = (value: string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });

/** veri: primVerisi() sonucu; sayfa bakiyeyi başlıkta da gösterdiği için bir kez okuyup buraya veriyor. */
export async function PrimPenceresi({ veri, employeeId, temelAdres, donemKodu, baslangic, bitis }: { veri: Awaited<ReturnType<typeof primVerisi>>; employeeId: string; temelAdres: string; donemKodu?: string; baslangic?: string; bitis?: string }) {
  const { izin } = await getPanelContext();
  const canManage = izin("hr.prim.yonet");
  const { employees, accruals, payments, dagitimlar, dagitimAcik } = veri;
  const personel = employees.find((item) => item.id === employeeId);
  if (!personel) return <p className="ic-akis-bos">Personel bulunamadı.</p>;

  const toplam = ledgerTotals(employeeId, accruals, payments);
  const donem = primDonemi(donemKodu, todayInIstanbul(), baslangic, bitis);
  // Yürüyen bakiye tüm geçmişten hesaplanır, süzgeç ondan SONRA uygulanır:
  // önce süzülseydi her dönemin bakiyesi sıfırdan başlardı.
  const hareketler = employeeLedger(employeeId, accruals, payments).filter((h) => gunDonemde(h.date, donem)).reverse();
  const donemTahakkuku = accruals.filter((row) => row.employeeId === employeeId && (!donem || inPeriod(row, donem)));
  const satis = donemTahakkuku.filter((row) => row.type === "Satış");
  const operasyon = donemTahakkuku.filter((row) => row.type === "Operasyon");
  const satisToplam = satis.reduce((sum, row) => sum + row.amount, 0);
  const operasyonToplam = operasyon.reduce((sum, row) => sum + row.amount, 0);
  const donemOdemesi = payments.filter((p) => p.employeeId === employeeId && gunDonemde(p.paidOn, donem)).reduce((sum, p) => sum + p.amount, 0);
  const odemeById = new Map(payments.filter((p) => p.employeeId === employeeId).map((p) => [p.id, p]));
  /* İş bazında prim (lib/prim-is-dagilimi): ödemenin hangi işlere
     istinaden yapıldığı. Bakiye yine toplamdan (yukarıdaki şerit). */
  const isler = isPrimleri(employeeId, accruals, payments, dagitimlar);
  const isAdi = new Map(isler.map((is) => [is.contractId, is.reference]));
  const yeniOdemeIsleri: FormIsi[] = isler.filter((is) => is.acik > 0).map(({ contractId, reference, customer, acik }) => ({ contractId, reference, customer, acik }));
  const odemeDagilimi = (odemeId: string) => dagitimlar.filter((d) => d.paymentId === odemeId);
  // Düzenlemede: açık prim, bu ödemenin payı geri eklenerek; bu ödemenin dağıtıldığı iş açığı kapanmış olsa da listede.
  const duzenlemeIsleri = (odemeId: string): FormIsi[] => {
    const pay = new Map(odemeDagilimi(odemeId).filter((d) => d.contractId).map((d) => [d.contractId as string, d.amount]));
    return isler.filter((is) => is.acik > 0 || pay.has(is.contractId))
      .map(({ contractId, reference, customer, acik }) => ({ contractId, reference, customer, acik: acik + (pay.get(contractId) ?? 0) }));
  };
  const dagilimYazisi = (odemeId: string) => {
    const odeme = odemeById.get(odemeId);
    const kalemler = odemeDagilimi(odemeId).filter((d) => d.contractId);
    if (!odeme || !kalemler.length) return null;
    const bagsiz = baglanmamisKisim(odeme, dagitimlar);
    return kalemler.map((d) => `${isAdi.get(d.contractId as string) ?? "İş"} ${money(d.amount)}`).join(" + ") + (bagsiz ? ` + işe bağlanmamış ${money(bagsiz)}` : "");
  };
  const seciliKod = donem?.kod ?? "tum";
  const donemAdresi = (kod: string) => (kod === "tum" ? `${temelAdres}?pencere=prim` : `${temelAdres}?pencere=prim&prim=${kod}`);

  return (
    <div className="cari-pencere prim-pencere">
      {canManage ? (
        <div className="cari-pencere-eylem">
          <PanelDrawer triggerLabel="Ödeme kaydet" kicker={`PERSONEL · ${personel.full_name}`} title="Prim ödemesi" description={`Bakiye: ${money(toplam.balance)}`}>
            <PrimOdemeFormu eylem={primOdemesiKaydet} personelId={personel.id} isler={yeniOdemeIsleri} dagitimAcik={dagitimAcik} oneri={toplam.balance > 0 ? String(Math.round(toplam.balance / 100)) : "0"} />
          </PanelDrawer>
        </div>
      ) : null}

      {/* BAKİYE ŞERİDİ: tüm geçmiş, dönem süzgecinden bağımsız. */}
      <section className="kayit-serit" aria-label="Prim özeti">
        <dl>
          <div><dt>Hak edilen</dt><dd>{money(toplam.accrued)}</dd></div>
          <div><dt>Ödenen</dt><dd className="cari-arti">{money(toplam.paid)}</dd></div>
          <div className="cari-bakiye" data-tone={toplam.balance > 0 ? "warning" : "success"}><dt>Ödenecek bakiye</dt><dd>{money(toplam.balance)}</dd></div>
          <div><dt>Satış primi oranı</dt><dd>%{percent(personel.commission_rate)}</dd></div>
          <div><dt>Operasyon primi oranı</dt><dd>%{percent(personel.operation_commission_rate)}</dd></div>
        </dl>
      </section>
      {toplam.balance < 0 ? <p className="talep-bos cari-not">Bu personele hak ettiğinden <b>{money(-toplam.balance)}</b> fazla ödenmiş görünüyor; sonraki primlerden mahsup edilir.</p> : null}

      <div className="cari-pencere-izgara">
        <section aria-label="Prim hareketleri">
          <div className="cari-baslik"><h3>Prim hareketleri</h3><small>{hareketler.length} hareket</small></div>
          <nav className="ekip-suzgec talep-suzgec prim-donem" aria-label="Dönem">
            {PRIM_DONEMLERI.filter(([kod]) => kod !== "ozel").map(([kod, ad]) => (
              <Link key={kod} href={donemAdresi(kod)} scroll={false} className={seciliKod === kod ? "is-active" : undefined} aria-current={seciliKod === kod ? "page" : undefined}>{ad}</Link>
            ))}
          </nav>
          {/* Özel aralık: GET formu, pencere açık kalsın diye pencere=prim taşınıyor. */}
          <form className="prim-ozel" action={temelAdres} method="get">
            <input type="hidden" name="pencere" value="prim" />
            <input type="hidden" name="prim" value="ozel" />
            <input type="date" name="prim_bas" defaultValue={donem?.kod === "ozel" ? donem.startKey : ""} aria-label="Başlangıç" required />
            <input type="date" name="prim_bit" defaultValue={donem?.kod === "ozel" ? bitis : ""} aria-label="Bitiş" required />
            <button className={seciliKod === "ozel" ? "panel-primary" : "panel-secondary"}>Aralığı göster</button>
          </form>
          {hareketler.length ? (
            <ul className="cari-hareketler">
              {hareketler.map((h) => (
                <li key={`${h.kind}-${h.id}`}>
                  <span className="status-pill" data-tone={h.kind === "payment" ? "success" : h.accrual < 0 ? "warning" : h.title.startsWith("Satış") ? "gold" : "info"}>{h.kind === "payment" ? "Ödeme" : h.title.startsWith("Satış") ? "Satış" : "Operasyon"}</span>
                  <span className="cari-hareket-metin">
                    <b>{h.title}</b>
                    <small>{dateText(h.date)}{h.detail ? ` · ${h.detail}` : ""} · bakiye {money(h.balance)}</small>
                    {h.kind === "payment" && dagilimYazisi(h.id) ? <small className="prim-dagilim">İstinaden: {dagilimYazisi(h.id)}</small> : null}
                  </span>
                  <strong className={h.kind === "payment" ? "cari-arti" : undefined}>{h.kind === "payment" ? `−${money(h.payment)}` : `+${money(h.accrual)}`}</strong>
                  {canManage && h.kind === "payment" ? (
                    <span className="prim-odeme-eylem">
                      {odemeById.get(h.id) ? (
                        <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary cari-taksit-btn" kicker={`PERSONEL · ${personel.full_name}`} title="Prim ödemesini düzenle" description={`${dateText(h.date)} · ${money(h.payment)}`}>
                          <PrimOdemeFormu eylem={primOdemesiDuzenle} personelId={personel.id} odeme={odemeById.get(h.id)} isler={duzenlemeIsleri(h.id)} dagitimAcik={dagitimAcik}
                            mevcut={Object.fromEntries(odemeDagilimi(h.id).filter((d) => d.contractId).map((d) => [d.contractId as string, d.amount]))} />
                        </PanelDrawer>
                      ) : null}
                      <form action={primOdemesiSil}>
                        <input type="hidden" name="id" value={h.id} />
                        <button className="panel-secondary cari-taksit-btn" type="submit" title="Ödemeyi sil">Sil</button>
                      </form>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ic-akis-bos">{donem ? "Bu dönemde prim hareketi yok." : "Henüz prim hareketi yok. Müşteriden tahsilat yapıldığında ya da bir iş tamamlandığında burada görünür."}</p>
          )}
        </section>

        <section aria-label="Dönem özeti">
          <div className="cari-baslik"><h3>Dönem özeti</h3><small>{donem ? primDonemiYazisi(donem) : "Tüm zamanlar"}</small></div>
          <dl className="talep-liste">
            <div><dt>Satış primi</dt><dd>{money(satisToplam)} <small>· {satis.length} tahsilat</small></dd></div>
            <div><dt>Operasyon primi</dt><dd>{money(operasyonToplam)} <small>· {operasyon.length} iş</small></dd></div>
            <div><dt>Toplam hak ediş</dt><dd><b>{money(satisToplam + operasyonToplam)}</b></dd></div>
            <div><dt>Dönemde ödenen</dt><dd>{money(donemOdemesi)}</dd></div>
          </dl>
          {dagitimAcik && isler.length ? <>
            <div className="cari-baslik prim-is-baslik"><h3>İş bazında prim</h3><small>tüm zamanlar</small></div>
            <ul className="prim-is-ozet">
              {isler.map((is) => (
                <li key={is.contractId}>
                  <span><b>{is.reference}</b><small>{is.customer} · hak edilen {money(is.hakEdilen)} · ödenen {money(is.odenen)}</small></span>
                  <strong className={is.acik > 0 ? "talep-uyari" : is.acik < 0 ? undefined : "cari-arti"}>{is.acik > 0 ? money(is.acik) : is.acik < 0 ? `+${money(-is.acik)} fazla` : "Kapandı"}</strong>
                </li>
              ))}
            </ul>
            <p className="talep-bos cari-not">Açık prim, işin hak edilen priminden o işe istinaden yapılan ödemeler düşülerek bulunur. İşe bağlanmadan yapılan ödemeler burada değil, yalnızca bakiyede görünür.</p>
          </> : null}
          <p className="talep-bos cari-not">Satış primi yalnızca müşteriden gerçekleşen tahsilat üzerinden, tahsilat tarihindeki oranla hesaplanır; tahsil edilmemiş satıştan prim doğmaz. Operasyon primi iş tamamlanınca hak edilir.</p>
        </section>
      </div>
    </div>
  );
}
