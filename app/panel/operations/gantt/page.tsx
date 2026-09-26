import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { cizelgeyiKur, esZamanliMi, KURUM_ICI, satirlariDiz, type CizelgeIsi } from "@/lib/operasyon-cizelge";
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

export default async function OperationsGanttPage({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const monthStart = parseMonthParam(params.ay);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), daysInMonth);
  const monthQuery = ayAnahtari(monthStart);
  const prevMonth = ayAnahtari(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const nextMonth = ayAnahtari(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1));
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
  const cizelge = cizelgeyiKur(kayitlar.map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] })));

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
  const gorunen = cizelge
    .map((musteri) => ({
      ...musteri,
      isler: musteri.isler.filter((is) => kesisiyor(is.aralik) || is.asamalar.some((asama) => kesisiyor(asama.aralik))),
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
  const satirlar = satirlariDiz(gorunen, (asama) => kesisiyor(asama.aralik));

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">OPERASYON / ÇİZELGE</small>
        <h1>Çalışma Çizelgesi</h1>
        <p>İşler müşteriye göre gruplu; her işin altında aşamaları ve tarihleri. Aynı kişinin eş zamanlı çalışmaları yan yana.</p>
      </div>
      <div className="panel-page-actions"><span className="status-pill">{cizilenIs} iş</span></div>
    </div>
    <OperationsTabs active="gantt" />
    <div className="module-tab-panel">
    <section className="panel-card gantt-card">
      <div className="calendar-month-nav">
        <Link className="panel-icon-button" href={`/panel/operations/gantt?ay=${prevMonth}`} aria-label="Önceki ay">‹</Link>
        <b>{monthLabel(monthStart)}</b>
        <Link className="panel-icon-button" href={`/panel/operations/gantt?ay=${nextMonth}`} aria-label="Sonraki ay">›</Link>
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
                    <small>{is.guncelAsama ? `Şu an: ${is.guncelAsama}` : isDurumAdi(is.durum)}</small>
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
