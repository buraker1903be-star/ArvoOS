import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";
import { tumSatirlar } from "@/lib/rapor-okuma";
import {
  personelModeli,
  type PersonelIsi, type PersonelKaydi, type PersonelModeli, type PersonelPrimi,
  type PersonelSozlesmesi, type PersonelTalebi,
} from "@/lib/rapor-personel";
import { Icon, WidgetCard, cssVar, money, percent, type Widget } from "./rapor-parcalari";
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

  const [personel, departmanlar, talepler, sozlesmeler, isler, satisPrimleri, operasyonPrimleri] = await Promise.all([
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
  ]);

  return personelModeli({
    donem, bugun, personel, talepler, sozlesmeler, isler, satisPrimleri, operasyonPrimleri,
    departmanAdi: new Map(departmanlar.map((d) => [d.id, d.name])),
  });
}

export async function PersonelRaporu({ supabase, organizationId, donem }: RaporGirdisi) {
  const m = await personelVerisi({ supabase, organizationId, donem });
  const enYuksekTutar = Math.max(1, ...m.satis.map((s) => s.sozlesmeTutari));
  const enYuksekIs = Math.max(1, ...m.operasyon.map((o) => o.aktifIs));
  const enYuksekAy = Math.max(1, ...m.aylik.map((a) => Math.max(a.kazanilan, a.tamamlanan)));
  const toplamSatis = m.satis.reduce((t, s) => t + s.sozlesmeTutari, 0);

  const kutular: Widget[] = [
    {
      label: "Aktif personel", value: String(m.aktifPersonel),
      note: m.atamasizPersonel ? `${m.atamasizPersonel} kişiye kayıt atanmamış` : "Hepsine kayıt atanmış",
      icon: "users", tone: "brand",
      grafik: { tur: "yigin", bicim: "sayi", parcalar: [
        { ad: "Satış", deger: m.satis.length, ton: "success" },
        { ad: "Operasyon", deger: m.operasyon.length, ton: "info" },
        { ad: "Atamasız", deger: m.atamasizPersonel, ton: "warning" },
      ] },
    },
    {
      label: "Satış yapan personel", value: String(m.satis.length),
      note: toplamSatis ? `${money(toplamSatis)} imzalı sözleşme` : "Dönemde imzalı sözleşme yok",
      icon: "seal", tone: "success",
      grafik: { tur: "cubuk", seri: m.satis.slice(0, 6).map((s) => ({ ad: s.ad, deger: s.sozlesmeTutari, etiket: money(s.sozlesmeTutari) })) },
    },
    {
      label: "Operasyon personeli", value: String(m.operasyon.length),
      note: `${m.operasyon.reduce((t, o) => t + o.aktifIs, 0)} devam eden iş yürütüyor`,
      icon: "briefcase", tone: "info",
      grafik: { tur: "cubuk", seri: m.operasyon.slice(0, 6).map((o) => ({ ad: o.ad, deger: o.aktifIs, etiket: String(o.aktifIs) })) },
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
      label: "Hedef gerçekleşmesi", value: "—",
      note: "Hedef tablosu tanımlı değil",
      icon: "alert", tone: "info",
      grafik: { tur: "durum", noktalar: [{ ad: "Veri yok", ton: "info" }] },
    },
  ];

  return <>
    <p className="rapor-tanim">
      <Icon name="alert" size={15} />
      <span>
        Satış ve operasyon <b>ayrı tablolar</b>: kişi yalnızca kendisine atanan kayıtlarla görünür,
        iki taraf tek bir puanda toplanmaz. Sözleşme, personele <b>talep üzerinden</b> bağlanır —
        sözleşmede personel alanı yok ve onu yazan kişi satışı yapan kişi olmak zorunda değil.
        <b> Hedef verisi yok</b>: panelde hedef tablosu tanımlı değil, bu yüzden hedef bölümü boş.
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
            <thead><tr><th>Personel</th><th className="rpt-money">Talep</th><th className="rpt-money">Kazanılan</th><th>Dönüşüm</th><th className="rpt-money">Sözleşme</th><th className="rpt-money">Prim</th></tr></thead>
            <tbody>
              {m.satis.map((s) => <tr key={s.id}>
                <th scope="row"><b>{s.ad}</b><small>{s.unvan} · {s.departman}</small></th>
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
                <th scope="row"><b>{o.ad}</b><small>{o.unvan} · {o.departman}</small></th>
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
      </section>

      <section className="rapor-blok">
        <div className="rapor-blok-bas"><h3>Hedef gerçekleşmesi</h3><span>Hedef tablosu tanımlı değil</span></div>
        {/*
          BOŞ DURUM, UYDURMA HEDEF DEĞİL. Ortalamayı hedef yerine
          koymak, kimsenin koymadığı bir hedefe göre "hedefin %60'ı"
          yazmak olurdu — yöneticiye var olmayan bir karar zemini.
        */}
        <div className="rpt-empty" data-tone="info">
          <span className="rpt-insight-icon"><Icon name="alert" size={20} /></span>
          <b>Hedef verisi bulunmuyor</b>
          <p>
            Panelde kişi ya da dönem bazlı hedef tanımlanacak bir alan yok, bu yüzden
            “hedefin yüzde kaçı” hesaplanamıyor. Buraya ortalamayı hedef gibi yazmak
            yanıltıcı olurdu. Hedef takibi istenirse kişi ve döneme bağlı bir hedef
            kaydı eklenmesi gerekiyor; rapor o veriyi gördüğü anda bu bölümü doldurur.
          </p>
        </div>
      </section>
    </div>
  </>;
}
