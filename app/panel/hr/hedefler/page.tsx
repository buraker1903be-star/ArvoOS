import Link from "next/link";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { modulGerek } from "@/lib/modul-kapisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { ayEtiketi, aySecenekleri, gerceklesme, type HedefKaydi } from "@/lib/personel-hedefi";
import { liraYazisi } from "@/lib/turkish-amount";
import { cssVar } from "@/lib/css-var";
import { hedefleriKaydet } from "../actions";
import "../../components/kayit-formu.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "../hr.css";
import "./hedefler.css";

export const metadata: Metadata = { title: "Satış hedefleri" };

/*
  AYLIK SATIŞ HEDEFLERİ (29.10.2026).

  Personel Performansı raporu "hedef verisi yok" diyordu ve hedefi
  girecek hiçbir yer yoktu — program eksiği söylüyor, kapatmanın
  yolunu vermiyordu (docs/RAPORLAMA-ASAMA-1.md §2.1).

  TEK EKRANDA BÜTÜN KADRO. Hedef kişi başına ayrı bir pencerede
  sorulsaydı on kişilik bir ekip için on pencere açılırdı; hedef ay
  başında toplu konan bir şey. Ay seçici adreste (?ay=2026-11):
  sunucuda kalıyor, geri tuşu çalışıyor, bağlantı paylaşılabiliyor.

  TUTAR KUTUSU `type="number"` DEĞİL (AGENTS.md "Para kuruş cinsinden
  tamsayıdır"): sayı kutusu "1.500" yazımını geçersiz sayıp kutuyu
  boşaltıyor, kullanıcı doğru yazdığı hâlde uyarı alıyordu. Metin
  kutusu + inputMode="decimal", okuması `kurusOku`.

  GEÇMİŞ AY KAPATILMIYOR. Hedefi ay geçtikten sonra girmek meşru
  (ilk kurulumda geçmiş aylar da doldurulur) ve rapor zaten hangi
  ayın ölçüldüğünü yazıyor.
*/

type Personel = { id: string; full_name: string; job_title: string | null; department_id: string | null; employment_status: string };

/** Hedef satış personeline konur; kadroda çalışan herkes listede. */
const CALISAN = ["active", "on_leave"];

export default async function HedeflerSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { ay: istenenAy } = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  modulGerek(modules, "hr");
  const yonetir = izin("hr.hedef.yonet");
  const org = membership.organization_id;

  const bugun = todayInIstanbul();
  const secenekler = aySecenekleri(bugun);
  /* Adresten gelen ay listede yoksa içinde bulunulan aya düşülüyor:
     elle yazılmış bir tarih için boş bir ekran göstermek, kullanıcıya
     hedeflerin silindiğini düşündürürdü. */
  const ay = istenenAy && secenekler.includes(istenenAy) ? istenenAy : secenekler.find((a) => a.slice(0, 7) === bugun.slice(0, 7))!;

  const [{ data: pVeri, error: pHata }, { data: hVeri, error: hHata }, { data: dVeri }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,department_id,employment_status").eq("organization_id", org).order("full_name"),
    supabase.from("hr_personel_hedefleri").select("employee_id,donem,tutar").eq("organization_id", org).eq("donem", ay),
    supabase.from("hr_departments").select("id,name").eq("organization_id", org),
  ]);
  if (pHata) throw new Error("Personel okunamadı: " + pHata.message);
  if (hHata) throw new Error("Hedefler okunamadı: " + hHata.message);

  const personel = ((pVeri ?? []) as Personel[]).filter((p) => CALISAN.includes(p.employment_status));
  const hedefler = (hVeri ?? []) as HedefKaydi[];
  const hedef = new Map(hedefler.map((h) => [h.employee_id, h.tutar]));
  const departman = new Map(((dVeri ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]));
  const toplam = hedefler.reduce((t, h) => t + h.tutar, 0);
  const konan = hedefler.length;

  return (
    <main className="panel-page hedefler-sayfa">
      <div className="talep-bas">
        <div>
          <span className="talep-kicker">İnsan Kaynakları</span>
          <h1>Satış hedefleri</h1>
          <p className="talep-ozet">
            Aylık hedef kişi başına konur; Personel Performansı raporu gerçekleşmeyi bu rakama göre
            hesaplar. Hedef konmayan kişinin raporda hedef hücresi <b>boş</b> kalır — sıfır değil.
          </p>
        </div>
        <Link href="/panel/finance/raporlar?rapor=personel" className="projects-filter-button hedefler-rapor-link">
          Personel raporu
        </Link>
      </div>

      {/* Ay seçici adreste: sunucuda kalıyor, geri tuşu çalışıyor. */}
      <nav className="hedefler-aylar" aria-label="Hedef ayı">
        {secenekler.map((secenek) => (
          <Link
            key={secenek}
            href={`/panel/hr/hedefler?ay=${secenek}`}
            className={`hedefler-ay${secenek === ay ? " is-active" : ""}`}
            aria-current={secenek === ay ? "page" : undefined}
          >
            {ayEtiketi(secenek)}
          </Link>
        ))}
      </nav>

      <section className="kayit-kart hedefler-kart">
        <header className="hedefler-ozet">
          <div>
            <b>{ayEtiketi(ay)}</b>
            <span>{konan ? `${konan} kişiye hedef konmuş · toplam ₺${liraYazisi(toplam)}` : "Bu aya henüz hedef konmamış"}</span>
          </div>
        </header>

        {personel.length === 0 ? (
          <p className="hedefler-bos">
            Kadroda çalışan personel yok. Hedef koymadan önce <Link href="/panel/hr">personel kaydı</Link> açın.
          </p>
        ) : (
          <form action={hedefleriKaydet} className="panel-form hedefler-form">
            <input type="hidden" name="ay" value={ay} />
            <table className="hedefler-tablo">
              <caption>
                Tutarı boş bırakmak hedefi <b>kaldırır</b>; sıfır hedef koymak isterseniz
                <b> 0</b> yazın. Binlik ayırıcı nokta, kuruş virgül: 30.000,00
              </caption>
              <thead>
                <tr>
                  <th scope="col">Personel</th>
                  <th scope="col">Departman</th>
                  <th scope="col" className="hedefler-tutar-bas">Aylık hedef (₺)</th>
                </tr>
              </thead>
              <tbody>
                {personel.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <Link href={`/panel/hr/${p.id}`}><b>{p.full_name}</b></Link>
                      <small>{p.job_title?.trim() || "—"}</small>
                    </th>
                    <td>{(p.department_id && departman.get(p.department_id)) || "—"}</td>
                    <td className="hedefler-tutar">
                      <input
                        name={`hedef_${p.id}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={18}
                        defaultValue={hedef.has(p.id) ? liraYazisi(hedef.get(p.id)!) : ""}
                        placeholder="Hedef yok"
                        disabled={!yonetir}
                        aria-label={`${p.full_name} için ${ayEtiketi(ay)} hedefi`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {yonetir ? (
              <div className="project-form-actions">
                <button type="submit" className="projects-primary-button">Hedefleri kaydet</button>
              </div>
            ) : (
              <p className="hedefler-bos">Hedefleri yalnızca Kurum Sahibi ve Yönetici değiştirebilir; bu ekranı görüntüleyebilirsiniz.</p>
            )}
          </form>
        )}
      </section>

      {konan > 0 ? (
        <section className="kayit-kart">
          <header className="hedefler-ozet"><div><b>Bu ayın dağılımı</b><span>Hedefi olan kişiler</span></div></header>
          <ul className="hedefler-dagilim">
            {personel
              .filter((p) => hedef.has(p.id))
              .sort((a, b) => (hedef.get(b.id) ?? 0) - (hedef.get(a.id) ?? 0))
              .map((p) => {
                const tutar = hedef.get(p.id) ?? 0;
                const pay = gerceklesme(tutar, toplam) ?? 0;
                return (
                  <li key={p.id}>
                    <div className="hedefler-dagilim-bas"><b>{p.full_name}</b><span>₺{liraYazisi(tutar)}</span></div>
                    {/* Genişlik CSS değişkeniyle: TSX'te satır içi stil
                        yok (AGENTS.md "Stil"), ölçü de CSS tarafında
                        sınırlanabiliyor. */}
                    <div className="hedefler-dagilim-iz"><i style={cssVar("--w", `${Math.max(2, pay)}%`)} /></div>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
