import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { setStepStatus } from "../actions";
import {
  ATANMAMIS,
  asamaPanosuKur,
  isSuzgeci,
  musteriAdlari,
  SABLON_DISI_KOLONU,
  VARSAYILAN_PANO_SABLONU,
  type CizelgeIsi,
  type SablonAsamasi,
  type Suzgec,
} from "@/lib/operasyon-cizelge";
import { hatirlatmaDurumu, isDurumAdi } from "@/lib/is-adimlari";
import { todayIstanbul } from "../ops-shared";
import "../../gantt.css";
import "./pano.css";

/*
  PANO — kolonlar ADIM ŞABLONUNDAKİ aşamalar, kart İŞ.
  İlk sürümde kolonlar adımın dört durumuydu ve kart aşamaydı; operasyoncunun
  sorusu o değildi. "Her iki çalışmada da hangi aşamada olduğumuzu görmek"
  ancak kart iş olunca yanıtlanıyor: Emine Hanım'ın tezi "İç Kontrol"
  kolonunda, makalesi "Hazırlanıyor" kolonunda.
  KOLONLAR KURUMUN ŞABLONUNDAN geliyor (organization_step_templates); şablon
  tanımlanmamışsa varsayılan sekiz aşama. Kolonları koda gömmek, şablonunu
  düzenleyen kurumda panoyu yanlış gösterirdi.
  KART TAŞIMA: "Tamamla" güncel aşamayı bitirip işi sonraki kolona geçiriyor,
  "Geri al" son tamamlanan aşamayı yeniden açıyor. Sürükleme yok — istemci
  bileşeni, dokunmatik ve klavye için ayrı bir tur demek; düğme üçünde de
  çalışıyor ve iş detayındaki durum düğmeleriyle aynı işlemi kullanıyor.
*/
type AdimSatiri = { id: string; title: string; sort_order: number; due_date: string | null; is_completed: boolean; assigned_employee_id: string | null; status: string };
type Kayit = CizelgeIsi & { operation_steps: AdimSatiri[] };
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
  const [{ data, error }, { data: employees }, { data: sablonSatirlari }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id,status)")
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşivdeki işler panoyu doldurmasın
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
    // Kolonlar kurumun şablonundan; yoksa varsayılan sekiz aşama.
    supabase.from("organization_step_templates").select("title,sort_order")
      .eq("organization_id", membership.organization_id).eq("is_active", true).order("sort_order"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const kurumSablonu = (sablonSatirlari ?? []) as SablonAsamasi[];
  const sablon = kurumSablonu.length ? kurumSablonu : VARSAYILAN_PANO_SABLONU;
  const kendiSablonu = kurumSablonu.length > 0;
  const sorumlular = new Map(((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]));
  const tumIsler: CizelgeIsi[] = ((data ?? []) as Kayit[]).map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] }));
  const pano = asamaPanosuKur(tumIsler.filter(isSuzgeci(suzgec)), sablon, (id) => sorumlular.get(id) ?? null);
  const bugun = todayIstanbul();
  const toplamKart = pano.reduce((toplam, kolon) => toplam + kolon.kartlar.length, 0);
  const sablonDisi = pano.find((kolon) => kolon.anahtar === SABLON_DISI_KOLONU)?.kartlar.length ?? 0;
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
        <p>
          İşler bulundukları aşamanın kolonunda. Kolonlar {kendiSablonu ? "kurumunuzun adım şablonundan" : "varsayılan sekiz aşamadan"} geliyor;
          kartta aşamanın tarihi ve sorumlusu yazıyor.
        </p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill">{toplamKart} iş</span>
        <Link className="panel-secondary" href="/panel/operations/sablon">Adım şablonu</Link>
      </div>
    </div>
    <OperationsTabs active="pano" />
    <div className="module-tab-panel">
    {sablonDisi ? (
      /*
        Şablonla eşleşmeyen aşamalar sessizce ilk kolona atılmıyor; sebebi de
        yazılıyor. Adımlar üç kaynaktan üretiliyor ve önceliği sözleşmenin ara
        teslim takviminde: sözleşmeden açılan işin aşama adları müşteriye
        satılan plandan gelir.
      */
      <p className="ops-pano-not">
        {sablonDisi} işin şu anki aşaması şablonda yok — bunlar sondaki “Şablon dışı” kolonunda.
        Sözleşmeden açılan işler aşamalarını müşteriye satılan ara teslim takviminden alıyor;
        şablona eklemek isterseniz <Link href="/panel/operations/sablon">adım şablonunu</Link> düzenleyin.
      </p>
    ) : null}
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
        {pano.map((kolon) => (
          <section className="ops-pano-kolon" key={kolon.anahtar} data-tur={kolon.tur}>
            <header>
              <b>{kolon.baslik}</b>
              <span>{kolon.kartlar.length}</span>
            </header>
            <div className="ops-pano-kartlar">
              {kolon.kartlar.map((kart) => {
                const uyari = hatirlatmaDurumu({ due_date: kart.tarih, is_completed: kart.tamamlandi }, bugun);
                return (
                  <article className="ops-pano-kart" key={kart.isId} data-tone={uyari ?? undefined}>
                    <Link href={`/panel/operations/${kart.isId}`}>
                      <b>{kart.baslik}</b>
                      <small>{kart.musteri}</small>
                    </Link>
                    <div className="ops-pano-kart-alt">
                      <span>{kart.sorumluAdi ?? "sorumlu yok"}</span>
                      <span className="ops-pano-tarih">
                        {kart.tarih ? kisaTarih(kart.tarih) : kart.guncelAsama ? "tarih yok" : isDurumAdi(kart.durum)}
                        {uyari ? <em data-tone={uyari === "overdue" ? "danger" : "warning"}>{uyari === "overdue" ? "gecikti" : "yaklaştı"}</em> : null}
                      </span>
                    </div>
                    {/* Şablon dışı kolonda hangi aşamada olduğu yazılmalı: kolon adı söylemiyor. */}
                    {kolon.tur === "sablon_disi" ? (
                      <p className="ops-pano-asama">{kart.guncelAsama ?? "Aşama üretilmemiş"}</p>
                    ) : null}
                    <div className="ops-pano-ilerleme" aria-hidden="true">
                      <i style={{ width: `${kart.toplamAsama ? Math.round((kart.tamamlananAsama / kart.toplamAsama) * 100) : 0}%` }} />
                    </div>
                    <div className="ops-pano-tasi">
                      <span className="ops-pano-sayac">{kart.tamamlananAsama}/{kart.toplamAsama} aşama</span>
                      {/* Sonraki kolona geçmek = güncel aşamayı tamamlamak. */}
                      {kart.guncelAsamaId ? (
                        <form action={setStepStatus}>
                          <input type="hidden" name="step_id" value={kart.guncelAsamaId} />
                          <input type="hidden" name="status" value="done" />
                          <button type="submit" data-tone="success" title={`“${kart.guncelAsama}” aşamasını tamamla`}>Tamamla →</button>
                        </form>
                      ) : null}
                      {kart.oncekiAsamaId ? (
                        <form action={setStepStatus}>
                          <input type="hidden" name="step_id" value={kart.oncekiAsamaId} />
                          <input type="hidden" name="status" value="in_progress" />
                          <button type="submit" title="Bir önceki aşamayı yeniden aç">← Geri al</button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!kolon.kartlar.length ? <p className="ops-pano-bos">Bu aşamada iş yok</p> : null}
            </div>
          </section>
        ))}
      </div>
    ) : <p className="panel-empty">Süzgece uyan iş bulunmuyor.</p>}
    </div>
  </div>;
}
