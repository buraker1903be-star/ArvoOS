import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import { setStepStatus } from "../actions";
import {
  asamaPanosuKur,
  SABLON_DISI_KOLONU,
  VARSAYILAN_PANO_SABLONU,
  type CizelgeIsi,
  type SablonAsamasi,
} from "@/lib/operasyon-cizelge";
import { hatirlatmaDurumu, isDurumAdi } from "@/lib/is-adimlari";
import { initials } from "@/lib/table-format";
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

  BOŞ KOLON GÖSTERİLMİYOR (gerekçe lib/operasyon-cizelge.ts'te): sekiz aşama +
  Tamamlandı dokuz kolon ediyor ve pano yatay kaydırmadan görünmez oluyordu.
  Kolon başlığındaki numara ŞABLONDAKİ sıra, panodaki sıra değil — atlanan
  aşamalar böyle görünüyor; gizlenenler de altta tek satırda sayılıyor.

  SÜZGEÇ YOK, bilerek. Denendi ve kaldırıldı: müşteri adları şirket unvanı
  olduğunda ("… LİMİTED ŞİRKETİ") rozetler iki satıra taşıyor ve panonun
  kendisini ekranın dışına itiyor — oysa panonun bütün değeri bir bakışta
  görünmesi. Süzme ihtiyacı Çalışma Çizelgesi'nde karşılanıyor; pano
  "her şey nerede" görünümü olarak kalıyor.

  KART TAŞIMA: "Tamamla" güncel aşamayı bitirip işi sonraki kolona geçiriyor,
  "Geri al" güncel aşamadan önceki tamamlanmış aşamayı yeniden açıyor.
  Sürükleme yok — istemci bileşeni, dokunmatik ve klavye için ayrı bir tur
  demek; düğme üçünde de çalışıyor ve iş detayındaki durum düğmeleriyle aynı
  işlemi kullanıyor.
*/

type AdimSatiri = {
  id: string;
  title: string;
  sort_order: number;
  due_date: string | null;
  is_completed: boolean;
  assigned_employee_id: string | null;
  status: string;
};
type Kayit = CizelgeIsi & { operation_steps: AdimSatiri[] };

const kisaTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" }).format(
    new Date(`${gun}T12:00:00`),
  );

export default async function OperationsPanoPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const [{ data, error }, { data: employees }, { data: sablonSatirlari }] = await Promise.all([
    supabase
      .from("operation_workflows")
      .select(
        "id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id,status)",
      )
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşivdeki işler panoyu doldurmasın
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
    // Kolonlar kurumun şablonundan; yoksa varsayılan sekiz aşama.
    supabase
      .from("organization_step_templates")
      .select("title,sort_order")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);

  const kurumSablonu = (sablonSatirlari ?? []) as SablonAsamasi[];
  const sablon = kurumSablonu.length ? kurumSablonu : VARSAYILAN_PANO_SABLONU;
  const kendiSablonu = kurumSablonu.length > 0;

  const sorumlular = new Map(
    ((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]),
  );
  const tumIsler: CizelgeIsi[] = ((data ?? []) as Kayit[]).map((kayit) => ({
    ...kayit,
    steps: kayit.operation_steps ?? [],
  }));
  const { kolonlar, bosAsamalar } = asamaPanosuKur(tumIsler, sablon, (id) => sorumlular.get(id) ?? null);
  const bugun = todayIstanbul();
  const toplamKart = kolonlar.reduce((toplam, kolon) => toplam + kolon.kartlar.length, 0);
  const sablonDisi = kolonlar.find((kolon) => kolon.anahtar === SABLON_DISI_KOLONU)?.kartlar.length ?? 0;

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">OPERASYON / PANO</small>
          <h1>Pano</h1>
          <p>
            İşler bulundukları aşamanın kolonunda. Kolonlar{" "}
            {kendiSablonu ? "kurumunuzun adım şablonundan" : "varsayılan sekiz aşamadan"} geliyor; kartta aşamanın
            tarihi ve sorumlusu yazıyor.
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
            Şablonla eşleşmeyen aşamalar sessizce ilk kolona atılmıyor; sebebi
            de yazılıyor. Adımlar üç kaynaktan üretiliyor ve önceliği
            sözleşmenin ara teslim takviminde: sözleşmeden açılan işin aşama
            adları müşteriye satılan plandan gelir.
          */
          <p className="ops-pano-not">
            {sablonDisi} işin şu anki aşaması şablonda yok — bunlar sondaki “Şablon dışı” kolonunda. Sözleşmeden açılan
            işler aşamalarını müşteriye satılan ara teslim takviminden alıyor; şablona eklemek isterseniz{" "}
            <Link href="/panel/operations/sablon">adım şablonunu</Link> düzenleyin.
          </p>
        ) : null}

        {toplamKart ? (
          <>
            <div className="ops-pano">
              {kolonlar.map((kolon) => (
                <section className="ops-pano-kolon" key={kolon.anahtar} data-tur={kolon.tur}>
                  <header>
                    {/* Numara ŞABLONDAKİ sıra: atlanan aşama boşlukla görünüyor. */}
                    {kolon.tur === "asama" ? <i aria-hidden="true">{kolon.sira}</i> : null}
                    <b>{kolon.baslik}</b>
                    <span>{kolon.kartlar.length}</span>
                  </header>
                  <div className="ops-pano-kartlar">
                    {kolon.kartlar.map((kart) => {
                      const uyari = hatirlatmaDurumu({ due_date: kart.tarih, is_completed: kart.tamamlandi }, bugun);
                      const yuzde = kart.toplamAsama
                        ? Math.round((kart.tamamlananAsama / kart.toplamAsama) * 100)
                        : 0;
                      return (
                        <article className="ops-pano-kart" key={kart.isId} data-tone={uyari ?? undefined}>
                          <Link href={`/panel/operations/${kart.isId}`}>
                            <b>{kart.baslik}</b>
                            <small>{kart.musteri}</small>
                          </Link>
                          <div className="ops-pano-kart-alt">
                            <span className="ops-pano-kisi" title={kart.sorumluAdi ?? "Sorumlu atanmadı"}>
                              <i aria-hidden="true" data-bos={kart.sorumluAdi ? undefined : "1"}>
                                {kart.sorumluAdi ? initials(kart.sorumluAdi) : "?"}
                              </i>
                              {kart.sorumluAdi ?? "sorumlu yok"}
                            </span>
                            <span className="ops-pano-tarih">
                              {kart.tarih
                                ? kisaTarih(kart.tarih)
                                : kart.guncelAsama
                                  ? "tarih yok"
                                  : isDurumAdi(kart.durum)}
                              {uyari ? (
                                <em data-tone={uyari === "overdue" ? "danger" : "warning"}>
                                  {uyari === "overdue" ? "gecikti" : "yaklaştı"}
                                </em>
                              ) : null}
                            </span>
                          </div>
                          {/* Şablon dışı kolonda hangi aşamada olduğu yazılmalı: kolon adı söylemiyor. */}
                          {kolon.tur === "sablon_disi" ? (
                            <p className="ops-pano-asama">{kart.guncelAsama ?? "Aşama üretilmemiş"}</p>
                          ) : null}
                          <div className="ops-pano-tasi">
                            <span className="ops-pano-sayac">
                              {kart.tamamlananAsama}/{kart.toplamAsama} aşama
                            </span>
                            {/* Sonraki kolona geçmek = güncel aşamayı tamamlamak. */}
                            {kart.guncelAsamaId ? (
                              <form action={setStepStatus}>
                                <input type="hidden" name="step_id" value={kart.guncelAsamaId} />
                                <input type="hidden" name="status" value="done" />
                                <button
                                  type="submit"
                                  data-tone="success"
                                  title={`“${kart.guncelAsama}” aşamasını tamamla`}
                                >
                                  Tamamla →
                                </button>
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
                          {/*
                            İlerleme çubuğu kartın alt kenarında, tam genişlikte:
                            kolonu tarayan göz yüzdeleri aynı hizada karşılaştırıyor.
                          */}
                          <div
                            className="ops-pano-ilerleme"
                            title={`${kart.tamamlananAsama}/${kart.toplamAsama} aşama tamam`}
                          >
                            <i style={{ width: `${yuzde}%` }} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {bosAsamalar.length ? (
              /*
                Gizlenen aşamalar sayılıyor: adı geçmezse "İç Kontrol kolonu
                nerede?" sorusu doğuyor ve kullanıcı panonun eksik olduğunu
                düşünüyor.
              */
              <p className="ops-pano-gizli">
                İçinde iş olmayan {bosAsamalar.length} aşama gizlendi: {bosAsamalar.join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="panel-empty">Panoda gösterilecek iş bulunmuyor.</p>
        )}
      </div>
    </div>
  );
}
