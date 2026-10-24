import Link from "next/link";
import { monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { gunYazisi } from "@/lib/rapor-donemi";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { tahsilatModeli, YAKLASAN_GUN, type TahsilatCarisi, type TahsilatHareketi, type TahsilatModeli } from "@/lib/rapor-tahsilat";
import { buildAccountBalances, netTahsilatToplamdan, type CariToplam } from "../account-balances";
import { cssVar, Icon, money, percent, TutarlilikUyarisi, WidgetCard, type Widget } from "./rapor-parcalari";
import { tahsilatTutarliligi } from "@/lib/rapor-tutarlilik";
import type { RaporGirdisi } from "./rapor-girdisi";
import type { DagitilacakTaksit } from "@/lib/taksit-dagitimi";

/*
  TAHSİLAT VE ALACAK (RPR-03) — sorgular.

  Karar `lib/rapor-tahsilat.ts`'te ve testli; burada okuma var.
  BAKİYE KURALI BURADA DA YAZILMIYOR: `buildAccountBalances`
  (finance/account-balances.ts) tek kaynak — Cari Hesaplar sekmesi ve
  Finans genel bakış aynı işlevi çağırıyor. Raporun kendi bakiye
  hesabını yazması, aynı müşteri için üç ekranda üç ayrı rakam
  demekti.
*/

/** Bakiye ve taksit kalanı aynı kümeden bakıyor (genel bakışla aynı). */
const IMZALI = ["signed", "completed"] as const;

type CariSatiri = { id: string; name: string } & CariToplam;
type SozlesmeSatiri = { id: string; party_id: string | null; amount: number; payment_plan_id: string | null };
type TaksitSatiri = DagitilacakTaksit & { payment_plan_id: string; installment_no: number };

export async function tahsilatVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<TahsilatModeli> {
  const bugun = todayInIstanbul();
  /*
    HAREKET PENCERESİ: dönem ya da altı aylık seri, hangisi eskiyse.
    Defter hiç küçülmüyor; tamamını çekmek PostgREST'in satır
    tavanına çarptığı gün tahsilat rakamını SESSİZCE eksiltirdi.
  */
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const seriBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < seriBasi ? donem.startKey : seriBasi;

  const [cariSatirlari, sozlesmeler, taksitler, hareketler] = await Promise.all([
    /* Cariler TOPLAMLARIYLA (cari_liste görünümü): her carinin bütün
       hareketlerini dört toplam için taşımak, defter büyüdükçe en
       pahalı okuma oluyor. */
    tumSatirlar<CariSatiri>("cari hesaplar", (bas, son) =>
      supabase.from("cari_liste")
        .select("id,name,defter_borc,ek_hizmet,tahsilat,iade")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("party_type", ["customer", "both"])
        .order("id")
        .range(bas, son)),
    tumSatirlar<SozlesmeSatiri>("sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select("id,party_id,amount,payment_plan_id")
        .eq("organization_id", organizationId)
        .in("status", [...IMZALI])
        .order("id")
        .range(bas, son)),
    /*
      TAKSİTLER TÜM ZAMANLAR ve bu bilerek: taksit merdiveni bir
      DURUM, dönem değil. Pencereyle daraltmak, vadesi geçmiş eski
      taksitleri alacaktan düşürüp borcu olduğundan küçük
      gösterirdi (AGENTS.md "Her sınırsız okuma hata değil").
    */
    tumSatirlar<TaksitSatiri>("ödeme taksitleri", (bas, son) =>
      supabase.from("payment_installments")
        .select("id,payment_plan_id,installment_no,due_date,amount,status")
        .eq("organization_id", organizationId)
        .order("id")
        .range(bas, son)),
    tumSatirlar<TahsilatHareketi>("cari hareketleri", (bas, son) =>
      supabase.from("account_entries")
        .select("entry_type,source_type,amount,transaction_date")
        .eq("organization_id", organizationId)
        .gte("transaction_date", pencereGunu)
        .order("id")
        .range(bas, son)),
  ]);

  const { accounts } = buildAccountBalances(cariSatirlari, sozlesmeler);

  /* Taksit yalnızca İMZALI sözleşmenin planından sayılıyor: taslak
     sözleşmenin planı henüz bir alacak değil. */
  const planinCarisi = new Map<string, string>();
  for (const s of sozlesmeler) if (s.payment_plan_id && s.party_id) planinCarisi.set(s.payment_plan_id, s.party_id);

  const cariTaksitleri = new Map<string, DagitilacakTaksit[]>();
  for (const t of taksitler) {
    const cariId = planinCarisi.get(t.payment_plan_id);
    if (!cariId) continue;
    const liste = cariTaksitleri.get(cariId);
    if (liste) liste.push(t);
    else cariTaksitleri.set(cariId, [t]);
  }

  const cariler: TahsilatCarisi[] = accounts.map((a) => ({
    id: a.id,
    ad: a.name?.trim() || "Adsız müşteri",
    bakiye: a.balance,
    netTahsilat: netTahsilatToplamdan(a),
    taksitler: cariTaksitleri.get(a.id) ?? [],
  }));

  return tahsilatModeli({ donem, bugun, hareketler, cariler });
}

export async function TahsilatRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await tahsilatVerisi({ supabase, organizationId, donem });
  /* Raporun kendi toplamları birbirini tutuyor mu (lib/rapor-tutarlilik).
     Normal şartlarda boş; dolduğu gün ekran bunu söylüyor. */
  const bulgular = tahsilatTutarliligi(m);
  const aylar = m.takvim.filter((a) => a.tur === "ay");
  const enYuksekAy = Math.max(1, ...aylar.map((a) => a.tutar));
  const enYuksekTahsilat = Math.max(1, ...m.aylikTahsilat.map((a) => a.tutar));
  const vadesizSatiri = m.takvim.find((a) => a.tur === "vadesiz");
  /* Takvimde görünmeyen kalan: ufkun ötesindeki vadeler. Fark
     söylenmezse "planlı kalan" ile takvim toplamı tutmaz ve
     kullanıcı hangisinin yanlış olduğunu bilemez. */
  const takvimToplami = m.takvim.reduce((t, a) => t + a.tutar, 0);
  const ufkunOtesi = Math.max(0, m.planliKalan - takvimToplami);

  const kutular: Widget[] = [
    {
      label: "Dönem tahsilatı", value: money(m.donemTahsilat),
      note: m.donemIade ? `${money(m.donemIade)} iade düşülünce ${money(m.donemNet)}` : `${m.donemAdet} tahsilat kaydı`,
      icon: "wallet", tone: "success",
      grafik: { tur: "cubuk", bicim: "para", seri: m.aylikTahsilat.map((a) => ({ ad: a.etiket, eksen: a.etiket.slice(0, 3), deger: a.tutar, etiket: money(a.tutar) })) },
    },
    {
      label: "Açık alacak", value: money(m.acikBakiye), note: "Şu anki toplam — dönemden bağımsız",
      icon: "briefcase", tone: "brand",
      grafik: { tur: "yigin", bicim: "para", parcalar: [
        { ad: "Planlı", deger: m.planliKalan, ton: "brand" },
        { ad: "Plansız", deger: m.plansizKalan, ton: "warning" },
      ] },
    },
    {
      label: "Vadesi geçmiş", value: money(m.gecikmisKalan),
      note: m.gecikmisAdet ? `${m.gecikmisAdet} taksit · açık alacağın ${percent(m.acikBakiye ? (m.gecikmisKalan / m.acikBakiye) * 100 : 0)}` : "Gecikmiş taksit yok",
      icon: "alert", tone: m.gecikmisKalan ? "danger" : "success", toned: true,
      grafik: { tur: "halka", oran: m.acikBakiye ? (m.gecikmisKalan / m.acikBakiye) * 100 : null, altyazi: "alacağın payı" },
    },
    {
      label: "Önümüzdeki ay beklenen", value: money(m.onumuzdekiAy?.tutar ?? 0),
      note: m.onumuzdekiAy ? `${m.onumuzdekiAy.etiket} · ${m.onumuzdekiAy.adet} taksit` : "Takvim kurulamadı",
      icon: "flow", tone: "gold",
      grafik: { tur: "cubuk", bicim: "para", seri: aylar.slice(0, 6).map((a) => ({ ad: a.etiket, eksen: a.etiket.slice(0, 3), deger: a.tutar, etiket: money(a.tutar) })) },
    },
    {
      label: "Planı olmayan alacak", value: money(m.plansizKalan),
      note: "Ödeme planı bulunmayan sözleşme ve defter borcu",
      icon: "doc", tone: m.plansizKalan ? "warning" : "info",
      grafik: { tur: "gosterge", oran: m.acikBakiye ? (m.plansizKalan / m.acikBakiye) * 100 : 0 },
    },
  ];

  return <>
    <TutarlilikUyarisi bulgular={bulgular} />

    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Üç ayrı soru: <b>dönem tahsilatı</b> kasaya giren para (akış),
        <b> açık alacak</b> şu anki durum (dönemden bağımsız),
        <b> beklenen tahsilat</b> ödeme planı taksitlerinden kurulan takvim.
        Beklenen tutar taksitin tutarı değil <b>kalanı</b>: cari dökümündeki tahsilat
        en eski vadeden başlayarak dağıtılıp öyle hesaplanıyor.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Aylara göre beklenen tahsilat</h3>
        <span>Ödeme planı olan sözleşmelerin kalan taksitleri · gelecek 12 ay</span>
      </div>
      {m.planliKalan ? <>
        <div className="rapor-aylik" role="img" aria-label={`Beklenen tahsilat: ${aylar.map((a) => `${a.etiket} ${money(a.tutar)}`).join("; ")}`}>
          {aylar.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === 0 ? " is-current" : ""}`}>
            <div className="rapor-aylik-cubuk"><i style={cssVar("--h", `${Math.max(3, (a.tutar / enYuksekAy) * 100)}%`)} /></div>
            <b>{a.etiket.slice(0, 3)}</b>
            <span>{money(a.tutar)}</span>
            <small>{a.adet} taksit</small>
          </div>)}
        </div>
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <caption>
              Takvim yalnızca <b>ödeme planı olan</b> sözleşmelerin taksitlerini sayar; planı olmayan
              {" "}{money(m.plansizKalan)} alacak buraya girmez. Bu bir takvimdir, tahmin değil.
            </caption>
            <thead><tr><th>Dönem</th><th className="rpt-money">Beklenen</th><th className="rpt-money">Taksit</th><th>Pay</th></tr></thead>
            <tbody>
              {/* Vadesi geçmiş ve vadesiz satırlar kendi tonlarıyla:
                  geleceğe karıştırılmıyor. */}
              {m.takvim.filter((a) => a.tutar > 0).map((a) => <tr key={a.ay} data-tone={a.tur === "gecmis" ? "danger" : a.tur === "vadesiz" ? "warning" : undefined}>
                <th scope="row"><b>{a.etiket}</b>{a.tur !== "ay" ? <small>{a.tur === "gecmis" ? "Vadesi dolmuş, henüz tahsil edilmedi" : "Taksitin vadesi girilmemiş"}</small> : null}</th>
                <td className="rpt-money">{money(a.tutar)}</td>
                <td className="rpt-money">{a.adet}</td>
                <td className="rapor-pay">
                  <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, m.planliKalan ? (a.tutar / m.planliKalan) * 100 : 0)}%`)} /></div>
                  <span>{percent(m.planliKalan ? (a.tutar / m.planliKalan) * 100 : 0)}</span>
                </td>
              </tr>)}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row"><b>Planlı kalan toplam</b></th>
                <td className="rpt-money">{money(m.planliKalan)}</td>
                <td className="rpt-money" />
                <td>{ufkunOtesi ? <small>{money(ufkunOtesi)} vadesi 12 aydan uzak</small> : null}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </> : <p className="rpt-empty-note">Ödeme planına bağlı kalan taksit yok; açık alacağın tamamı ({money(m.acikBakiye)}) plansız.</p>}
    </section>

    <div className="rapor-ikili">
      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Gerçekleşen tahsilat</h3><span>Son altı ayda kasaya giren</span></div>
        {m.aylikTahsilat.some((a) => a.tutar > 0) ? (
          <div className="rapor-aylik" role="img" aria-label={`Gerçekleşen tahsilat: ${m.aylikTahsilat.map((a) => `${a.etiket} ${money(a.tutar)}`).join("; ")}`}>
            {m.aylikTahsilat.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylikTahsilat.length - 1 ? " is-current" : ""}`}>
              <div className="rapor-aylik-cubuk"><i style={cssVar("--h", `${Math.max(3, (a.tutar / enYuksekTahsilat) * 100)}%`)} /></div>
              <b>{a.etiket.slice(0, 3)}</b>
              <span>{money(a.tutar)}</span>
            </div>)}
          </div>
        ) : <p className="rpt-empty-note">Son altı ayda tahsilat kaydı yok.</p>}
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas">
          <h3>Dönemin dengesi</h3>
          <span>Giren para ile beklenen arasındaki ilişki</span>
        </div>
        <ul className="rpt-insights">
          <li data-tone={m.gecikmisKalan ? "warning" : "success"}>
            <span className="rpt-insight-icon"><Icon name="alert" size={17} /></span>
            <div><b>Gecikmiş alacak</b><p>{m.gecikmisAdet
              ? `${m.gecikmisAdet} taksitte ${money(m.gecikmisKalan)} vadesi geçmiş durumda.`
              : "Vadesi geçmiş taksit bulunmuyor."}</p></div>
          </li>
          <li data-tone="gold">
            <span className="rpt-insight-icon"><Icon name="flow" size={17} /></span>
            <div><b>Önümüzdeki ay</b><p>{m.onumuzdekiAy && m.onumuzdekiAy.tutar
              ? `${m.onumuzdekiAy.etiket} ayında ${m.onumuzdekiAy.adet} taksitten ${money(m.onumuzdekiAy.tutar)} bekleniyor.`
              : "Önümüzdeki ay vadesi gelen taksit yok."}</p></div>
          </li>
          <li data-tone={m.plansizKalan ? "warning" : "info"}>
            <span className="rpt-insight-icon"><Icon name="doc" size={17} /></span>
            <div><b>Takvimin kapsamı</b><p>{m.plansizKalan
              ? `${money(m.plansizKalan)} alacağın ödeme planı yok; takvime girmiyor. Plan açıldıkça takvim dolar.`
              : "Açık alacağın tamamı bir ödeme planına bağlı."}</p></div>
          </li>
          {vadesizSatiri ? (
            <li data-tone="warning">
              <span className="rpt-insight-icon"><Icon name="alert" size={17} /></span>
              <div><b>Vadesi girilmemiş taksit</b><p>{`${vadesizSatiri.adet} taksitte ${money(vadesizSatiri.tutar)} var ama vade tarihi boş; hangi aya düşeceği bilinmiyor.`}</p></div>
            </li>
          ) : null}
        </ul>
      </section>
    </div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Müşteri alacakları</h3>
        <span>En çok geciken üstte · ilk 20 müşteri</span>
      </div>
      {m.musteriler.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead><tr><th>Müşteri</th><th className="rpt-money">Açık bakiye</th><th className="rpt-money">Vadesi geçmiş</th><th className="rpt-money">Yaklaşan ({YAKLASAN_GUN} gün)</th></tr></thead>
            <tbody>
              {m.musteriler.map((musteri) => <tr key={musteri.id} data-tone={musteri.gecikmis ? "danger" : undefined}>
                <th scope="row">
                  {/* Rapordan cari hesabına geçiş: hangi müşteri
                      olduğunu ayrıca aramak zorunda kalmak raporu
                      yarım bırakmaktı. */}
                  <Link href={`/panel/finance/musteri/${musteri.id}`} className="rapor-kayit-link"><b>{musteri.ad}</b></Link>
                  {musteri.enEskiVade ? <small>En eski geçmiş vade {gunYazisi(musteri.enEskiVade)}</small> : null}
                </th>
                <td className="rpt-money">{money(musteri.bakiye)}</td>
                <td className="rpt-money">{musteri.gecikmis ? money(musteri.gecikmis) : "—"}</td>
                <td className="rpt-money">{musteri.yaklasan ? money(musteri.yaklasan) : "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Açık alacağı olan müşteri yok.</p>}
    </section>
  </>;
}
