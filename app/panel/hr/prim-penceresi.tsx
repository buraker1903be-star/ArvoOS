import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { PRIM_DONEMLERI, primDonemi } from "@/lib/prim-donemi";
import { primDokumu, type PrimBolumu } from "@/lib/prim-dokumu";
import { PanelDrawer } from "../components/panel-drawer";
import { PanelModal } from "../components/panel-modal";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { primOdemesiDuzenle, primOdemesiKaydet, primOdemesiSil } from "./prim-actions";
import type { IsPrimi } from "@/lib/prim-is-dagilimi";
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

  Görünüm (29.10.2026, kurum sahibinin isteği): üstte bakiye şeridi,
  altında yan yana ÜÇ KART — Dönem özeti, Hareket dökümü, İş bazında
  prim. Kart ön bilgiyi gösterir, tıklanınca ayrıntısı kendi penceresinde
  açılır; her ayrıntıda PDF ve Excel çıktısı var. Eskiden üçü tek
  pencerede iki sütuna sıkışıyordu ve hareket listesi uzadıkça iş bazında
  prime ulaşmak için uzun bir kaydırma gerekiyordu.

  Rakamlar lib/prim-dokumu'dan: kart, ayrıntı, Excel ve PDF aynı dökümü
  okuyor. Açık ayrıntı adreste (?prim_kart=hareket): dönem değiştirince
  ya da sayfa yenilenince ayrıntı açık kalsın.
*/

const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value / 100);
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const dateText = (value: string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "numeric" });

/** veri: primVerisi() sonucu; sayfa bakiyeyi başlıkta da gösterdiği için bir kez okuyup buraya veriyor. */
export async function PrimPenceresi({ veri, employeeId, temelAdres, donemKodu, baslangic, bitis, isSekmesi, kart }: { veri: Awaited<ReturnType<typeof primVerisi>>; employeeId: string; temelAdres: string; donemKodu?: string; baslangic?: string; bitis?: string; /** ?prim_is=arsiv: kapanan işler. */ isSekmesi?: string; /** ?prim_kart=…: açık ayrıntı. */ kart?: string }) {
  const { izin } = await getPanelContext();
  const canManage = izin("hr.prim.yonet");
  const { employees, dagitimlar, dagitimAcik } = veri;
  const personel = employees.find((item) => item.id === employeeId);
  if (!personel) return <p className="ic-akis-bos">Personel bulunamadı.</p>;

  const donem = primDonemi(donemKodu, todayInIstanbul(), baslangic, bitis);
  const d = primDokumu(veri, employeeId, donem);
  const { toplam, hareketler, isler, acikIsler, kapananIsler, odemeById } = d;

  /* Ödeme formları: hangi işlere dağıtılabileceği (yalnızca bu pencerede; dökümün parçası değil). */
  const formIsi = ({ contractId, reference, customer, acik, beklenen, devam }: IsPrimi, geriEklenen = 0): FormIsi =>
    ({ contractId, reference, customer, acik: acik + geriEklenen, beklenen, devam });
  // Ödenebilecek: hak edilip ödenmemiş ya da henüz hak edilmemiş (erken ödeme) primi kalan işler.
  const yeniOdemeIsleri: FormIsi[] = isler.filter((is) => is.acik > 0 || is.acik + is.beklenen > 0).map((is) => formIsi(is));
  const odemeDagilimi = (odemeId: string) => dagitimlar.filter((dg) => dg.paymentId === odemeId);
  // Düzenlemede: açık prim, bu ödemenin payı geri eklenerek; bu ödemenin dağıtıldığı iş açığı kapanmış olsa da listede.
  const duzenlemeIsleri = (odemeId: string): FormIsi[] => {
    const pay = new Map(odemeDagilimi(odemeId).filter((dg) => dg.contractId).map((dg) => [dg.contractId as string, dg.amount]));
    return isler.filter((is) => is.acik > 0 || is.acik + is.beklenen > 0 || pay.has(is.contractId))
      .map((is) => formIsi(is, pay.get(is.contractId) ?? 0));
  };

  const seciliKod = donem?.kod ?? "tum";
  /* İş bazında prim: kapanan işler (primi hak edilip tamamı ödenmiş)
     ARŞİV sekmesinde; açık listede yalnızca takip edilecekler kalıyor
     (12.10.2026). */
  const arsivde = isSekmesi === "arsiv";
  const gosterilenIsler = arsivde ? kapananIsler : acikIsler;

  /* Adresler: dönem süzgeci ve açık ayrıntı birlikte taşınıyor. */
  const donemParametreleri = () => {
    const p = new URLSearchParams();
    if (donemKodu) p.set("prim", donemKodu);
    if (baslangic) p.set("prim_bas", baslangic);
    if (bitis) p.set("prim_bit", bitis);
    return p;
  };
  const adres = (ek: { kod?: string; kart?: PrimBolumu; arsiv?: boolean } = {}) => {
    const p = ek.kod !== undefined ? new URLSearchParams() : donemParametreleri();
    if (ek.kod && ek.kod !== "tum") p.set("prim", ek.kod);
    p.set("pencere", "prim");
    if (ek.kart) p.set("prim_kart", ek.kart);
    if (ek.arsiv ?? arsivde) p.set("prim_is", "arsiv");
    return `${temelAdres}?${p.toString()}`;
  };
  const cikti = (tur: "prim-excel" | "prim-yazdir", bolum: PrimBolumu) => {
    const p = donemParametreleri();
    p.set("bolum", bolum);
    return `${temelAdres}/${tur}?${p.toString()}`;
  };

  const donemSecici = (kartta?: PrimBolumu) => (
    <div className="pp-suzgec">
      <nav className="pp-segment" aria-label="Dönem">
        {PRIM_DONEMLERI.filter(([kod]) => kod !== "ozel").map(([kod, ad]) => (
          <Link key={kod} href={adres({ kod, kart: kartta })} scroll={false} className={seciliKod === kod ? "is-active" : undefined} aria-current={seciliKod === kod ? "page" : undefined}>{ad}</Link>
        ))}
      </nav>
      {/* Özel aralık: GET formu, pencere (ve açık ayrıntı) açık kalsın diye taşınıyor. */}
      <form className="pp-aralik" action={temelAdres} method="get">
        <input type="hidden" name="pencere" value="prim" />
        <input type="hidden" name="prim" value="ozel" />
        {kartta ? <input type="hidden" name="prim_kart" value={kartta} /> : null}
        <input type="date" name="prim_bas" defaultValue={donem?.kod === "ozel" ? donem.startKey : ""} aria-label="Başlangıç" required />
        <span aria-hidden="true">–</span>
        <input type="date" name="prim_bit" defaultValue={donem?.kod === "ozel" ? bitis : ""} aria-label="Bitiş" required />
        <button className={seciliKod === "ozel" ? "panel-primary" : "panel-secondary"}>Göster</button>
      </form>
    </div>
  );

  const ciktiCubugu = (bolum: PrimBolumu) => (
    <div className="pp-cikti">
      <span>{d.donemYazisi}</span>
      <div>
        <a className="panel-secondary" href={cikti("prim-yazdir", bolum)} target="_blank" rel="noopener">PDF</a>
        <a className="panel-secondary" href={cikti("prim-excel", bolum)} download>Excel</a>
      </div>
    </div>
  );

  const ayrinti = (bolum: PrimBolumu, baslik: string, tetik: React.ReactNode, icerik: React.ReactNode, boy: "orta" | "genis" = "genis") => (
    <PanelModal
      triggerLabel={`${baslik} ayrıntısı`}
      triggerClassName="pp-kart"
      tetik={tetik}
      kicker={`PRİM HESABI · ${personel.full_name}`}
      title={baslik}
      description={d.donemYazisi}
      boy={boy}
      baslangicAcik={kart === bolum}
      kapaninca={kart === bolum ? adres() : undefined}
    >
      <div className="pp-ayrinti">
        {ciktiCubugu(bolum)}
        {icerik}
      </div>
    </PanelModal>
  );

  const kartBasi = (simge: string, baslik: string, alt: string) => (
    <span className="pp-kart-bas">
      <span className="pp-kart-simge" aria-hidden="true">{simge}</span>
      <span><b>{baslik}</b><small>{alt}</small></span>
    </span>
  );
  const kartSonu = <span className="pp-kart-son">Ayrıntıyı aç · PDF · Excel →</span>;

  const hareketSatiri = (h: (typeof hareketler)[number]) => {
    const odeme = h.kind === "payment";
    const tur = odeme ? "Ödeme" : h.title.startsWith("Satış") ? "Satış" : "Operasyon";
    const dagilim = odeme ? d.dagilimYazisi(h.id, money) : null;
    return (
      <li key={`${h.kind}-${h.id}`}>
        <span className="pp-tur" data-tone={odeme ? "success" : h.accrual < 0 ? "warning" : tur === "Satış" ? "gold" : "info"} aria-hidden="true">{tur.slice(0, 1)}</span>
        <span className="pp-govde">
          <b>{h.title}</b>
          <small>{dateText(h.date)} · {tur}{h.detail ? ` · ${h.detail}` : ""}</small>
          {dagilim ? <small className="pp-dagilim">İstinaden: {dagilim}</small> : null}
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
                  mevcut={Object.fromEntries(odemeDagilimi(h.id).filter((dg) => dg.contractId).map((dg) => [dg.contractId as string, dg.amount]))} />
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
  };

  const isSatiri = (is: IsPrimi) => (
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
  );

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

      <section className="pp-kartlar-alan" aria-label="Prim dökümleri">
        <header className="pp-bolum-bas"><h3>Dökümler</h3><small>Dönem: {d.donemYazisi}</small></header>
        {donemSecici()}
        <div className="pp-kartlar">
          {ayrinti("ozet", "Dönem özeti", <>
            {kartBasi("Σ", "Dönem özeti", d.donemYazisi)}
            <span className="pp-kart-rakam"><small>Dönemde hak ediş</small><b>{money(d.ozet.hakEdis)}</b></span>
            <span className="pp-kart-satirlar">
              <span><span>Satış primi · {d.ozet.satisAdet} tahsilat</span><b>{money(d.ozet.satisToplam)}</b></span>
              <span><span>Operasyon primi · {d.ozet.operasyonAdet} iş</span><b>{money(d.ozet.operasyonToplam)}</b></span>
              <span><span>Dönemde ödenen</span><b data-tone="success">{money(d.ozet.donemOdemesi)}</b></span>
            </span>
            {kartSonu}
          </>, <>
            <dl className="pp-tablo">
              <div><dt>Satış primi <small>{d.ozet.satisAdet} tahsilat</small></dt><dd>{money(d.ozet.satisToplam)}</dd></div>
              <div><dt>Operasyon primi <small>{d.ozet.operasyonAdet} iş</small></dt><dd>{money(d.ozet.operasyonToplam)}</dd></div>
              <div className="pp-toplam"><dt>Dönemde hak ediş</dt><dd>{money(d.ozet.hakEdis)}</dd></div>
              <div><dt>Dönemde ödenen <small>{d.ozet.odemeAdet} ödeme</small></dt><dd data-tone="success">{money(d.ozet.donemOdemesi)}</dd></div>
            </dl>
            <dl className="pp-tablo">
              <div><dt>Hak edilen <small>tüm zamanlar</small></dt><dd>{money(toplam.accrued)}</dd></div>
              <div><dt>Ödenen <small>tüm zamanlar</small></dt><dd data-tone="success">{money(toplam.paid)}</dd></div>
              <div className="pp-toplam"><dt>Ödenecek bakiye</dt><dd>{money(toplam.balance)}</dd></div>
            </dl>
            <p className="pp-not">Satış primi yalnızca müşteriden gerçekleşen tahsilat üzerinden, tahsilat tarihindeki oranla hesaplanır; tahsil edilmemiş satıştan prim doğmaz. Operasyon primi iş tamamlanınca hak edilir.</p>
          </>, "orta")}

          {ayrinti("hareket", "Hareket dökümü", <>
            {kartBasi("≡", "Hareket dökümü", d.donemYazisi)}
            <span className="pp-kart-rakam"><small>Hareket</small><b>{hareketler.length}</b></span>
            {hareketler.length ? (
              <span className="pp-kart-satirlar">
                {hareketler.slice(0, 3).map((h) => (
                  <span key={`${h.kind}-${h.id}`}><span>{dateText(h.date)} · {h.title}</span><b data-tone={h.kind === "payment" ? "success" : undefined}>{h.kind === "payment" ? `−${money(h.payment)}` : `+${money(h.accrual)}`}</b></span>
                ))}
              </span>
            ) : <span className="pp-kart-bos">Bu dönemde hareket yok.</span>}
            {kartSonu}
          </>, <>
            {donemSecici("hareket")}
            {hareketler.length ? <ul className="pp-liste">{hareketler.map(hareketSatiri)}</ul> : (
              <p className="pp-bos">{donem ? "Bu dönemde prim hareketi yok." : "Henüz prim hareketi yok. Müşteriden tahsilat yapıldığında ya da bir iş tamamlandığında burada görünür."}</p>
            )}
          </>)}

          {dagitimAcik ? ayrinti("is", "İş bazında prim", <>
            {kartBasi("▦", "İş bazında prim", "tüm zamanlar")}
            <span className="pp-kart-rakam"><small>Açık prim</small><b data-tone={d.acikPrim > 0 ? "warning" : undefined}>{money(d.acikPrim)}</b></span>
            <span className="pp-kart-satirlar">
              <span><span>Açık iş</span><b>{acikIsler.length}</b></span>
              {acikIsler.slice(0, 2).map((is) => (
                <span key={is.contractId}><span>{is.reference} · {is.customer}</span><b>{is.acik > 0 ? money(is.acik) : is.acik < 0 ? "avans" : "—"}</b></span>
              ))}
              <span><span>Kapanan (arşiv)</span><b>{kapananIsler.length}</b></span>
            </span>
            {kartSonu}
          </>, <>
            <nav className="pp-segment" aria-label="İş bazında prim">
              <Link href={adres({ kart: "is", arsiv: false })} scroll={false} className={!arsivde ? "is-active" : undefined} aria-current={!arsivde ? "page" : undefined}>Açık <small>{acikIsler.length}</small></Link>
              <Link href={adres({ kart: "is", arsiv: true })} scroll={false} className={arsivde ? "is-active" : undefined} aria-current={arsivde ? "page" : undefined}>Arşiv <small>{kapananIsler.length}</small></Link>
            </nav>
            {gosterilenIsler.length ? <ul className="pp-liste pp-isler">{gosterilenIsler.map(isSatiri)}</ul> : (
              <p className="pp-bos">{arsivde ? "Henüz primi tamamen ödenip kapanan iş yok." : isler.length ? "Takip edilecek açık iş yok; bütün işlerin primi ödenmiş. Kapananlar Arşiv'de." : "Henüz prim doğmuş iş yok."}</p>
            )}
            <p className="pp-not">Açık prim, işin hak edilen priminden o işe istinaden yapılan ödemeler düşülerek bulunur. Henüz hak edilmemiş işe yapılan erken ödeme “avans” görünür; iş tamamlanıp prim hak edilince ona sayılır. “Hak edilecek” tahminidir: bugünkü orandan, kesin rakam hak edilince oluşur. İşe bağlanmadan yapılan ödemeler burada değil, yalnızca bakiyede görünür. Bir işe sonradan yeni prim doğarsa (ör. ek tahsilat) iş arşivden açık listeye kendiliğinden döner.</p>
          </>) : (
            <div className="pp-kart" aria-disabled="true">
              {kartBasi("▦", "İş bazında prim", "şu an okunamıyor")}
              <span className="pp-kart-bos">Ödemelerin işlere dağılımı okunamadı; bakiye etkilenmez. Biraz sonra yeniden deneyin.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
