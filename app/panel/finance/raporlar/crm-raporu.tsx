import Link from "next/link";
import { istanbulMidnight, monthStartKey } from "@/lib/istanbul-date";
import { gunYazisi } from "@/lib/rapor-donemi";
import { kimliklerle, tumSatirlar } from "@/lib/rapor-okuma";
import { crmModeli, type CrmModeli, type CrmSozlesmesi, type CrmTalebi } from "@/lib/rapor-crm";
import { Icon, WidgetCard, cssVar, money, percent, type Widget } from "./rapor-parcalari";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  CRM VE MÜŞTERİ ANALİTİĞİ (RPR-02) — sorgular.

  Karar `lib/rapor-crm.ts`'te ve testli.

  İMZALI SÖZLEŞMELER TÜM ZAMANLAR OKUNUYOR ve bu bilerek: "tekrar
  eden müşteri" ancak ömür boyu bakılarak bilinir. Pencereyle
  daraltmak, iki yıllık bir müşteriyi "yeni müşteri" göstermek
  olurdu. AGENTS.md'nin izin verdiği sınırsız okumalardan biri
  ("Her sınırsız okuma hata değil") — gerekçesi burada yazılı.
  Okuma yine sayfalanıyor.
*/
export async function crmVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<CrmModeli> {
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const seriBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < seriBasi ? donem.startKey : seriBasi;
  const pencereBasi = istanbulMidnight(pencereGunu).toISOString();

  const [talepler, sozlesmeler] = await Promise.all([
    tumSatirlar<CrmTalebi>("talepler", (bas, son) =>
      supabase.from("crm_opportunities")
        .select("id,stage,source,lost_reason,estimated_value,created_at,updated_at")
        .eq("organization_id", organizationId)
        /* Açılış ya da son hareket pencerede: kayıp kararı
           `updated_at`'te ve talep eski olabilir. */
        .or(`created_at.gte.${pencereBasi},updated_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<CrmSozlesmesi>("imzalı sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select("id,opportunity_id,party_id,amount,status,signed_at,created_at")
        .eq("organization_id", organizationId)
        .in("status", ["signed", "completed"])
        .order("id")
        .range(bas, son)),
  ]);

  const [cariler, musteriler] = await Promise.all([
    kimliklerle<{ id: string; name: string }>(
      "cari hesaplar",
      sozlesmeler.map((c) => c.party_id).filter((id): id is string => Boolean(id)),
      (parca) => supabase.from("account_parties")
        .select("id,name").eq("organization_id", organizationId).in("id", parca),
    ),
    /* Cari kaydı OLMAYAN sözleşmenin müşteri adı talepten geliyor;
       serbest metin ve bu bir taviz — sayısı raporda yazıyor. */
    kimliklerle<{ id: string; customer_name: string }>(
      "talep müşterileri",
      sozlesmeler.filter((c) => !c.party_id).map((c) => c.opportunity_id).filter((id): id is string => Boolean(id)),
      (parca) => supabase.from("crm_opportunities")
        .select("id,customer_name").eq("organization_id", organizationId).in("id", parca),
    ),
  ]);

  return crmModeli({
    donem,
    talepler,
    sozlesmeler,
    musteriAdi: new Map(musteriler.map((o) => [o.id, o.customer_name])),
    cariAdi: new Map(cariler.map((c) => [c.id, c.name])),
  });
}

export async function CrmRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await crmVerisi({ supabase, organizationId, donem });
  const enYuksekAy = Math.max(1, ...m.aylik.map((a) => a.talep));
  const enYuksekSebep = Math.max(1, ...m.kayipSebepleri.map((s) => s.adet));

  /* Huni basamakları: her biri bir ÖNCEKİNE oranlanıyor; toplama
     oranlamak "lead'in %25'i kazanıldı" ile "nitelikliden teklife
     %60 geçildi" ayrımını siliyordu. */
  const huni = [
    { ad: "Yeni talep", deger: m.yeniTalep },
    { ad: "Temas kurulan", deger: m.temas },
    { ad: "Nitelikli aday", deger: m.nitelikli },
    { ad: "Teklife geçen", deger: m.teklifli },
    { ad: "Kazanılan", deger: m.kazanilan },
  ];
  const enYuksekHuni = Math.max(1, ...huni.map((h) => h.deger));

  const kutular: Widget[] = [
    {
      label: "Yeni talep", value: String(m.yeniTalep),
      note: `${money(m.yeniTalepDegeri)} tahmini değer · son 6 ay`,
      icon: "inbox", tone: "brand",
      grafik: { tur: "cubuk", seri: m.aylik.map((a) => ({ ad: a.etiket, eksen: a.etiket, deger: a.talep, etiket: String(a.talep) })) },
    },
    {
      label: "Kazanılan", value: String(m.kazanilan),
      note: m.donusum === null ? "Dönemde yeni talep yok" : `${percent(m.donusum)} talep → kazanım`,
      icon: "seal", tone: "success",
      grafik: { tur: "halka", oran: m.donusum, altyazi: "kazanım oranı" },
    },
    {
      label: "Kaybedilen", value: String(m.kayip),
      note: m.kayipSebepleri[0] ? `En sık: ${m.kayipSebepleri[0].ad}` : "Kaybedilen talep yok",
      icon: "alert", tone: m.kayip ? "danger" : "success", toned: true,
      grafik: { tur: "cubuk", seri: m.kayipSebepleri.slice(0, 6).map((s) => ({ ad: s.ad, deger: s.adet, etiket: String(s.adet) })) },
    },
    {
      label: "Tekrar eden müşteri", value: String(m.tekrarEden),
      note: m.tekrarOrani === null
        ? "Dönemde sözleşme imzalayan müşteri yok"
        : `${percent(m.tekrarOrani)} · ${m.yeniMusteri} ilk kez imzaladı`,
      icon: "users", tone: "gold", toned: true,
      grafik: { tur: "yigin", bicim: "sayi", parcalar: [
        { ad: "Tekrar", deger: m.tekrarEden, ton: "gold" },
        { ad: "Yeni", deger: m.yeniMusteri, ton: "brand" },
      ] },
    },
    {
      label: "Müşteri başına", value: money(m.musteriBasina),
      note: "Ömür boyu ortalama sözleşme tutarı",
      icon: "chart", tone: "info",
      grafik: { tur: "cubuk", seri: m.enDegerli.slice(0, 6).map((x) => ({ ad: x.ad, deger: x.tutar, etiket: money(x.tutar) })) },
    },
  ];

  return <>
    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Huni basamakları <b>aşama eşlemesinden</b> geliyor (<code>lib/talep-asamalari</code>),
        elle sayılan bir aşama listesinden değil: akademik kurumların ayrıntılı aşamaları da kapsanıyor.
        <b> Tekrar eden müşteri</b> ömür boyu bakılarak belirlenir — dönemde imzalayan müşterinin
        daha önce de sözleşmesi varsa tekrar eden.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <div className="rapor-ikili">
      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Talep hunisi</h3><span>Dönemde açılan taleplerin ilerlediği yer</span></div>
        {m.yeniTalep ? (
          <ol className="rpt-funnel">
            {huni.map((basamak, i) => {
              const onceki = i > 0 ? huni[i - 1].deger : null;
              const gecis = onceki ? (basamak.deger / onceki) * 100 : null;
              return <li key={basamak.ad}>
                <div className="rpt-funnel-row">
                  <div className="rpt-funnel-label"><b>{basamak.ad}</b></div>
                  <div className="rpt-funnel-track"><i style={cssVar("--w", `${Math.max(4, (basamak.deger / enYuksekHuni) * 100)}%`)} /></div>
                  <strong>{basamak.deger}</strong>
                </div>
                {gecis !== null ? <div className="rpt-funnel-step"><span aria-hidden="true">↓</span><b>{percent(gecis)}</b> bir sonraki basamağa geçti</div> : null}
              </li>;
            })}
          </ol>
        ) : <p className="rpt-empty-note">Bu dönemde yeni talep kaydı yok; huni ilk kayıtlarla oluşur.</p>}
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas">
          <h3>Talep kaynakları</h3>
          <span>{m.kaynakBelirtilmemis ? `${m.kaynakBelirtilmemis} talebin kaynağı girilmemiş` : "Kaynak başına dönüşüm"}</span>
        </div>
        {m.kaynaklar.length ? (
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <caption>
                Kaynak serbest metin; büyük/küçük harf ve boşluk farkları birleştirilir,
                ekranda ilk görülen yazım gösterilir.
              </caption>
              <thead><tr><th>Kaynak</th><th className="rpt-money">Talep</th><th className="rpt-money">Kazanılan</th><th>Dönüşüm</th></tr></thead>
              <tbody>
                {m.kaynaklar.map((k) => <tr key={k.ad}>
                  <th scope="row"><b>{k.ad}</b><small>{money(k.tahminiDeger)} tahmini değer</small></th>
                  <td className="rpt-money">{k.adet}</td>
                  <td className="rpt-money">{k.kazanilan}</td>
                  <td className="rapor-pay">
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, k.donusum)}%`)} /></div>
                    <span>{percent(k.donusum)}</span>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="rpt-empty-note">Bu dönemde yeni talep kaydı yok.</p>}
      </section>
    </div>

    <div className="rapor-ikili">
      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Neden kaybedildi?</h3><span>Kayıp kararı bu dönemde verilenler</span></div>
        {m.kayipSebepleri.length ? (
          <ul className="rpt-lost">
            {m.kayipSebepleri.map((s) => <li key={s.ad}>
              <div className="rpt-lost-top"><b>{s.ad}</b><span>{s.adet} talep</span></div>
              <div className="rpt-lost-track"><i style={cssVar("--w", `${(s.adet / enYuksekSebep) * 100}%`)} /></div>
            </li>)}
          </ul>
        ) : <div className="rpt-empty" data-tone="success">
          <span className="rpt-insight-icon"><Icon name="heart" size={20} /></span>
          <b>Kaybedilen talep yok</b>
          <p>Bu dönemde kaybedildi olarak işaretlenen talep bulunmuyor.</p>
        </div>}
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Aylara göre kazanım</h3><span>Gelen talep ve kazanılan</span></div>
        <div className="rapor-aylik" role="img" aria-label={`Aylık: ${m.aylik.map((a) => `${a.etiket} ${a.talep} talep, ${a.kazanilan} kazanım`).join("; ")}`}>
          {m.aylik.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylik.length - 1 ? " is-current" : ""}`}>
            <div className="rapor-aylik-cubuk is-ikili">
              <i className="is-gelir" style={cssVar("--h", `${Math.max(3, (a.talep / enYuksekAy) * 100)}%`)} title={`${a.talep} talep`} />
              <i className="is-cikis" style={cssVar("--h", `${Math.max(3, (a.kazanilan / enYuksekAy) * 100)}%`)} title={`${a.kazanilan} kazanım`} />
            </div>
            <b>{a.etiket}</b>
            <span>{a.talep} · {a.kazanilan}</span>
          </div>)}
        </div>
        <div className="rpt-legend"><span><i className="is-lead" />Talep</span><span><i className="is-sale" />Kazanım</span></div>
      </section>
    </div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>En değerli müşteriler</h3>
        <span>Ömür boyu sözleşme tutarına göre · ilk 20</span>
      </div>
      {m.enDegerli.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            {m.kimliksizSozlesme ? (
              <caption>
                {m.kimliksizSozlesme} imzalı sözleşmenin cari kaydı yok; o müşteriler
                ADINDAN gruplandı. Aynı müşteri farklı yazımlarla girildiyse iki satır
                görünebilir — cari kaydı açıldığında birleşir.
              </caption>
            ) : null}
            <thead><tr><th>Müşteri</th><th className="rpt-money">Sözleşme</th><th>İlk iş</th><th>Son iş</th><th className="rpt-money">Toplam</th></tr></thead>
            <tbody>
              {m.enDegerli.map((musteri) => <tr key={musteri.anahtar}>
                <th scope="row">
                  {musteri.cariId ? (
                    /* Cari kaydı varsa cari hesabına geçiş; yoksa
                       bağlantı YOK — tıklanıp boş sayfa açmak,
                       kaydın olmadığını hata gibi göstermek olurdu. */
                    <Link href={`/panel/finance/musteri/${musteri.cariId}`} className="rapor-kayit-link"><b>{musteri.ad}</b></Link>
                  ) : <b>{musteri.ad}</b>}
                  {musteri.sozlesmeAdet > 1 ? <small>Tekrar eden müşteri</small> : <small>{musteri.cariId ? "Cari hesabı var" : "Cari kaydı yok"}</small>}
                </th>
                <td className="rpt-money">{musteri.sozlesmeAdet}</td>
                <td>{gunYazisi(musteri.ilkIs)}</td>
                <td>{gunYazisi(musteri.sonIs)}</td>
                <td className="rpt-money">{money(musteri.tutar)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Henüz imzalanmış sözleşme yok.</p>}
    </section>
  </>;
}
