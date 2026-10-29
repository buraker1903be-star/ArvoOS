import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { inPeriod } from "@/lib/commission-accruals";
import { employeeLedger, ledgerTotals } from "@/lib/commission-ledger";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { gunDonemde, PRIM_DONEMLERI, primDonemi, primDonemiYazisi } from "@/lib/prim-donemi";
import { PanelDrawer } from "../components/panel-drawer";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { primOdemesiDuzenle, primOdemesiKaydet, primOdemesiSil } from "./prim-actions";
import { baglanmamisKisim, beklenenPrimler, isKapandi, isPrimleri } from "@/lib/prim-is-dagilimi";
import { PrimOdemeFormu, type FormIsi } from "./prim-odeme-formu";
import type { primVerisi } from "./prim-verisi";
import "../finance/finance.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";
import "./prim-penceresi.css";

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

  Görünüm (29.10.2026, kurum sahibinin isteği: personel sayfasıyla "aynı
  kalitede"): üstte üç büyük rakam (hak edilen, ödenen, ödenecek) ve
  oranlar; hareketler gün sırasıyla çerçeveli listede, tutar sağda ve
  yönüne göre renkli; dönem seçici segmentli. Eskiden pencerenin sağ
  sütununun yarısı dört paragraflık açıklamaydı ve asıl rakamları
  aşağı itiyordu — açıklamalar artık "Hesap nasıl yapılıyor?" altında.
*/

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const dateText = (value: string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });

/** veri: primVerisi() sonucu; sayfa bakiyeyi başlıkta da gösterdiği için bir kez okuyup buraya veriyor. */
export async function PrimPenceresi({ veri, employeeId, temelAdres, donemKodu, baslangic, bitis, isSekmesi }: { veri: Awaited<ReturnType<typeof primVerisi>>; employeeId: string; temelAdres: string; donemKodu?: string; baslangic?: string; bitis?: string; /** ?prim_is=arsiv: kapanan işler. */ isSekmesi?: string }) {
  const { izin } = await getPanelContext();
  const canManage = izin("hr.prim.yonet");
  const { employees, accruals, payments, dagitimlar, dagitimAcik, beklenenGirdisi } = veri;
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
  const girdi = beklenenGirdisi(employeeId);
  const isler = isPrimleri(employeeId, accruals, payments, dagitimlar, girdi ? beklenenPrimler(girdi, accruals) : []);
  const formIsi = ({ contractId, reference, customer, acik, beklenen, devam }: (typeof isler)[number], geriEklenen = 0): FormIsi =>
    ({ contractId, reference, customer, acik: acik + geriEklenen, beklenen, devam });
  const isAdi = new Map(isler.map((is) => [is.contractId, is.reference]));
  // Ödenebilecek: hak edilip ödenmemiş ya da henüz hak edilmemiş (erken ödeme) primi kalan işler.
  const yeniOdemeIsleri: FormIsi[] = isler.filter((is) => is.acik > 0 || is.acik + is.beklenen > 0).map((is) => formIsi(is));
  const odemeDagilimi = (odemeId: string) => dagitimlar.filter((d) => d.paymentId === odemeId);
  // Düzenlemede: açık prim, bu ödemenin payı geri eklenerek; bu ödemenin dağıtıldığı iş açığı kapanmış olsa da listede.
  const duzenlemeIsleri = (odemeId: string): FormIsi[] => {
    const pay = new Map(odemeDagilimi(odemeId).filter((d) => d.contractId).map((d) => [d.contractId as string, d.amount]));
    return isler.filter((is) => is.acik > 0 || is.acik + is.beklenen > 0 || pay.has(is.contractId))
      .map((is) => formIsi(is, pay.get(is.contractId) ?? 0));
  };
  const dagilimYazisi = (odemeId: string) => {
    const odeme = odemeById.get(odemeId);
    const kalemler = odemeDagilimi(odemeId).filter((d) => d.contractId);
    if (!odeme || !kalemler.length) return null;
    const bagsiz = baglanmamisKisim(odeme, dagitimlar);
    return kalemler.map((d) => `${isAdi.get(d.contractId as string) ?? "İş"} ${money(d.amount)}`).join(" + ") + (bagsiz ? ` + işe bağlanmamış ${money(bagsiz)}` : "");
  };
  const seciliKod = donem?.kod ?? "tum";
  /* İş bazında prim: kapanan işler (primi hak edilip tamamı ödenmiş)
     ARŞİV sekmesinde; açık listede yalnızca takip edilecekler kalıyor
     (12.10.2026). Eskiden kapanan işler "Kapandı" yazısıyla listede
     duruyor, iş sayısı arttıkça açık olanlar aralarında kayboluyordu.
     Sekme adreste; dönem süzgeci de korunuyor. */
  const arsivde = isSekmesi === "arsiv";
  const kapananIsler = isler.filter(isKapandi);
  const acikIsler = isler.filter((is) => !isKapandi(is));
  const gosterilenIsler = arsivde ? kapananIsler : acikIsler;
  const isSekmeAdresi = (arsiv: boolean) => {
    const p = new URLSearchParams({ pencere: "prim" });
    if (donemKodu) p.set("prim", donemKodu);
    if (baslangic) p.set("prim_bas", baslangic);
    if (bitis) p.set("prim_bit", bitis);
    if (arsiv) p.set("prim_is", "arsiv");
    return `${temelAdres}?${p.toString()}`;
  };
  const donemAdresi = (kod: string) => (kod === "tum" ? `${temelAdres}?pencere=prim` : `${temelAdres}?pencere=prim&prim=${kod}`);

  return (
    <div className="pp">
      <header className="pp-bas">
        <div className="pp-oranlar">
          <span>Satış primi <b>%{percent(personel.commission_rate)}</b></span>
          <span>Operasyon primi <b>%{percent(personel.operation_commission_rate)}</b></span>
        </div>
        {canManage ? (
          <PanelDrawer genis triggerLabel="Ödeme kaydet" triggerClassName="panel-primary" kicker={`PERSONEL · ${personel.full_name}`} title="Prim ödemesi" description={`Bakiye: ${money(toplam.balance)}`}>
            <PrimOdemeFormu eylem={primOdemesiKaydet} personelId={personel.id} isler={yeniOdemeIsleri} dagitimAcik={dagitimAcik} oneri={toplam.balance > 0 ? String(Math.round(toplam.balance / 100)) : "0"} />
          </PanelDrawer>
        ) : null}
      </header>

      {/* BAKİYE ŞERİDİ: tüm geçmiş, dönem süzgecinden bağımsız. */}
      <dl className="pp-ozet" aria-label="Prim özeti">
        <div><dt>Hak edilen</dt><dd>{money(toplam.accrued)}</dd><small>tüm zamanlar</small></div>
        <div><dt>Ödenen</dt><dd data-tone="success">{money(toplam.paid)}</dd><small>tüm zamanlar</small></div>
        <div className="pp-bakiye" data-tone={toplam.balance > 0 ? "warning" : toplam.balance < 0 ? "danger" : "success"}>
          <dt>Ödenecek bakiye</dt><dd>{money(toplam.balance)}</dd>
          <small>{toplam.balance > 0 ? "ödenmeyi bekliyor" : toplam.balance < 0 ? "fazla ödenmiş" : "hesap kapalı"}</small>
        </div>
      </dl>
      {toplam.balance < 0 ? <p className="pp-uyari">Bu personele hak ettiğinden <b>{money(-toplam.balance)}</b> fazla ödenmiş görünüyor; sonraki primlerden mahsup edilir.</p> : null}

      <div className="pp-izgara">
        <section aria-label="Prim hareketleri">
          <header className="pp-bolum-bas">
            <h3>Prim hareketleri <small className="pp-sayi">{hareketler.length}</small></h3>
          </header>
          <div className="pp-suzgec">
            <nav className="pp-segment" aria-label="Dönem">
              {PRIM_DONEMLERI.filter(([kod]) => kod !== "ozel").map(([kod, ad]) => (
                <Link key={kod} href={donemAdresi(kod)} scroll={false} className={seciliKod === kod ? "is-active" : undefined} aria-current={seciliKod === kod ? "page" : undefined}>{ad}</Link>
              ))}
            </nav>
            {/* Özel aralık: GET formu, pencere açık kalsın diye pencere=prim taşınıyor. */}
            <form className="pp-aralik" action={temelAdres} method="get">
              <input type="hidden" name="pencere" value="prim" />
              <input type="hidden" name="prim" value="ozel" />
              <input type="date" name="prim_bas" defaultValue={donem?.kod === "ozel" ? donem.startKey : ""} aria-label="Başlangıç" required />
              <span aria-hidden="true">–</span>
              <input type="date" name="prim_bit" defaultValue={donem?.kod === "ozel" ? bitis : ""} aria-label="Bitiş" required />
              <button className={seciliKod === "ozel" ? "panel-primary" : "panel-secondary"}>Göster</button>
            </form>
          </div>
          {hareketler.length ? (
            <ul className="pp-liste">
              {hareketler.map((h) => {
                const odeme = h.kind === "payment";
                const tur = odeme ? "Ödeme" : h.title.startsWith("Satış") ? "Satış" : "Operasyon";
                return (
                  <li key={`${h.kind}-${h.id}`} data-tur={odeme ? "odeme" : "hak"}>
                    <span className="pp-tur" data-tone={odeme ? "success" : h.accrual < 0 ? "warning" : tur === "Satış" ? "gold" : "info"} aria-hidden="true">{tur.slice(0, 1)}</span>
                    <span className="pp-govde">
                      <b>{h.title}</b>
                      <small>{dateText(h.date)} · {tur}{h.detail ? ` · ${h.detail}` : ""}</small>
                      {odeme && dagilimYazisi(h.id) ? <small className="pp-dagilim">İstinaden: {dagilimYazisi(h.id)}</small> : null}
                    </span>
                    <span className="pp-tutar">
                      <strong data-tone={odeme ? "success" : undefined}>{odeme ? `−${money(h.payment)}` : `+${money(h.accrual)}`}</strong>
                      <small>bakiye {money(h.balance)}</small>
                    </span>
                    {canManage && odeme ? (
                      <span className="pp-eylem">
                        {odemeById.get(h.id) ? (
                          <PanelDrawer genis triggerLabel="Düzenle" triggerClassName="panel-secondary pp-kucuk" kicker={`PERSONEL · ${personel.full_name}`} title="Prim ödemesini düzenle" description={`${dateText(h.date)} · ${money(h.payment)}`}>
                            <PrimOdemeFormu eylem={primOdemesiDuzenle} personelId={personel.id} odeme={odemeById.get(h.id)} isler={duzenlemeIsleri(h.id)} dagitimAcik={dagitimAcik}
                              mevcut={Object.fromEntries(odemeDagilimi(h.id).filter((d) => d.contractId).map((d) => [d.contractId as string, d.amount]))} />
                          </PanelDrawer>
                        ) : null}
                        {/* Prim ödemesi bir PARA kaydı: silinince personelin prim
                            bakiyesi değişiyor ve geri gelmiyor. Onay soruluyor. */}
                        <form action={primOdemesiSil}>
                          <input type="hidden" name="id" value={h.id} />
                          <ConfirmDeleteButton label="Sil" confirmMessage="Bu prim ödemesini silmek istediğinize emin misiniz? Bakiye yeniden hesaplanır." />
                        </form>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pp-bos">{donem ? "Bu dönemde prim hareketi yok." : "Henüz prim hareketi yok. Müşteriden tahsilat yapıldığında ya da bir iş tamamlandığında burada görünür."}</p>
          )}
        </section>

        <aside className="pp-yan" aria-label="Dönem özeti">
          <section>
            <header className="pp-bolum-bas"><h3>Dönem özeti</h3><small>{donem ? primDonemiYazisi(donem) : "Tüm zamanlar"}</small></header>
            <dl className="pp-tablo">
              <div><dt>Satış primi <small>{satis.length} tahsilat</small></dt><dd>{money(satisToplam)}</dd></div>
              <div><dt>Operasyon primi <small>{operasyon.length} iş</small></dt><dd>{money(operasyonToplam)}</dd></div>
              <div className="pp-toplam"><dt>Toplam hak ediş</dt><dd>{money(satisToplam + operasyonToplam)}</dd></div>
              <div><dt>Dönemde ödenen</dt><dd data-tone="success">{money(donemOdemesi)}</dd></div>
            </dl>
          </section>

          {dagitimAcik && isler.length ? (
            <section>
              <header className="pp-bolum-bas">
                <h3>İş bazında prim</h3>
                <nav className="pp-segment" aria-label="İş bazında prim">
                  <Link href={isSekmeAdresi(false)} scroll={false} className={!arsivde ? "is-active" : undefined} aria-current={!arsivde ? "page" : undefined}>Açık <small>{acikIsler.length}</small></Link>
                  <Link href={isSekmeAdresi(true)} scroll={false} className={arsivde ? "is-active" : undefined} aria-current={arsivde ? "page" : undefined}>Arşiv <small>{kapananIsler.length}</small></Link>
                </nav>
              </header>
              {gosterilenIsler.length ? <ul className="pp-liste pp-isler">
                {gosterilenIsler.map((is) => (
                  <li key={is.contractId}>
                    <span className="pp-govde">
                      <b>{is.reference}{is.devam ? <em className="pp-devam">iş sürüyor</em> : null}</b>
                      <small>{is.customer} · hak edilen {money(is.hakEdilen)} · ödenen {money(is.odenen)}{is.beklenen > 0 ? ` · hak edilecek ~${money(is.beklenen)}` : ""}</small>
                    </span>
                    <span className="pp-tutar">
                      <strong data-tone={is.acik > 0 ? "warning" : is.acik < 0 ? undefined : "success"}>{is.acik > 0 ? money(is.acik) : is.acik < 0 ? `${money(-is.acik)} avans` : is.beklenen > 0 ? "—" : "Kapandı"}</strong>
                      {is.acik > 0 ? <small>açık prim</small> : null}
                    </span>
                  </li>
                ))}
              </ul> : <p className="pp-bos">{arsivde ? "Henüz primi tamamen ödenip kapanan iş yok." : "Takip edilecek açık iş yok; bütün işlerin primi ödenmiş. Kapananlar Arşiv'de."}</p>}
            </section>
          ) : null}

          <details className="pp-aciklama">
            <summary>Hesap nasıl yapılıyor?</summary>
            <p>Satış primi yalnızca müşteriden gerçekleşen tahsilat üzerinden, tahsilat tarihindeki oranla hesaplanır; tahsil edilmemiş satıştan prim doğmaz. Operasyon primi iş tamamlanınca hak edilir.</p>
            {dagitimAcik && isler.length ? <>
              <p>Açık prim, işin hak edilen priminden o işe istinaden yapılan ödemeler düşülerek bulunur. Henüz hak edilmemiş işe yapılan erken ödeme “avans” görünür; iş tamamlanıp prim hak edilince ona sayılır. “Hak edilecek” tahminidir: bugünkü orandan, kesin rakam hak edilince oluşur. İşe bağlanmadan yapılan ödemeler burada değil, yalnızca bakiyede görünür.</p>
              <p>Arşivde primi hak edilip tamamı ödenen işler var. Bir işe sonradan yeni prim doğarsa (ör. ek tahsilat) iş kendiliğinden açık listeye döner.</p>
            </> : null}
          </details>
        </aside>
      </div>
    </div>
  );
}
