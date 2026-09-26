import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { setStepStatus } from "../actions";
import {
  ATANMAMIS,
  asamaSuzgeci,
  isSuzgeci,
  musteriAdlari,
  PANO_KOLONLARI,
  panoyuKur,
  type CizelgeIsi,
  type Suzgec,
} from "@/lib/operasyon-cizelge";
import { hatirlatmaDurumu, STEP_STATUS_LABELS, STEP_STATUS_TONES } from "@/lib/is-adimlari";
import { todayIstanbul } from "../ops-shared";
import "../../gantt.css";
import "./pano.css";

/*
  PANO — aşamalar durum kolonlarında.

  Kart AŞAMA, iş değil. İşler kart olsaydı kolonlar işin durumunu
  (planlandı / devam ediyor) gösterirdi ve bir tezin dokuz bölümünden
  hangisinin kontrolde olduğu yine görünmezdi — çizelgeyi yapma sebebimizin
  aynısı.

  SÜRÜKLE-BIRAK YOK. Kolon değiştirme kartın üstündeki düğmelerle, tek
  tıkla. Sürükleme istemci bileşeni, dokunmatik desteği ve klavye
  erişilebilirliği için ayrı bir tur demek; düğme her üçünde de çalışıyor ve
  iş detayındaki durum düğmeleriyle aynı işlemi (setStepStatus) kullanıyor.

  Ay penceresi yok: pano "şu an ne var" görünümü, takvim değil. Süzgeçler
  çizelgeyle aynı adres parametrelerini kullanıyor, böylece iki ekran
  arasında geçerken seçim kaybolmuyor.
*/

type AdimSatiri = { id: string; title: string; sort_order: number; due_date: string | null; is_completed: boolean; assigned_employee_id: string | null; status: string };
type Kayit = CizelgeIsi & { operation_steps: AdimSatiri[] };

/* Tamamlanan kolonu sınırsız uzayabiliyor; panonun işi "şu an ne var". */
const TAMAMLANAN_SINIRI = 12;

const kisaTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(new Date(`${gun}T12:00:00`));

export default async function OperationsPanoPage({
  searchParams,
}: {
  searchParams: Promise<{ kisi?: string; musteri?: string }>;
}) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const suzgec: Suzgec = {
    ...(params.kisi !== undefined ? { kisi: params.kisi } : {}),
    ...(params.musteri ? { musteri: params.musteri } : {}),
  };

  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id,status)")
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşivdeki işler panoyu doldurmasın
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);

  const sorumlular = new Map(((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
  const tumIsler: CizelgeIsi[] = ((data ?? []) as Kayit[]).map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] }));
  const suzulmus = tumIsler.filter(isSuzgeci(suzgec));
  const asamaSuzgecinden = asamaSuzgeci(suzgec);

  const pano = panoyuKur(suzulmus, (id) => sorumlular.get(id) ?? null)
    .map((kolon) => ({ ...kolon, kartlar: kolon.kartlar.filter(asamaSuzgecinden) }));
  const bugun = todayIstanbul();
  const toplamKart = pano.reduce((toplam, kolon) => toplam + kolon.kartlar.length, 0);

  // Süzgeç seçenekleri SÜZÜLMEMİŞ veriden: seçim daraldıkça seçenekler kaybolmamalı.
  const musteriSecenekleri = musteriAdlari(tumIsler);
  const kisiSecenekleri = [...new Map(
    tumIsler.flatMap((is) => (is.steps ?? []).map((adim) => adim.assigned_employee_id))
      .filter((id): id is string => Boolean(id))
      .map((id) => [id, sorumlular.get(id) ?? "Bilinmeyen personel"] as const),
  )].sort((a, b) => a[1].localeCompare(b[1], "tr"));

  const adres = (ek: Record<string, string>) => {
    const usp = new URLSearchParams({
      ...(params.kisi !== undefined ? { kisi: params.kisi } : {}),
      ...(params.musteri ? { musteri: params.musteri } : {}),
      ...ek,
    });
    for (const [ad, deger] of [...usp.entries()]) if (!deger && ad !== "kisi") usp.delete(ad);
    if (usp.get("kisi") === "__yok__") usp.delete("kisi");
    const sorgu = usp.toString();
    return `/panel/operations/pano${sorgu ? `?${sorgu}` : ""}`;
  };

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">OPERASYON / PANO</small>
        <h1>Pano</h1>
        <p>Aşamalar durumlarına göre. Kartın üstündeki düğmelerle kolon değiştirilir; tarih ve sorumlu kartta yazılı.</p>
      </div>
      <div className="panel-page-actions"><span className="status-pill">{toplamKart} aşama</span></div>
    </div>
    <OperationsTabs active="pano" />
    <div className="module-tab-panel">

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
    </section>

    {toplamKart ? (
      <div className="ops-pano">
        {pano.map((kolon) => {
          const etiket = STEP_STATUS_LABELS[kolon.durum as keyof typeof STEP_STATUS_LABELS] ?? kolon.durum;
          /* Tamamlanan kolonu kısaltılıyor; gizlenen sayı yazılıyor. */
          const kisalt = kolon.durum === "done" && kolon.kartlar.length > TAMAMLANAN_SINIRI;
          const gosterilen = kisalt ? kolon.kartlar.slice(0, TAMAMLANAN_SINIRI) : kolon.kartlar;
          return (
            <section className="ops-pano-kolon" key={kolon.durum}>
              <header>
                <b data-tone={STEP_STATUS_TONES[kolon.durum as keyof typeof STEP_STATUS_TONES] ?? "neutral"}>{etiket}</b>
                <span>{kolon.kartlar.length}</span>
              </header>
              <div className="ops-pano-kartlar">
                {gosterilen.map((kart) => {
                  const uyari = hatirlatmaDurumu({ due_date: kart.tarih, is_completed: kart.tamamlandi }, bugun);
                  return (
                    <article className="ops-pano-kart" key={kart.id} data-tone={uyari ?? undefined}>
                      <Link href={`/panel/operations/${kart.isId}`}>
                        <b>{kart.baslik}</b>
                        {/* Aşama adı tek başına hangi tezin bölümü olduğunu söylemiyor. */}
                        <small>{kart.musteri} · {kart.isBasligi}</small>
                      </Link>
                      <div className="ops-pano-kart-alt">
                        <span>{kart.sorumluAdi ?? "sorumlu yok"}</span>
                        <span className="ops-pano-tarih">
                          {kart.tarih ? kisaTarih(kart.tarih) : "tarih yok"}
                          {uyari ? <em data-tone={uyari === "overdue" ? "danger" : "warning"}>{uyari === "overdue" ? "gecikti" : "yaklaştı"}</em> : null}
                        </span>
                      </div>
                      {/*
                        Kolon değiştirme: sürükleme yerine düğme. Dokunmatikte
                        ve klavyeyle de çalışıyor, iş detayındaki durum
                        düğmeleriyle aynı işlemi kullanıyor.
                      */}
                      <div className="ops-pano-tasi" role="group" aria-label={`${kart.baslik} durumu`}>
                        {PANO_KOLONLARI.filter((durum) => durum !== kolon.durum).map((durum) => (
                          <form action={setStepStatus} key={durum}>
                            <input type="hidden" name="step_id" value={kart.id} />
                            <input type="hidden" name="status" value={durum} />
                            <button type="submit" data-tone={STEP_STATUS_TONES[durum as keyof typeof STEP_STATUS_TONES]} title={`${STEP_STATUS_LABELS[durum as keyof typeof STEP_STATUS_LABELS]} yap`}>
                              {STEP_STATUS_LABELS[durum as keyof typeof STEP_STATUS_LABELS]}
                            </button>
                          </form>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {kisalt ? <p className="ops-pano-kisalt">+{kolon.kartlar.length - TAMAMLANAN_SINIRI} tamamlanmış aşama daha</p> : null}
                {!kolon.kartlar.length ? <p className="ops-pano-bos">Bu kolonda aşama yok</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    ) : <p className="panel-empty">Süzgece uyan aşama bulunmuyor.</p>}
    </div>
  </div>;
}
