import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import {
  ATANMAMIS,
  asamaSuzgeci,
  cizelgeyiKur,
  esZamanliMi,
  isSuzgeci,
  kisilereGoreKur,
  KURUM_ICI,
  musteriAdlari,
  satirlariDiz,
  type CizelgeIsi,
  type Suzgec,
} from "@/lib/operasyon-cizelge";
import { hatirlatmaDurumu, isDurumAdi } from "@/lib/is-adimlari";
import { todayIstanbul } from "../ops-shared";
import "../../gantt.css";

/*
  ÇALIŞMA ÇİZELGESİ — aşama düzeyinde.

  Eskiden bu sayfa yalnızca İŞ düzeyinde çiziyordu: bir iş = bir çubuk,
  start_date → due_date. Operasyoncunun ihtiyacı bu değildi. Kendi
  cümleleriyle: "Emine Hanım'ın makalesi ve tezi eş zamanlı ilerlediği için,
  analizler geldiğinde her iki çalışmada da hangi aşamada olduğumuzu kolayca
  görebilmek için görevleri ve aşamaları gösteren tarihlerle destekli bir iş
  akış şeması."

  Bu yüzden iki şey değişti:
    1. Aşamalar (operation_steps) kendi satırlarında ve kendi tarihleriyle
       çiziliyor; aralık hesabı lib/operasyon-cizelge.ts'te.
    2. İşler MÜŞTERİYE göre gruplanıyor. Aynı kişinin eş zamanlı işleri yan
       yana durmazsa "her ikisinde de hangi aşamadayız" sorusu
       yanıtlanamıyor — isteğin çekirdeği buydu.

  Ay penceresi korundu: çizelge bir aya sığmazsa okunmuyor. Aya düşmeyen
  ama tarihli işler "bu ayda görünmüyor" listesinde kalıyor, tarihsizler
  ayrı listede — ikisi de planlama gündemidir, gizlenmemeli.
*/

type AdimSatiri = { id: string; title: string; sort_order: number; due_date: string | null; is_completed: boolean; assigned_employee_id: string | null };
type Kayit = CizelgeIsi & { operation_steps: AdimSatiri[] };

const pad = (value: number) => String(value).padStart(2, "0");

function parseMonthParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
const monthLabel = (date: Date) => date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
const ayAnahtari = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const gunAnahtari = (d: Date) => `${ayAnahtari(d)}-${pad(d.getDate())}`;
const kisaTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(new Date(`${gun}T12:00:00`));

export default async function OperationsGanttPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string; tamamlanan?: string; gorunum?: string; kisi?: string; musteri?: string; durum?: string }>;
}) {
  const params = await searchParams;
  /*
    İki eksen: müşteriye göre (eş zamanlı çalışmaları yan yana görmek) ve
    KİŞİYE göre ("bu hafta bende ne var"). Aynı veri, farklı gruplama;
    ikisini ayrı sayfa yapmak süzgeçleri de ikiye bölerdi.
  */
  const kisiGorunumu = params.gorunum === "kisi";
  // "kisi" boş dizge de geçerli bir değer: atanmamış aşamalar.
  const suzgec: Suzgec = {
    ...(params.kisi !== undefined ? { kisi: params.kisi } : {}),
    ...(params.musteri ? { musteri: params.musteri } : {}),
    ...(params.durum ? { durum: params.durum } : {}),
  };
  /*
    Tamamlanan aşamalar VARSAYILAN OLARAK gizli: sekiz aşamalı iki işi olan
    bir müşteri 19 satır üretiyor ve çizelge okunmuyor. Bitmiş aşama
    planlama kararına girmiyor — "şu an neredeyiz, sırada ne var" sorusunu
    yanıtlamıyor.

    Bilgi kaybolmuyor: iş satırında kaç aşamanın bittiği yazıyor ve
    "Tamamlananları göster" ile hepsi geri geliyor. Tümden gizlemek,
    geçmişi görmek isteyeni çizelgeden koparırdı.
  */
  const tamamlananlariGoster = params.tamamlanan === "1";
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const monthStart = parseMonthParam(params.ay);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), daysInMonth);
  const monthQuery = ayAnahtari(monthStart);
  const prevMonth = ayAnahtari(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const nextMonth = ayAnahtari(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));
  /*
    Adres üretimi tek yerde: ay gezinmesi, görünüm anahtarı ve süzgeçler
    birbirinin seçimini kaybetmemeli. Boş değer parametreyi düşürüyor
    ("?ay=2026-10&durum=" gibi bir adres kalmasın) — tek istisna "kisi",
    çünkü boş dizge orada "atanmamış" ANLAMINA geliyor.
  */
  const adres = (ek: Record<string, string>) => {
    const usp = new URLSearchParams({
      ay: ayAnahtari(monthStart),
      ...(tamamlananlariGoster ? { tamamlanan: "1" } : {}),
      ...(kisiGorunumu ? { gorunum: "kisi" } : {}),
      ...(params.kisi !== undefined ? { kisi: params.kisi } : {}),
      ...(params.musteri ? { musteri: params.musteri } : {}),
      ...(params.durum ? { durum: params.durum } : {}),
      ...ek,
    });
    for (const [ad, deger] of [...usp.entries()]) if (!deger && ad !== "kisi") usp.delete(ad);
    if (usp.get("kisi") === "__yok__") usp.delete("kisi");
    return `/panel/operations/gantt?${usp.toString()}`;
  };
  const monthStartKey = gunAnahtari(monthStart);
  const monthEndKey = gunAnahtari(monthEnd);
  const bugun = todayIstanbul();

  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,start_date,due_date,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id)")
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşive gönderilen işler çizelgeyi doldurmasın
      .not("status", "in", "(cancelled,archived)")
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);

  const kayitlar = (data ?? []) as Kayit[];
  const sorumlular = new Map(((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
  const tumIsler: CizelgeIsi[] = kayitlar.map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] }));
  const suzulmus = tumIsler.filter(isSuzgeci(suzgec));
  const cizelge = cizelgeyiKur(suzulmus);
  const kisiler = kisiGorunumu ? kisilereGoreKur(suzulmus, (id) => sorumlular.get(id) ?? null) : [];
  // Süzgeç listeleri SÜZÜLMEMİŞ veriden: seçimi daralttıkça seçenekler kaybolmamalı.
  const musteriSecenekleri = musteriAdlari(tumIsler);
  const kisiSecenekleri = [...new Map(
    tumIsler.flatMap((is) => (is.steps ?? []).map((adim) => adim.assigned_employee_id))
      .filter((id): id is string => Boolean(id))
      .map((id) => [id, sorumlular.get(id) ?? "Bilinmeyen personel"] as const),
  )].sort((a, b) => a[1].localeCompare(b[1], "tr"));

  /*
    Bir çubuk aya düşüyor mu? Ayın dışına taşan çubuklar kırpılır; hiç
    kesişmiyorsa çizilmez. Kırpma, çubuğun ayın kenarından devam ettiğini
    göstermek için gerekli.
  */
  const kesisiyor = (aralik: { bas: string; son: string } | null) =>
    Boolean(aralik) && aralik!.bas <= monthEndKey && aralik!.son >= monthStartKey;
  const kolon = (gun: string, ek = 0) => Number(gun.slice(8, 10)) + 1 + ek;
  const kirp = (aralik: { bas: string; son: string }) => ({
    bas: aralik.bas < monthStartKey ? monthStartKey : aralik.bas,
    son: aralik.son > monthEndKey ? monthEndKey : aralik.son,
  });

  // Ekranda çizilecek müşteriler: en az bir işi ya da aşaması bu aya düşenler.
  const asamaSuzgecinden = asamaSuzgeci(suzgec);
  const asamaGorunur = (asama: { aralik: { bas: string; son: string } | null; tamamlandi: boolean; sorumluId: string | null }) =>
    kesisiyor(asama.aralik) && (tamamlananlariGoster || !asama.tamamlandi) && asamaSuzgecinden(asama);

  const gorunen = cizelge
    .map((musteri) => ({
      ...musteri,
      isler: musteri.isler.filter((is) => kesisiyor(is.aralik) || is.asamalar.some(asamaGorunur)),
    }))
    .filter((musteri) => musteri.isler.length > 0);

  const disarida = cizelge.flatMap((musteri) =>
    musteri.isler
      .filter((is) => is.aralik && !kesisiyor(is.aralik) && !is.asamalar.some((asama) => kesisiyor(asama.aralik)))
      .map((is) => ({ ...is, musteri: musteri.ad })),
  );
  const tarihsiz = cizelge.flatMap((musteri) =>
    musteri.isler.filter((is) => !is.aralik).map((is) => ({ ...is, musteri: musteri.ad })),
  );

  const gridTemplateColumns = `240px repeat(${daysInMonth}, minmax(22px, 1fr))`;
  const todayKey = gunAnahtari(new Date());
  const cizilenIs = gorunen.reduce((toplam, musteri) => toplam + musteri.isler.length, 0);

  /*
    Satır numaraları render DIŞINDA hesaplanıyor (lib/operasyon-cizelge.ts):
    çizim sırasında sayaç artırmak React 19'da yasak ve haklı olarak —
    bileşen iki kez çizilirse sayaç kaldığı yerden devam eder.
  */
  const satirlar = satirlariDiz(gorunen, asamaGorunur);

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">OPERASYON / ÇİZELGE</small>
        <h1>Çalışma Çizelgesi</h1>
        <p>
          {kisiGorunumu
            ? "Aşamalar sorumlusuna göre gruplu; tarihe göre sıralı. Hangi işin hangi bölümü olduğu her satırda."
            : "İşler müşteriye göre gruplu; her işin altında aşamaları ve tarihleri. Aynı kişinin eş zamanlı çalışmaları yan yana."}
        </p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{kisiGorunumu ? `${kisiler.length} kişi` : `${cizilenIs} iş`}</span>
        {/* İki eksen aynı sayfada: süzgeçler ikiye bölünmesin. */}
        <Link className="panel-secondary" href={adres({ gorunum: kisiGorunumu ? "" : "kisi" })}>
          {kisiGorunumu ? "Müşteriye göre" : "Kişiye göre"}
        </Link>
        <Link className="panel-secondary" href={adres({ tamamlanan: tamamlananlariGoster ? "" : "1" })}>
          {tamamlananlariGoster ? "Tamamlananları gizle" : "Tamamlananları göster"}
        </Link>
      </div>
    </div>
    <OperationsTabs active="gantt" />
    <div className="module-tab-panel">

    {/*
      Süzgeçler bağlantı olarak kuruluyor, form olarak değil: sunucu bileşeni
      ve adres paylaşılabilir kalıyor ("Ayşe'nin ekimi" bağlantısı gönderilebilir).
      Seçenekler SÜZÜLMEMİŞ veriden geliyor, yoksa bir süzgeç seçtikçe
      öbürünün seçenekleri kaybolurdu.
    */}
    <section className="panel-card ops-suzgec">
      <div className="ops-suzgec-grup" role="group" aria-label="Kişi süzgeci">
        <small>Kişi</small>
        <Link className={params.kisi === undefined ? "is-active" : ""} href={adres({ kisi: "__yok__" })}>Hepsi</Link>
        {kisiSecenekleri.map(([id, ad]) => (
          <Link key={id} className={params.kisi === id ? "is-active" : ""} href={adres({ kisi: id })}>{ad}</Link>
        ))}
        <Link className={params.kisi === "" ? "is-active" : ""} href={adres({ kisi: "" })}>{ATANMAMIS}</Link>
      </div>
      <div className="ops-suzgec-grup" role="group" aria-label="Müşteri süzgeci">
        <small>Müşteri</small>
        <Link className={!params.musteri ? "is-active" : ""} href={adres({ musteri: "" })}>Hepsi</Link>
        {musteriSecenekleri.map((ad) => (
          <Link key={ad} className={params.musteri === ad ? "is-active" : ""} href={adres({ musteri: ad })}>{ad}</Link>
        ))}
      </div>
      <div className="ops-suzgec-grup" role="group" aria-label="Durum süzgeci">
        <small>Durum</small>
        <Link className={!params.durum ? "is-active" : ""} href={adres({ durum: "" })}>Hepsi</Link>
        {["planned", "in_progress", "blocked", "completed"].map((durum) => (
          <Link key={durum} className={params.durum === durum ? "is-active" : ""} href={adres({ durum })}>{isDurumAdi(durum)}</Link>
        ))}
      </div>
    </section>
    {kisiGorunumu ? (
      /*
        Kişi görünümü LİSTE, ızgara değil: "bende ne var" sorusunda okunması
        gereken şey tarih sırası, takvimdeki yeri değil. Ay penceresi de
        burada anlamsız — kişinin gündemi ay sınırında bitmiyor — bu yüzden
        ay gezinmesi yalnızca müşteri görünümünde çıkıyor ve liste tüm
        tarihli aşamaları kapsıyor.
      */
      <section className="panel-card">
        <div className="section-heading compact">
          <div>
            <small className="panel-kicker">KİŞİYE GÖRE</small>
            <h2>Kimde ne var</h2>
            <p>Tarihe göre sıralı; ay sınırı uygulanmaz. Yaklaşan ve geciken aşamalar işaretli.</p>
          </div>
        </div>
        {kisiler.length ? (
          <div className="ops-kisi-listesi">
            {kisiler.map((kisi) => {
              const bekleyen = kisi.asamalar.filter((asama) => !asama.tamamlandi);
              const gosterilecek = tamamlananlariGoster ? kisi.asamalar : bekleyen;
              if (!gosterilecek.length) return null;
              return (
                <article className="ops-kisi" key={kisi.anahtar || "atanmamis"}>
                  <header>
                    <b>{kisi.ad}</b>
                    <span className="status-pill">{bekleyen.length} bekleyen aşama</span>
                  </header>
                  <ul>
                    {gosterilecek.map((asama) => {
                      const uyari = hatirlatmaDurumu({ due_date: asama.tarih, is_completed: asama.tamamlandi }, bugun);
                      return (
                        <li key={asama.id} data-tone={uyari ?? undefined} className={asama.tamamlandi ? "is-done" : ""}>
                          <Link href={`/panel/operations/${asama.isId}`}>
                            <b>{asama.tamamlandi ? "✓ " : ""}{asama.baslik}</b>
                            {/* Aşama adı tek başına hangi tezin bölümü olduğunu söylemiyor. */}
                            <small>{asama.musteri} · {asama.isBasligi}</small>
                          </Link>
                          <span className="ops-kisi-tarih">
                            {asama.tarih ? kisaTarih(asama.tarih) : "tarih yok"}
                            {uyari ? <em data-tone={uyari === "overdue" ? "danger" : "warning"}>{uyari === "overdue" ? "gecikti" : "yaklaştı"}</em> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        ) : <p className="panel-empty">Süzgece uyan aşama bulunmuyor.</p>}
      </section>
    ) : (
    <section className="panel-card gantt-card">
      <div className="calendar-month-nav">
        <Link className="panel-icon-button" href={adres({ ay: prevMonth })} aria-label="Önceki ay">‹</Link>
        <b>{monthLabel(monthStart)}</b>
        <Link className="panel-icon-button" href={adres({ ay: nextMonth })} aria-label="Sonraki ay">›</Link>
      </div>

      {cizilenIs ? (
        <div className="gantt-scroll">
          <div className="gantt-grid" style={{ gridTemplateColumns }}>
            <div className="gantt-corner" style={{ gridRow: 1, gridColumn: 1 }} />
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const key = `${monthQuery}-${pad(day)}`;
              return <div key={day} className={key === todayKey ? "gantt-day-head today" : "gantt-day-head"} style={{ gridRow: 1, gridColumn: day + 1 }}>{day}</div>;
            })}
            {satirlar.map((kayit) => {
              if (kayit.tur === "musteri") {
                const { musteri } = kayit;
                return (
                  <div className="gantt-group" key={`g-${musteri.anahtar}`} style={{ gridRow: kayit.satir, gridColumn: `1 / ${daysInMonth + 2}` }}>
                    <b>{musteri.ad}</b>
                    {/* Eş zamanlı çalışma işaretlenir: operasyoncunun gözü önce oraya gitmeli. */}
                    {esZamanliMi(musteri) ? <span className="status-pill" data-tone="warning">{musteri.isler.length} eş zamanlı çalışma</span> : null}
                  </div>
                );
              }

              if (kayit.tur === "is") {
                const { is } = kayit;
                const kirpilmis = kesisiyor(is.aralik) ? kirp(is.aralik!) : null;
                /*
                  Dizi döndürülüyor, sarmalayıcı düğüm YOK: ızgara çocukları
                  doğrudan ızgaranın çocuğu olmalı. Sarmalayıcı koyup
                  display:contents ile kurtarmak tek bir CSS özelliğine
                  bağımlılık demekti; React iç içe dizileri kendisi düzleştiriyor.
                */
                return [
                  <Link href={`/panel/operations/${is.id}`} className="gantt-row-label" key={`${is.id}-label`} style={{ gridRow: kayit.satir, gridColumn: 1 }}>
                    <b>{is.baslik}</b>
                    {/* Tamamlanan aşamalar gizliyken "kaç bitti" bilgisi burada duruyor. */}
                    <small>
                      {is.guncelAsama ? `Şu an: ${is.guncelAsama}` : isDurumAdi(is.durum)}
                      {is.asamalar.length ? ` · ${is.tamamlanan}/${is.asamalar.length} tamam` : ""}
                    </small>
                  </Link>,
                  <div key={`${is.id}-track`} className="gantt-row-track" style={{ gridRow: kayit.satir, gridColumn: `2 / ${daysInMonth + 2}` }} />,
                  kirpilmis ? (
                    <div
                      key={`${is.id}-bar`}
                      className={`gantt-bar status-${is.durum} priority-${is.oncelik}`}
                      style={{ gridRow: kayit.satir, gridColumn: `${kolon(kirpilmis.bas)} / ${kolon(kirpilmis.son, 1)}` }}
                      title={`${is.baslik} · ${isDurumAdi(is.durum)} · ${is.tamamlanan}/${is.asamalar.length} aşama`}
                    >
                      <span>{is.guncelAsama ?? isDurumAdi(is.durum)}</span>
                    </div>
                  ) : null,
                ];
              }

              const { asama } = kayit;
              const { bas, son } = kirp(asama.aralik!);
              const uyari = hatirlatmaDurumu({ due_date: asama.tarih, is_completed: asama.tamamlandi }, bugun);
              const sorumlu = asama.sorumluId ? sorumlular.get(asama.sorumluId) ?? null : null;
              return [
                <div className="gantt-row-label is-step" key={`${asama.id}-label`} style={{ gridRow: kayit.satir, gridColumn: 1 }}>
                  <b>{asama.tamamlandi ? "✓ " : ""}{asama.baslik}</b>
                  {/* "Kimin hangi işi" sorusunun yanıtı: aşamanın sorumlusu ve tarihi. */}
                  <small>{[sorumlu, asama.tarih ? kisaTarih(asama.tarih) : null].filter(Boolean).join(" · ") || "sorumlu ve tarih yok"}</small>
                </div>,
                <div key={`${asama.id}-track`} className="gantt-row-track is-step" style={{ gridRow: kayit.satir, gridColumn: `2 / ${daysInMonth + 2}` }} />,
                <div
                  key={`${asama.id}-bar`}
                  className={`gantt-step-bar${asama.tamamlandi ? " is-done" : ""}${asama.guncel ? " is-current" : ""}`}
                  data-tone={uyari === "overdue" ? "danger" : uyari === "due_soon" ? "warning" : undefined}
                  style={{ gridRow: kayit.satir, gridColumn: `${kolon(bas)} / ${kolon(son, 1)}` }}
                  title={`${asama.baslik}${sorumlu ? ` · ${sorumlu}` : ""}${asama.tarih ? ` · ${kisaTarih(asama.tarih)}` : ""}${uyari === "overdue" ? " · gecikti" : uyari === "due_soon" ? " · yaklaştı" : ""}`}
                >
                  <span>{asama.baslik}</span>
                </div>,
              ];
            })}
          </div>
        </div>
      ) : <p className="panel-empty">Bu ayda tarihli iş ya da aşama bulunmuyor.</p>}

      <div className="gantt-legend">
        <span className="status-planned">Planlandı</span>
        <span className="status-in_progress">Devam ediyor</span>
        <span className="status-blocked">Beklemede</span>
        <span className="status-completed">Tamamlandı</span>
      </div>
    </section>
    )}

    {disarida.length ? (
      <section className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">BAŞKA AYDA</small><h2>Bu ayda görünmeyen tarihli işler</h2></div></div>
        <div className="module-control-list">
          {disarida.map((is) => <div className="module-control" key={is.id}>
            <div><b>{is.baslik}</b><small>{is.musteri} · teslim {is.aralik ? kisaTarih(is.aralik.son) : "—"}</small></div>
            <Link className="panel-secondary" href={`/panel/operations/${is.id}`}>Aç</Link>
          </div>)}
        </div>
      </section>
    ) : null}

    {tarihsiz.length ? (
      <section className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">TARİHSİZ İŞLER</small><h2>Termini belirlenmemiş</h2></div></div>
        <div className="module-control-list">
          {tarihsiz.map((is) => <div className="module-control" key={is.id}>
            <div><b>{is.baslik}</b><small>{is.musteri === KURUM_ICI ? KURUM_ICI : is.musteri}</small></div>
            <Link className="panel-secondary" href={`/panel/operations/${is.id}`}>Aç</Link>
          </div>)}
        </div>
      </section>
    ) : null}
    </div>
  </div>;
}
