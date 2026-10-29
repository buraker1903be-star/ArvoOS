import Link from "next/link";
import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { donemAylari, gerceklesme, type HedefKaydi } from "@/lib/personel-hedefi";
import {
  personelModeli,
  type PersonelIsi, type PersonelKaydi, type PersonelModeli, type PersonelPrimi,
  type PersonelSozlesmesi, type PersonelTalebi,
} from "@/lib/rapor-personel";
import { cssVar, Icon, money, percent, TutarlilikUyarisi, WidgetCard, type Widget } from "./rapor-parcalari";
import { personelTutarliligi } from "@/lib/rapor-tutarlilik";
import type { RaporGirdisi } from "./rapor-girdisi";

/*
  PERSONEL PERFORMANSI (RPR-05) — sorgular.

  Karar `lib/rapor-personel.ts`'te ve testli.

  HEDEF TABLOSU YOK: "hedef gerçekleşmesi" bölümü boş durum
  mesajıyla gösteriliyor, uydurma hedef üretilmiyor
  (docs/RAPORLAMA-ASAMA-1.md §2.1).

  SATIŞ VE OPERASYON AYRI TABLOLAR: kişi yalnızca KENDİSİNE ATANAN
  kayıtlarla görünüyor, iki taraf tek bir "performans puanı"nda
  toplanmıyor. Şartnamenin kuralı da operasyon personelini satış
  rakamıyla değerlendirmemek.
*/
export async function personelVerisi({ supabase, organizationId, donem }: RaporGirdisi): Promise<PersonelModeli> {
  const bugun = todayInIstanbul();
  const [sonYil, sonAy] = donem.endKey.split("-").map(Number);
  const seriBasi = monthStartKey(sonYil, sonAy - 5);
  const pencereGunu = donem.startKey < seriBasi ? donem.startKey : seriBasi;
  const pencereBasi = istanbulMidnight(pencereGunu).toISOString();

  /*
    HEDEFLER YALNIZCA DÖNEMİN AYLARI İÇİN okunuyor. Tablo kişi × ay
    büyüyor; tamamını çekip bellekte süzmek PostgREST'in satır
    tavanına çarptığı gün hedefleri SESSİZCE eksiltirdi
    (AGENTS.md "Süzme, sayma ve sayfalama SUNUCUDA").

    Dönem tam aylara oturmuyorsa hiç okunmuyor: model zaten hedef
    hesaplamayacak, sorgu boşuna işlerdi.
  */
  const hedefKapsami = donemAylari(donem, bugun);

  const [personel, departmanlar, talepler, sozlesmeler, isler, satisPrimleri, operasyonPrimleri, hedefler] = await Promise.all([
    /* Kadro TÜM personel: "ataması olmayan aktif personel" sayısı
       ancak tam kadroyla bilinir. Tablo kurum ölçeğinde küçük. */
    tumSatirlar<PersonelKaydi>("personel", (bas, son) =>
      supabase.from("hr_employees")
        .select("id,full_name,job_title,department_id,employment_status")
        .eq("organization_id", organizationId)
        .order("id")
        .range(bas, son)),
    tumSatirlar<{ id: string; name: string }>("departmanlar", (bas, son) =>
      supabase.from("hr_departments")
        .select("id,name")
        .eq("organization_id", organizationId)
        .order("id")
        .range(bas, son)),
    tumSatirlar<PersonelTalebi>("talepler", (bas, son) =>
      supabase.from("crm_opportunities")
        .select("id,assigned_employee_id,stage,created_at,updated_at")
        .eq("organization_id", organizationId)
        /* Açılış ya da son hareket pencerede: kazanım kararı
           `updated_at`'te ve talep eski olabilir. */
        .or(`created_at.gte.${pencereBasi},updated_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<PersonelSozlesmesi>("sözleşmeler", (bas, son) =>
      supabase.from("crm_contracts")
        .select("opportunity_id,amount,status,signed_at,created_at")
        .eq("organization_id", organizationId)
        .in("status", ["signed", "completed"])
        .or(`signed_at.gte.${pencereBasi},created_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    /* İşler: açık olanlar dönemden bağımsız gerekiyor ("devam eden",
       "termini geçmiş"), o yüzden durum süzgeci yok ve pencere
       `or` ile geniş. */
    tumSatirlar<PersonelIsi>("işler", (bas, son) =>
      supabase.from("operation_workflows")
        .select("assigned_employee_id,status,due_date,delivered_at,start_date,created_at,updated_at")
        .eq("organization_id", organizationId)
        .or(`created_at.gte.${pencereBasi},updated_at.gte.${pencereBasi},status.in.(planned,in_progress,blocked)`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<PersonelPrimi>("satış primleri", (bas, son) =>
      supabase.from("hr_sales_commissions")
        .select("employee_id,commission_amount,status,accrued_at,paid_at")
        .eq("organization_id", organizationId)
        .or(`accrued_at.gte.${pencereBasi},paid_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    tumSatirlar<PersonelPrimi>("operasyon primleri", (bas, son) =>
      supabase.from("hr_operation_commissions")
        .select("employee_id,commission_amount,status,accrued_at,paid_at")
        .eq("organization_id", organizationId)
        .or(`accrued_at.gte.${pencereBasi},paid_at.gte.${pencereBasi}`)
        .order("id")
        .range(bas, son)),
    hedefKapsami
      ? tumSatirlar<HedefKaydi>("hedefler", (bas, son) =>
          supabase.from("hr_personel_hedefleri")
            .select("employee_id,donem,tutar")
            .eq("organization_id", organizationId)
            .gte("donem", hedefKapsami.aylar[0])
            .lte("donem", hedefKapsami.aylar[hedefKapsami.aylar.length - 1])
            .order("id")
            .range(bas, son))
      : Promise.resolve([] as HedefKaydi[]),
  ]);

  return personelModeli({
    donem, bugun, personel, talepler, sozlesmeler, isler, satisPrimleri, operasyonPrimleri, hedefler,
    departmanAdi: new Map(departmanlar.map((d) => [d.id, d.name])),
  });
}

export async function PersonelRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await personelVerisi({ supabase, organizationId, donem });
  /* Raporun kendi toplamları birbirini tutuyor mu (lib/rapor-tutarlilik).
     Normal şartlarda boş; dolduğu gün ekran bunu söylüyor. */
  const bulgular = personelTutarliligi(m);
  const enYuksekTutar = Math.max(1, ...m.satis.map((s) => s.sozlesmeTutari));
  const enYuksekIs = Math.max(1, ...m.operasyon.map((o) => o.aktifIs));
  const enYuksekAy = Math.max(1, ...m.aylik.map((a) => Math.max(a.kazanilan, a.tamamlanan)));
  const toplamSatis = m.satis.reduce((t, s) => t + s.sozlesmeTutari, 0);
  /* Kurumun toplam gerçekleşmesi: payda yalnızca hedefi OLANLARIN
     hedefi, pay da yalnızca onların satışı (lib/rapor-personel). */
  const hedefOrani = gerceklesme(m.hedefGerceklesenToplam, m.hedefToplam);
  /* Hedef bölümünde yalnızca hedefi OLANLAR; hedefsiz kişiyi boş
     çubukla listelemek "hedefini tutturamadı" gibi okunurdu. */
  const hedefliler = m.satis.filter((s) => s.hedef !== null)
    .sort((a, b) => (b.hedefGerceklesme ?? 0) - (a.hedefGerceklesme ?? 0));

  /*
    DİLİMLER AYRIK OLMAK ZORUNDA. Yığın "Satış / Operasyon /
    Atamasız" diye çiziliyordu ve iki işi de yapan kişi İKİ dilimde
    birden sayılıyordu: dilimlerin toplamı kutudaki "aktif personel"
    sayısını aşabiliyor, oranlar yanlış çıkıyordu. Kesişim kendi
    dilimine alındı.
  */
  const satisKimlikleri = new Set(m.satis.map((s) => s.id));
  const ikisiDe = m.operasyon.filter((o) => satisKimlikleri.has(o.id)).length;

  const kutular: Widget[] = [
    {
      label: "Aktif personel", value: String(m.aktifPersonel),
      note: m.atamasizPersonel ? `${m.atamasizPersonel} kişiye kayıt atanmamış` : "Hepsine kayıt atanmış",
      icon: "users", tone: "brand",
      grafik: { tur: "yigin", bicim: "sayi", parcalar: [
        { ad: "Yalnızca satış", deger: m.satis.length - ikisiDe, ton: "success" },
        { ad: "Yalnızca operasyon", deger: m.operasyon.length - ikisiDe, ton: "info" },
        { ad: "İkisi de", deger: ikisiDe, ton: "gold" },
        { ad: "Atamasız", deger: m.atamasizPersonel, ton: "warning" },
      ] },
    },
    {
      label: "Satış yapan personel", value: String(m.satis.length),
      note: toplamSatis ? `${money(toplamSatis)} imzalı sözleşme` : "Dönemde imzalı sözleşme yok",
      icon: "seal", tone: "success",
      grafik: { tur: "cubuk", bicim: "para", seri: m.satis.slice(0, 6).map((s) => ({ ad: s.ad, deger: s.sozlesmeTutari, etiket: money(s.sozlesmeTutari) })) },
    },
    {
      label: "Operasyon personeli", value: String(m.operasyon.length),
      note: `${m.operasyon.reduce((t, o) => t + o.aktifIs, 0)} devam eden iş yürütüyor`,
      icon: "briefcase", tone: "info",
      grafik: { tur: "cubuk", bicim: "sayi", seri: m.operasyon.slice(0, 6).map((o) => ({ ad: o.ad, deger: o.aktifIs, etiket: String(o.aktifIs) })) },
    },
    {
      label: "Tahakkuk eden prim", value: money(m.primTahakkuk),
      note: `${money(m.primOdenen)} dönemde ödendi`,
      icon: "wallet", tone: "gold",
      grafik: { tur: "yigin", bicim: "para", parcalar: [
        { ad: "Ödenen", deger: m.primOdenen, ton: "success" },
        { ad: "Bekleyen", deger: Math.max(0, m.primTahakkuk - m.primOdenen), ton: "warning" },
      ] },
    },
    {
      label: "Hedef gerçekleşmesi",
      value: hedefOrani === null ? "—" : percent(hedefOrani),
      note: !m.hedefDonemUygun
        ? "Dönem tam aylara oturmuyor"
        : !m.hedefVerisiVar
          ? "Bu döneme hedef konmamış"
          : `${money(m.hedefGerceklesenToplam)} / ${money(m.hedefToplam)}${m.hedefSurenAy ? " · ay sürüyor" : ""}`,
      icon: hedefOrani === null ? "alert" : "seal",
      tone: hedefOrani === null ? "info" : hedefOrani >= 100 ? "success" : hedefOrani >= 70 ? "gold" : "warning",
      grafik: hedefOrani === null
        ? { tur: "durum", noktalar: [{ ad: "Veri yok", ton: "info" }] }
        : { tur: "gosterge", oran: Math.min(100, hedefOrani) },
    },
  ];

  return <>
    <TutarlilikUyarisi bulgular={bulgular} />

    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Satış ve operasyon <b>ayrı tablolar</b>: kişi yalnızca kendisine atanan kayıtlarla görünür,
        iki taraf tek bir puanda toplanmaz. Sözleşme, personele <b>talep üzerinden</b> bağlanır —
        sözleşmede personel alanı yok ve onu yazan kişi satışı yapan kişi olmak zorunda değil.
        <b> Hedef</b> aylık konur (İK → Hedefler): dönem tam aylara oturmuyorsa hesaplanmaz,
        hedefi konmamış kişinin hücresi boş kalır — sıfır değil.
      </span>
    </p>

    <div className="rpt-widgets">{kutular.map((k) => <WidgetCard key={k.label} widget={k} />)}</div>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Satış performansı</h3>
        <span>Üzerine talep atanmış personel · sözleşme tutarına göre</span>
      </div>
      {m.satis.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <caption>
              Dönüşüm, kişiye bu dönemde atanan talepten kazanıma geçiştir. Sözleşme tutarı,
              talebi o kişiye atanmış ve bu dönemde imzalanmış sözleşmelerin toplamıdır.
            </caption>
            {/* Hedef sütunu yalnızca hesaplanabilen dönemde: boş bir
                sütun, hedefin konmadığını değil tutturulmadığını
                düşündürürdü. Excel çıktısı da aynı koşula bakıyor
                (lib/rapor-personel, personelSayfalari). */}
            <thead><tr><th>Personel</th><th className="rpt-money">Talep</th><th className="rpt-money">Kazanılan</th><th>Dönüşüm</th><th className="rpt-money">Sözleşme</th>{m.hedefDonemUygun ? <th className="rpt-money">Hedef</th> : null}<th className="rpt-money">Prim</th></tr></thead>
            <tbody>
              {m.satis.map((s) => <tr key={s.id}>
                <th scope="row">
                  {/* Rapordan personel kaydına geçiş: satır zaten bir
                      kişi, "hangi personeldi" diye ayrıca aramak
                      zorunda kalmak raporu yarım bırakıyordu. */}
                  <Link href={`/panel/hr/${s.id}`} className="rapor-kayit-link"><b>{s.ad}</b></Link>
                  <small>{s.unvan} · {s.departman}</small>
                </th>
                <td className="rpt-money">{s.talep}</td>
                <td className="rpt-money">{s.kazanilan}</td>
                <td className="rapor-pay">
                  <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, s.donusum ?? 0)}%`)} /></div>
                  <span>{s.donusum === null ? "—" : percent(s.donusum)}</span>
                </td>
                <td className="rpt-money">
                  <div className="rapor-bekleme">
                    <span>{money(s.sozlesmeTutari)}</span>
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(2, (s.sozlesmeTutari / enYuksekTutar) * 100)}%`)} /></div>
                  </div>
                  {s.sozlesmeAdet ? <small className="rapor-alt-not">{s.sozlesmeAdet} sözleşme</small> : null}
                </td>
                {m.hedefDonemUygun ? (
                  <td className="rpt-money">
                    {s.hedef === null ? <span className="rapor-alt-not">Hedef konmamış</span> : <>
                      {money(s.hedef)}
                      <small className="rapor-alt-not">{s.hedefGerceklesme === null ? "—" : percent(s.hedefGerceklesme)}</small>
                    </>}
                  </td>
                ) : null}
                <td className="rpt-money">
                  {money(s.primTahakkuk)}
                  {s.primOdenen ? <small className="rapor-alt-not">{money(s.primOdenen)} ödendi</small> : null}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Bu dönemde üzerine talep atanmış personel yok.</p>}
    </section>

    <section className="rapor-blok">
      <div className="rapor-blok-bas">
        <h3>Operasyon performansı</h3>
        <span>Üzerine iş atanmış personel · tamamlanan işe göre</span>
      </div>
      {m.operasyon.length ? (
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <caption>
              Devam eden ve termini geçmiş iş sayıları şu anki durumu gösterir, dönemden bağımsızdır.
              İş, asıl sorumlusuna sayılır; ek sorumluya da saymak toplamı şişirirdi.
            </caption>
            <thead><tr><th>Personel</th><th className="rpt-money">Devam eden</th><th className="rpt-money">Tamamlanan</th><th className="rpt-money">Termini geçmiş</th><th className="rpt-money">Ortalama süre</th><th className="rpt-money">Prim</th></tr></thead>
            <tbody>
              {m.operasyon.map((o) => <tr key={o.id} data-tone={o.geciken ? "danger" : undefined}>
                <th scope="row">
                  <Link href={`/panel/hr/${o.id}`} className="rapor-kayit-link"><b>{o.ad}</b></Link>
                  <small>{o.unvan} · {o.departman}</small>
                </th>
                <td className="rpt-money">
                  <div className="rapor-bekleme">
                    <span>{o.aktifIs}</span>
                    <div className="rapor-pay-cubuk"><i style={cssVar("--w", `${Math.max(4, (o.aktifIs / enYuksekIs) * 100)}%`)} /></div>
                  </div>
                </td>
                <td className="rpt-money">{o.tamamlanan || "—"}</td>
                <td className="rpt-money">{o.geciken || "—"}</td>
                <td className="rpt-money">{o.ortSureGun === null ? "—" : `${o.ortSureGun} gün`}</td>
                <td className="rpt-money">
                  {money(o.primTahakkuk)}
                  {o.primOdenen ? <small className="rapor-alt-not">{money(o.primOdenen)} ödendi</small> : null}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      ) : <p className="rpt-empty-note">Bu dönemde üzerine iş atanmış personel yok.</p>}
    </section>

    <div className="rapor-ikili">
      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Aylara göre üretim</h3><span>Kazanılan talep ve tamamlanan iş</span></div>
        {m.aylik.some((a) => a.kazanilan || a.tamamlanan) ? <>
          <div className="rapor-aylik" role="img" aria-label={`Aylık: ${m.aylik.map((a) => `${a.etiket} ${a.kazanilan} kazanım, ${a.tamamlanan} tamamlanan iş`).join("; ")}`}>
            {m.aylik.map((a, i) => <div key={a.ay} className={`rapor-aylik-sutun${i === m.aylik.length - 1 ? " is-current" : ""}`}>
              <div className="rapor-aylik-cubuk is-ikili">
                <i className="is-gelir" style={cssVar("--h", `${Math.max(3, (a.kazanilan / enYuksekAy) * 100)}%`)} title={`${a.kazanilan} kazanım`} />
                <i className="is-cikis" style={cssVar("--h", `${Math.max(3, (a.tamamlanan / enYuksekAy) * 100)}%`)} title={`${a.tamamlanan} tamamlanan`} />
              </div>
              <b>{a.etiket}</b>
              <span>{a.kazanilan} · {a.tamamlanan}</span>
            </div>)}
          </div>
          <div className="rpt-legend"><span><i className="is-lead" />Kazanım</span><span><i className="is-sale" />Tamamlanan iş</span></div>
        </> : <p className="rpt-empty-note">Son altı ayda kazanım ya da tamamlanan iş yok.</p>}
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas">
          <h3>Hedef gerçekleşmesi</h3>
          <span>{m.hedefDonemUygun && m.hedefVerisiVar ? `${m.hedefAyEtiketi} · aylık satış hedefi` : "Aylık satış hedefi"}</span>
        </div>
        {/*
          ÜÇ HÂL AYRI YAZILIYOR. "Dönem oturmuyor", "hedef konmamış"
          ve "hedef var" aynı boş kutuyla gösterilseydi yönetici
          hedefi koyduğu hâlde raporu boş görür ve nedenini
          bilemezdi. İlk ikisi ÇIKMAZ DEĞİL: ikisinde de ne
          yapılacağı yazıyor.
        */}
        {!m.hedefDonemUygun ? (
          <div className="rpt-empty" data-tone="info">
            <span className="rpt-insight-icon"><Icon name="alert" size={20} /></span>
            <b>Dönem tam aylara oturmuyor</b>
            <p>
              Hedef aylık konuyor; seçtiğiniz aralık bir ayın ortasında başlıyor ya da bitiyor.
              Aylık hedefi güne bölüp oran yazmak, kimsenin koymadığı bir günlük hedefe
              dayanırdı. “Bu ay”, “Geçen ay” ya da “Bu yıl” aralıklarında hedef gerçekleşmesi
              görünür.
            </p>
          </div>
        ) : !m.hedefVerisiVar ? (
          <div className="rpt-empty" data-tone="info">
            <span className="rpt-insight-icon"><Icon name="alert" size={20} /></span>
            <b>Bu döneme hedef konmamış</b>
            <p>
              Hedef kişi ve ay bazında giriliyor. {m.hedefAyEtiketi} için hedef girildiğinde bu bölüm
              kendiliğinden dolar; girilmediği sürece buraya ortalama ya da tahmin yazılmıyor.
            </p>
            <Link href="/panel/hr/hedefler" className="rapor-kayit-link"><b>Hedef gir</b></Link>
          </div>
        ) : (
          <>
            <ul className="rpt-hedef">
              {hedefliler.map((s) => (
                <li key={s.id}>
                  <div className="rpt-hedef-top">
                    <Link href={`/panel/hr/${s.id}`} className="rapor-kayit-link"><b>{s.ad}</b></Link>
                    <span>{s.hedefGerceklesme === null ? "—" : percent(s.hedefGerceklesme)}</span>
                  </div>
                  {/* Çubuk %100'de duruyor ama yazı gerçeği söylüyor:
                      hedefi iki katı aşan satırı ekranın dışına taşan
                      bir çubukla çizmek listeyi okunmaz yapardı. */}
                  <div className="rpt-hedef-track" data-tuttu={(s.hedefGerceklesme ?? 0) >= 100 ? "evet" : undefined}>
                    <i style={cssVar("--w", `${Math.max(2, Math.min(100, s.hedefGerceklesme ?? 0))}%`)} />
                  </div>
                  <div className="rpt-hedef-alt">{money(s.sozlesmeTutari)} / {money(s.hedef ?? 0)}</div>
                </li>
              ))}
            </ul>
            {m.hedefSurenAy ? (
              <p className="rpt-empty-note">
                Ölçülen ay henüz dolmadı; gerçekleşme ay sonuna kadar yükselmeye devam eder.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  </>;
}
