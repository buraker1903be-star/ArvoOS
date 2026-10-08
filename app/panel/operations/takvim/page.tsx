import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { hatirlatmaDurumu, isDurumAdi } from "@/lib/is-adimlari";
import { todayIstanbul } from "../ops-shared";
import { OtomatikSecim } from "../../crm/otomatik-secim";
import { AyGezinme, GunBolumu, TakvimIzgarasi, ayAnahtari, ayBasi, gunAnahtari, gunTarihi, type TakvimMaddesi } from "../../crm/takvim-izgara";
import "../../crm/kayit-detay/kayit-detay.css";
import "../../crm/takvim.css";

/*
  İŞ TAKVİMİ: işlerin terminleri ve aşamaların teslim tarihleri.

  Takvim önce yalnızca İŞİN terminini gösteriyordu; sekiz aşamalı bir tez
  tek bir nokta oluyordu. Aşama tarihleri de düşüyor; işin termini ile
  aşama teslimi ayrı gösteriliyor, aşamanın sorumlusu yazıyor. Tamamlanmış
  aşama takvimi doldurmuyor: geçmiş teslim planlama kararına girmiyor.

  PANEL KALİTESİ (2026-10): satış takvimiyle aynı düzen (takvim-izgara.tsx):
  solda ay ızgarası, sağda seçili gün ve önümüzdeki 14 gün; araç
  satırında geciken/yaklaşan aşama sayıları ve sorumlu süzgeci (yeni
  ?sorumlu=). Eskiden seçili gün paneli ızgaranın altında kalıyordu.
*/

type AdimSatiri = { id: string; title: string; due_date: string | null; is_completed: boolean; assigned_employee_id: string | null };
type Workflow = { id: string; title: string; customer_name: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; assigned_employee_id: string | null; operation_steps?: AdimSatiri[] };

/** Takvime düşen bir madde: işin termini ya da bir aşamanın teslimi. */
type Madde = {
  anahtar: string;
  tarih: string;
  tur: "is" | "asama";
  baslik: string;
  isId: string;
  isBasligi: string;
  musteri: string;
  durum: string;
  sorumlu: string | null;
  uyari: "due_soon" | "overdue" | null;
};

export default async function OperationsCalendarPage({ searchParams }: { searchParams: Promise<{ ay?: string; tarih?: string; sorumlu?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const bugun = todayIstanbul();
  const ay = ayBasi(params.ay, bugun);
  const secili = gunTarihi(params.tarih, bugun);
  const seciliGun = gunAnahtari(secili);
  const seciliSorumlu = (params.sorumlu ?? "").trim().slice(0, 80);

  /*
    Termin süzgeci sorguda değil: bir işin termini aralığın dışında olsa
    bile AŞAMASI bu ayda olabiliyor. Süzme aşağıda madde madde.
  */
  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,operation_steps(id,title,due_date,is_completed,assigned_employee_id)")
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşive gönderilen işler takvimde görünmez
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const workflows = (data ?? []) as Workflow[];
  const calisanlar = (employees ?? []) as { id: string; full_name: string }[];
  const sorumlular = new Map(calisanlar.map((e) => [e.id, formatPersonName(e.full_name)]));

  const aralikBas = gunAnahtari(new Date(ay.getFullYear(), ay.getMonth() - 1, 25));
  const aralikSon = gunAnahtari(new Date(Math.max(new Date(ay.getFullYear(), ay.getMonth() + 2, 5).getTime(), new Date(secili.getFullYear(), secili.getMonth(), secili.getDate() + 15).getTime())));
  const aralikta = (gun: string | null) => Boolean(gun) && gun! >= aralikBas && gun! <= aralikSon;
  // Sorumlu süzgeci: işin sorumlusu ya da aşamanın sorumlusu (kimin hangi işi).
  const sorumluUyar = (id: string | null) => !seciliSorumlu || (seciliSorumlu === "yok" ? !id : id === seciliSorumlu);

  const maddeler: Madde[] = [];
  for (const wf of workflows) {
    const musteri = formatPersonName(wf.customer_name) || wf.customer_name || "Kurum içi iş";
    if (aralikta(wf.due_date) && sorumluUyar(wf.assigned_employee_id)) {
      maddeler.push({ anahtar: `is-${wf.id}`, tarih: wf.due_date!, tur: "is", baslik: formatSubject(wf.title), isId: wf.id, isBasligi: formatSubject(wf.title), musteri, durum: wf.status, sorumlu: wf.assigned_employee_id ? sorumlular.get(wf.assigned_employee_id) ?? null : null, uyari: null });
    }
    for (const adim of wf.operation_steps ?? []) {
      if (adim.is_completed || !aralikta(adim.due_date) || !sorumluUyar(adim.assigned_employee_id)) continue;
      maddeler.push({
        anahtar: `adim-${adim.id}`, tarih: adim.due_date!, tur: "asama", baslik: formatSubject(adim.title),
        isId: wf.id, isBasligi: formatSubject(wf.title), musteri, durum: wf.status,
        sorumlu: adim.assigned_employee_id ? sorumlular.get(adim.assigned_employee_id) ?? null : null,
        // Eşik gece bildirimiyle aynı (lib/is-adimlari.ts): ekran ile uyarı ayrışmasın.
        uyari: hatirlatmaDurumu({ due_date: adim.due_date, is_completed: adim.is_completed }, bugun),
      });
    }
  }
  const gunune = new Map<string, Madde[]>();
  for (const m of maddeler) gunune.set(m.tarih, [...(gunune.get(m.tarih) ?? []), m]);
  // Gün içinde işin termini üstte: o günün asıl olayı teslimdir.
  for (const liste of gunune.values()) liste.sort((a, b) => (a.tur === b.tur ? a.baslik.localeCompare(b.baslik, "tr") : a.tur === "is" ? -1 : 1));

  const izgaraMaddeleri = new Map<string, TakvimMaddesi[]>(
    [...gunune.entries()].map(([gun, liste]) => [gun, liste.map((m) => ({ anahtar: m.anahtar, etiket: m.tur === "asama" ? `› ${m.baslik}` : m.baslik, tur: m.tur, ton: m.uyari === "overdue" ? "danger" : m.uyari === "due_soon" ? "warning" : undefined }))]),
  );
  const buAy = ayAnahtari(ay);
  const buAyMadde = maddeler.filter((m) => m.tarih.startsWith(buAy)).length;
  const geciken = maddeler.filter((m) => m.uyari === "overdue").length;
  const yaklasanUyari = maddeler.filter((m) => m.uyari === "due_soon").length;

  const adres = (ek: Record<string, string>) => {
    const q = new URLSearchParams({ ay: buAy, tarih: seciliGun, ...(seciliSorumlu ? { sorumlu: seciliSorumlu } : {}), ...ek });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/panel/operations/takvim?${q.toString()}`;
  };
  const oncekiAy = ayAnahtari(new Date(ay.getFullYear(), ay.getMonth() - 1, 1));
  const sonrakiAy = ayAnahtari(new Date(ay.getFullYear(), ay.getMonth() + 1, 1));

  const yaklasan: { gun: string; tarih: Date; liste: Madde[] }[] = [];
  for (let i = 1; i <= 14; i++) {
    const tarih = new Date(secili.getFullYear(), secili.getMonth(), secili.getDate() + i);
    const gun = gunAnahtari(tarih);
    const liste = gunune.get(gun) ?? [];
    if (liste.length) yaklasan.push({ gun, tarih, liste });
  }
  const gunBasligi = (t: Date) => t.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  const MaddeSatiri = ({ m }: { m: Madde }) => (
    <li>
      <div className="tk-satir is-link">
        {/* İşin termini mi bir aşamanın teslimi mi: ilk bakışta ayrılmalı. */}
        <span className="tk-saat">{m.tur === "is" ? "Termin" : "Aşama"}</span>
        <span className="tk-govde">
          <Link className="tk-satir-link" href={`/panel/operations/${m.isId}`}><b>{m.baslik}</b></Link>
          {/* "Kimin hangi işi": müşteri, iş ve sorumlu. */}
          <small>{[m.musteri, m.tur === "asama" ? m.isBasligi : null, m.sorumlu ?? (m.tur === "asama" ? "sorumlu atanmadı" : null)].filter(Boolean).join(" · ")}</small>
        </span>
        {m.uyari ? (
          <span className="status-pill" data-tone={m.uyari === "overdue" ? "danger" : "warning"}>{m.uyari === "overdue" ? "Gecikti" : "Yaklaştı"}</span>
        ) : <span className="status-pill">{isDurumAdi(m.durum)}</span>}
      </div>
    </li>
  );

  return (
    <main className="talep tk-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">OPERASYON</small>
          <h1>İş takvimi</h1>
        </div>
      </header>

      <section className="kayit-serit talep-serit tk-arac" aria-label="Takvim araçları">
        <AyGezinme ay={ay} oncekiHref={adres({ ay: oncekiAy })} sonrakiHref={adres({ ay: sonrakiAy })} bugunHref={adres({ ay: bugun.slice(0, 7), tarih: bugun })} />
        <div className="tk-sag">
          <dl>
            <div><dt>Bu ay</dt><dd>{buAyMadde} tarih</dd></div>
            <div><dt>Geciken aşama</dt><dd className={geciken ? "talep-uyari" : undefined}>{geciken}</dd></div>
            <div><dt>Yaklaşan aşama</dt><dd className={yaklasanUyari ? "talep-uyari" : undefined}>{yaklasanUyari}</dd></div>
          </dl>
          <form method="get" action="/panel/operations/takvim">
            <input type="hidden" name="ay" value={buAy} />
            <input type="hidden" name="tarih" value={seciliGun} />
            <OtomatikSecim name="sorumlu" defaultValue={seciliSorumlu} className="talep-temsilci-sec" label="Sorumlu">
              <option value="">Tüm sorumlular</option>
              <option value="yok">Atanmamış</option>
              {[...sorumlular.entries()].sort((a, b) => a[1].localeCompare(b[1], "tr")).map(([id, ad]) => <option key={id} value={id}>{ad}</option>)}
            </OtomatikSecim>
          </form>
        </div>
      </section>

      <div className="tk-izgara-alan">
        <section className="panel-card tk-takvim-kart" aria-label="Aylık takvim">
          <TakvimIzgarasi ay={ay} maddeler={izgaraMaddeleri} seciliGun={seciliGun} bugun={bugun} gunHref={(gun) => adres({ tarih: gun })} />
        </section>

        <aside className="panel-card tk-panel" aria-label="Seçili gün ve yaklaşan tarihler">
          <GunBolumu baslik={gunBasligi(secili)} rozet={seciliGun === bugun ? "Bugün" : undefined} bos="Bu gün için termin ya da aşama yok.">
            {(gunune.get(seciliGun) ?? []).length ? <ul className="tk-liste">{(gunune.get(seciliGun) ?? []).map((m) => <MaddeSatiri key={m.anahtar} m={m} />)}</ul> : undefined}
          </GunBolumu>
          <GunBolumu baslik="Önümüzdeki 14 gün" bos="Yaklaşan termin ya da aşama yok.">
            {yaklasan.length ? (
              <>
                {yaklasan.map(({ gun, tarih, liste }) => (
                  <div key={gun}>
                    <h3 className="tk-alt">{gunBasligi(tarih)}</h3>
                    <ul className="tk-liste">{liste.map((m) => <MaddeSatiri key={m.anahtar} m={m} />)}</ul>
                  </div>
                ))}
              </>
            ) : undefined}
          </GunBolumu>
        </aside>
      </div>
    </main>
  );
}
