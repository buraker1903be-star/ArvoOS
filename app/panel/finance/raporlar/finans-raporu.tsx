import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { finansModeli, type FinansHareketi, type FinansModeli, type KasaHareketi, type Kirilim, type MaliyetKalemi } from "@/lib/rapor-finans";
import Link from "next/link";
import { cssVar, Icon, money, percent, TutarlilikUyarisi, WidgetCard, type Widget } from "./rapor-parcalari";
import { finansTutarliligi } from "@/lib/rapor-tutarlilik";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  FİNANSAL PERFORMANS (RPR-04) — sorgular.

  Karar `lib/rapor-finans.ts`'te ve testli.

  `billing_*` TABLOLARI BURADA YOK ve olmayacak: onlar Arvo'nun kendi
  tahsilatı, kiracının geliri değil. `billing_subscriptions` her kurum
  ödemesinin aktivasyon ikizi ve toplanınca her ödemeyi iki kez
  sayıyor (AGENTS.md "Rakam denetimi").
*/
export async function finansVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<FinansModeli> {
  const bugun = todayInIstanbul();
  /*
    PENCERE: dönem ya da altı aylık seri, hangisi eskiyse. Finans
    defteri hiç küçülmüyor; tamamını çekmek PostgREST'in satır
    tavanına çarptığı gün gelir rakamını SESSİZCE eksiltirdi.

    PLANLI KAYITLAR PENCEREDEN MUAF OLMAK ZORUNDA: vadesi geçmiş bir
    plan altı aydan eski olabilir ve "vadesi geçmiş gider" raporun
    aksiyon gerektiren satırı. O yüzden ikinci bir okuma.
  */
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const seriBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < seriBasi ? donem.startKey : seriBasi;
  const pencereBasi = istanbulMidnight(pencereGunu).toISOString();

  const ALANLAR = "transaction_type,status,amount,category,title,counterparty,due_date,paid_at,created_at";

  const [odenmisler, planlilar, maliyetler, kasaHareketleri] = await Promise.all([
    tumSatirlar<FinansHareketi>("finans hareketleri", (bas, son) =>
      supabase.from("finance_transactions")
        .select(ALANLAR)
        .eq("organization_id", organizationId)
        .eq("status", "paid")
        /* Ödeme anı ya da oluşturulma anı pencerede; ikisi de eski
           olan bir kayıt hiçbir hesaba giremez. */
        .or(`paid_at.gte.${pencereBasi},created_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    /* Planlı kayıtlar TÜM ZAMANLAR: sayıları azdır (ödenince
       "paid" oluyorlar) ve vadesi geçmiş olanı dönemle daraltmak
       raporun en çok işe yarayan satırını gizlerdi. */
    tumSatirlar<FinansHareketi>("planlı hareketler", (bas, son) =>
      supabase.from("finance_transactions")
        .select(ALANLAR)
        .eq("organization_id", organizationId)
        .eq("status", "planned")
        .order("id")
        .range(bas, son)),
    tumSatirlar<MaliyetKalemi>("iş maliyeti kalemleri", (bas, son) =>
      supabase.from("contract_cost_items")
        .select("amount,status,cost_date,category")
        .eq("organization_id", organizationId)
        .gte("cost_date", pencereGunu)
        .order("id")
        .range(bas, son)),
    /*
      KASA HAREKETLERİ YALNIZCA REFERANS İÇİN okunuyor ve hiçbir
      toplama girmiyor. Gerekçe: kurum gelirini defterde tutmuyorsa
      (sözleşme + tahsilat olarak işliyorsa) rapor "gelir ₺0, net
      sonuç eksi" diyor ve bu bir zarar değil. Rakamı göstermek,
      kullanıcıya parasının NEREDE göründüğünü söylüyor.
      Pencere yalnızca DÖNEM: referans rakamı dönemseldir.
    */
    tumSatirlar<KasaHareketi>("cari hareketleri", (bas, son) =>
      supabase.from("account_entries")
        .select("entry_type,source_type,amount,transaction_date")
        .eq("organization_id", organizationId)
        .gte("transaction_date", donem.startKey)
        .order("id")
        .range(bas, son)),
  ]);

  return finansModeli({ donem, bugun, hareketler: [...odenmisler, ...planlilar], maliyetler, kasaHareketleri });
}

export async function FinansRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await finansVerisi({ supabase, organizationId, donem });
  /* Raporun kendi toplamları birbirini tutuyor mu (lib/rapor-tutarlilik).
     Normal şartlarda boş; dolduğu gün ekran bunu söylüyor. */
  const bulgular = finansTutarliligi(m);
  const enYuksek = Math.max(1, ...m.aylik.flatMap((a) => [a.gelir, a.gider + a.maliyet]));
  /* Gelir defteri boş ama para çıkmışsa "net sonuç" bir zarar değil,
     defterin boş olduğunun işareti. Rapor bunu söylemek zorunda. */
  const defterEksik = m.gelirDefteriBos && m.toplamCikis > 0;

  const kutular: Widget[] = [
    {
      label: "Gelir", value: money(m.gelir),
      /*
        KASAYA GİRENİ HER ZAMAN YAZIYOR (24.10.2026).

        Önceden bu karşılaştırma yalnızca gelir defteri BOŞKEN
        görünüyordu. Oysa asıl kafa karıştıran durum defter doluyken
        oluyor: kurum sahibi "gelir ₺388.500 ama tahsilatım ₺452.888"
        diye sordu ve farkı görmek için SQL çalıştırmak gerekti.
        Fark meşru — taksidi tamamlamayan kısmi ödemeler gelire
        dönüşmez — ama görünmeyen bir fark, kullanıcıya rakamın
        yanlış olduğunu düşündürüyor.

        Tahsilat gelire EKLENMİYOR; üç kavram ayrı (docs §3.2).
        Yalnızca yan yana duruyor.
      */
      note: m.gelirDefteriBos
        ? (m.planliGelir.adet
          ? `${m.planliGelir.adet} planlı kayıt var · hiçbiri “ödendi” değil`
          : m.tahsilatReferansi
            ? `Gelir defterinde kayıt yok · kasaya ${money(m.tahsilatReferansi)} girdi`
            : "Gelir defterinde ödenmiş kayıt yok")
        : m.tahsilatReferansi
          ? `${m.gelirAdet} ödenmiş kayıt · kasaya ${money(m.tahsilatReferansi)} girdi`
          : `${m.gelirAdet} ödenmiş kayıt · muhasebesel`,
      icon: "wallet", tone: "success",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.gelir, etiket: money(a.gelir) })) },
    },
    {
      label: "Genel gider", value: money(m.gider), note: `${m.giderAdet} ödenmiş kayıt · iş maliyeti hariç`,
      icon: "briefcase", tone: "warning",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.gider, etiket: money(a.gider) })) },
    },
    {
      label: "İş maliyeti", value: money(m.isMaliyeti), note: "Belirli işlere bağlı ödenmiş maliyet",
      icon: "doc", tone: "warning",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.maliyet, etiket: money(a.maliyet) })) },
    },
    {
      label: "Net sonuç", value: money(m.netSonuc),
      note: defterEksik
        ? "Gelir defteri boş · bu rakam yalnızca çıkışları yansıtıyor"
        : m.marj === null ? "Dönemde gelir kaydı yok" : `${percent(m.marj)} net marj`,
      icon: "chart", tone: m.netSonuc >= 0 ? "success" : "danger", toned: true,
      grafik: { tur: "selale", adimlar: [
        { ad: "Gelir", deger: m.gelir, ton: "success" },
        { ad: "Genel gider", deger: -m.gider, ton: "warning" },
        { ad: "İş maliyeti", deger: -m.isMaliyeti, ton: "warning" },
        { ad: "Kalan", deger: m.netSonuc, ton: m.netSonuc >= 0 ? "success" : "danger" },
      ] },
    },
    {
      label: "Vadesi geçmiş gider", value: money(m.gecikenGider.tutar),
      note: m.gecikenGider.adet ? `${m.gecikenGider.adet} planlı kayıt · şu anki durum` : "Vadesi geçmiş planlı gider yok",
      icon: "alert", tone: m.gecikenGider.tutar ? "danger" : "success", toned: true,
      grafik: { tur: "halka", oran: m.bekleyenGider.tutar + m.gecikenGider.tutar
        ? (m.gecikenGider.tutar / (m.bekleyenGider.tutar + m.gecikenGider.tutar)) * 100
        : null, altyazi: "planlının payı" },
    },
  ];

  return <>
    <TutarlilikUyarisi bulgular={bulgular} />

    {/*
      GELİR DEFTERİ BOŞKEN UYARI. Rapor doğru çalışıyor ama rakam
      yanlış OKUNUYOR: "net sonuç −₺498.789" bir zarar sanılıyor.
      Kurum gelirini `finance_transactions`'a yazmıyorsa (sözleşme +
      tahsilat olarak işliyorsa) defter boş kalır. Uyarı, hem durumu
      hem de paranın nerede göründüğünü söylüyor — tahsilatı gelire
      EKLEMEK yanlış olurdu, üç kavram ayrıdır.
    */}
    {defterEksik ? (
      <p className="rapor-tanim is-uyari">
        <Icon name="alert" size={15} />
        <span>
          <b>Bu dönemde gelir defterinde hiç ödenmiş kayıt yok</b>, bu yüzden “Net sonuç”
          yalnızca çıkışları gösteriyor — <b>bu bir zarar değil</b>.
          {/*
            İKİ AYRI DURUM, İKİ AYRI TAVSİYE. "Defteri hiç
            kullanmıyorlar" ile "yazıyorlar ama ödendi
            işaretlemiyorlar" farklı sorunlar; ikincisine "deftere
            kaydedin" demek yanlış yönlendirme olurdu (24.10.2026'da
            canlı veriyle görüldü: 27 planlı gelir kaydı vardı).
          */}
          {m.planliGelir.adet ? (
            <> Defterde <b>{m.planliGelir.adet} planlı gelir kaydı</b> ({money(m.planliGelir.tutar)}) duruyor
              ama hiçbiri <b>“ödendi”</b> işaretlenmemiş; işaretlendikleri anda bu rapora girerler.</>
          ) : (
            <> Gelirleri burada görmek için ödemeleri <b>Finans → Gelir/Gider</b> defterine de kaydetmek gerekiyor.</>
          )}
          {m.tahsilatReferansi ? <> Aynı dönemde kasaya <b>{money(m.tahsilatReferansi)}</b> girdi;
            müşteri ödemeleri cari hesaplara işleniyor.</> : null}
          {" "}Kasaya giren para <Link href="/panel/finance/raporlar?rapor=tahsilat" className="rapor-kayit-link"><b>Tahsilat ve Alacak</b></Link> raporunda,
          imzalanan sözleşme tutarı <Link href="/panel/finance/raporlar?rapor=satis" className="rapor-kayit-link"><b>Satış Analitiği</b></Link>’nde.
        </span>
      </p>
    ) : null}

    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Bu rapor <b>gelir/gider defterine</b> bakar (<code>finance_transactions</code> + iş maliyeti kalemleri):
        muhasebesel sonuç. Kasaya giren para <b>Tahsilat ve Alacak</b>, imzalanan sözleşme tutarı <b>Satış Analitiği</b> raporunda.
        Üçü ayrı kavramdır; toplanmaz.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>Aylara göre gelir ve çıkış</h3><span>Dönem bitişinden geriye altı ay</span></div>
      {m.aylik.some((a) => a.gelir || a.gider || a.maliyet) ? <>
        <div className="rapor-aylik rapor-aylik-ikili" role="img" aria-label={`Aylık: ${m.aylik.map((a) => `${a.etiket} gelir ${money(a.gelir)}, çıkış ${money(a.gider + a.maliyet)}`).join("; ")}`}>
          {m.aylik.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylik.length - 1 ? " is-current" : ""}`}>
            {/* Gelir ve çıkış yan yana: ayın kârlı mı olduğu tek
                bakışta okunuyor, iki rakamı karşılaştırmak
                gerekmiyor. */}
            <div className="rapor-aylik-cubuk is-ikili">
              <i className="is-gelir" style={cssVar("--h", `${Math.max(3, (a.gelir / enYuksek) * 100)}%`)} title={`Gelir ${money(a.gelir)}`} />
              <i className="is-cikis" style={cssVar("--h", `${Math.max(3, ((a.gider + a.maliyet) / enYuksek) * 100)}%`)} title={`Çıkış ${money(a.gider + a.maliyet)}`} />
            </div>
            <b>{a.etiket}</b>
            <span>{money(a.gelir - a.gider - a.maliyet)}</span>
            <small>net</small>
          </div>)}
        </div>
        <div className="rpt-legend"><span><i className="is-lead" />Gelir</span><span><i className="is-sale" />Çıkış</span></div>
      </> : <p className="rpt-empty-note">Son altı ayda ödenmiş gelir, gider veya maliyet kaydı yok.</p>}
    </section>

    <div className="rapor-ikili">
      <KategoriBloku
        baslik="Gelir kategorileri" altyazi="Ödenmiş gelir kayıtları"
        satirlar={m.gelirKategorileri} bos="Dönemde ödenmiş gelir kaydı yok." ton="success"
      />
      <KategoriBloku
        baslik="Genel gider kategorileri" altyazi="İş maliyeti dışındaki ödenmiş giderler"
        satirlar={m.giderKategorileri} bos="Dönemde ödenmiş genel gider yok." ton="warning"
      />
    </div>

    <div className="rapor-ikili">
      <KategoriBloku
        baslik="İş maliyeti kategorileri" altyazi="Belirli işlere bağlı ödenmiş maliyet"
        satirlar={m.maliyetKategorileri} bos="Dönemde ödenmiş iş maliyeti yok." ton="warning"
      />

      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Planlı hareketler</h3><span>Henüz ödenmemiş kayıtlar</span></div>
        <ul className="rpt-insights">
          <li data-tone="info">
            <span className="rpt-insight-icon"><Icon name="flow" size={17} /></span>
            <div><b>Dönemde vadesi gelen</b><p>{`Gelir ${money(m.bekleyenGelir.tutar)} (${m.bekleyenGelir.adet} kayıt), gider ${money(m.bekleyenGider.tutar)} (${m.bekleyenGider.adet} kayıt).`}</p></div>
          </li>
          <li data-tone={m.gecikenGider.tutar ? "danger" : "success"}>
            <span className="rpt-insight-icon"><Icon name="alert" size={17} /></span>
            <div><b>Vadesi geçmiş gider</b><p>{m.gecikenGider.adet
              ? `${m.gecikenGider.adet} kayıtta ${money(m.gecikenGider.tutar)} ödenmemiş durumda. Bu satır dönemden bağımsız: geçen ayın borcu da burada.`
              : "Vadesi geçmiş planlı gider yok."}</p></div>
          </li>
          <li data-tone={m.gecikenGelir.tutar ? "warning" : "success"}>
            <span className="rpt-insight-icon"><Icon name="wallet" size={17} /></span>
            <div><b>Vadesi geçmiş gelir</b><p>{m.gecikenGelir.adet
              ? `${m.gecikenGelir.adet} kayıtta ${money(m.gecikenGelir.tutar)} bekleniyordu, hâlâ tahsil edilmemiş.`
              : "Vadesi geçmiş planlı gelir yok."}</p></div>
          </li>
          {m.vadesizPlan.adet ? (
            <li data-tone="warning">
              <span className="rpt-insight-icon"><Icon name="doc" size={17} /></span>
              <div><b>Vadesi girilmemiş plan</b><p>{`${m.vadesizPlan.adet} kayıtta ${money(m.vadesizPlan.tutar)} var ama vade tarihi boş; hiçbir döneme düşmüyor.`}</p></div>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  </>;
}

/** Kategori kırılımı; üç blok da aynı biçimde. */
function KategoriBloku({
  baslik, altyazi, satirlar, bos, ton,
}: {
  baslik: string;
  altyazi: string;
  satirlar: Kirilim[];
  bos: string;
  ton: "success" | "warning";
}) {
  return (
    <section className="rapor-blok">
      <div className="rapor-blok-bas"><h3>{baslik}</h3><span>{altyazi}</span></div>
      {satirlar.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead><tr><th>Kategori</th><th className="rpt-money">Tutar</th><th className="rpt-money">Kayıt</th><th>Pay</th></tr></thead>
            <tbody>
              {satirlar.map((k) => <tr key={k.ad}>
                <th scope="row"><b>{k.ad}</b></th>
                <td className="rpt-money">{money(k.tutar)}</td>
                <td className="rpt-money">{k.adet}</td>
                <td className="rapor-pay" data-tone={ton}>
                  <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, k.pay ?? 0)}%`)} /></div>
                  <span>{k.pay === null ? "—" : percent(k.pay)}</span>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">{bos}</p>}
    </section>
  );
}
