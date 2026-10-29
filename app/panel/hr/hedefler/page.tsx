import Link from "next/link";
import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { modulGerek } from "@/lib/modul-kapisi";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { money } from "@/lib/rapor-bicim";
import { ayinSonGunu } from "@/lib/rapor-donemi";
import { sozlesmeleriBagla, type PersonelSozlesmesi } from "@/lib/rapor-personel";
import { tumSatirlar } from "@/lib/rapor-okuma";
import { ayEtiketi, aySecenekleri, gerceklesme, type HedefKaydi } from "@/lib/personel-hedefi";
import { liraYazisi } from "@/lib/turkish-amount";
import { hedefleriKaydet, hedefleriOncekiAydanKopyala } from "../actions";
import "../hr.css";
import "../../components/kayit-formu.css";
import "../../crm/crm.css";
import "../../crm/kayit-detay/kayit-detay.css";
import "./hedefler.css";

export const metadata: Metadata = { title: "Satış hedefleri" };

/*
  AYLIK SATIŞ HEDEFLERİ (29.10.2026).

  Personel Performansı raporu "hedef verisi yok" diyordu ve hedefi
  girecek hiçbir yer yoktu — program eksiği söylüyor, kapatmanın
  yolunu vermiyordu (docs/RAPORLAMA-ASAMA-1.md §2.1).

  DÜZEN PANELİN KENDİ DÜZENİ: başlık (talep-bas) + özet şeridi
  (kayit-serit) + panel-card içinde liste, personel listesiyle aynı.
  İlk sürüm kendi sınıflarını yazıyordu ve ekranda kartsız, düğmesi
  düz yazı görünen bir tablo çıktı: kullanılan sınıfların bir kısmı
  bu depoda HİÇ yoktu (.kayit-kart, .projects-primary-button — başka
  bir depodan taşınmış). `npm run check:css` tanımlı olup rotaya
  girmeyen sınıfı arıyor, HİÇ TANIMLANMAMIŞ olanı değil; o yüzden
  denetim sessiz kaldı.

  TEK EKRANDA BÜTÜN KADRO. Hedef kişi başına ayrı pencerede
  sorulsaydı on kişilik ekip için on pencere açılırdı; hedef ay
  başında toplu konan bir şey. Ay seçici adreste (?ay=2026-11):
  sorgular sunucuda kalıyor, geri tuşu çalışıyor, bağlantı
  paylaşılabiliyor.

  TUTAR KUTUSU `type="number"` DEĞİL (AGENTS.md "Para kuruş cinsinden
  tamsayıdır"): sayı kutusu "1.500" yazımını geçersiz sayıp kutuyu
  boşaltıyor, kullanıcı doğru yazdığı hâlde uyarı alıyordu. Metin
  kutusu + inputMode="decimal", okuması `kurusOku`.

  GEÇMİŞ AY KAPATILMIYOR: ilk kurulumda geçmiş aylar da doldurulur ve
  rapor zaten hangi ayı ölçtüğünü yazıyor.
*/

type Personel = { id: string; full_name: string; job_title: string | null; department_id: string | null; employment_status: string };

/** Kadroda çalışan herkes listede: kimin satış yaptığına kurum karar
    verir, program bir unvan listesi uydurmaz. */
const CALISAN = ["active", "on_leave"];

const basHarf = (ad: string) =>
  ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";

export default async function HedeflerSayfasi({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const { ay: istenenAy } = await searchParams;
  const { supabase, membership, modules, izin } = await getPanelContext();
  modulGerek(modules, "hr");
  const yonetir = izin("hr.hedef.yonet");
  const org = membership.organization_id;

  const bugun = todayInIstanbul();
  /* Üç ay geri, altı ay ileri: hedef gelecek aya konur, geçmiş ay
     yalnızca ilk kurulumda ya da düzeltme için gerekiyor. On üç ay
     şeridi ekranı boydan boya kaplıyordu. */
  const secenekler = aySecenekleri(bugun, 3, 6);
  const buAy = secenekler.find((a) => a.slice(0, 7) === bugun.slice(0, 7))!;
  /* Adresten gelen ay listede yoksa içinde bulunulan aya düşülüyor:
     elle yazılmış bir tarih için boş ekran göstermek, kullanıcıya
     hedeflerin silindiğini düşündürürdü. */
  const ay = istenenAy && secenekler.includes(istenenAy) ? istenenAy : buAy;
  const oncekiAy = secenekler[Math.max(0, secenekler.indexOf(ay) - 1)];

  const [{ data: pVeri, error: pHata }, { data: hVeri, error: hHata }, { data: dVeri }, { data: oVeri }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name,job_title,department_id,employment_status").eq("organization_id", org).order("full_name"),
    supabase.from("hr_personel_hedefleri").select("employee_id,donem,tutar").eq("organization_id", org).eq("donem", ay),
    supabase.from("hr_departments").select("id,name").eq("organization_id", org),
    /* Önceki ay yalnızca "kopyala" teklifini göstermek için okunuyor:
       hedefi olmayan bir aydan kopyalama teklif etmek, basınca hiçbir
       şey yapmayan bir düğme olurdu. */
    ay === oncekiAy
      ? Promise.resolve({ data: [] as HedefKaydi[] })
      : supabase.from("hr_personel_hedefleri").select("employee_id,donem,tutar").eq("organization_id", org).eq("donem", oncekiAy),
  ]);
  if (pHata) throw new Error("Personel okunamadı: " + pHata.message);
  if (hHata) throw new Error("Hedefler okunamadı: " + hHata.message);

  /*
    GERÇEKLEŞEN, RAPORLA AYNI YERDEN HESAPLANIYOR
    (lib/rapor-personel → sozlesmeleriBagla). Burada kendi toplamımı
    yazsaydım aynı kişi için bu ekranda bir rakam, Personel
    Performansı raporunda başka bir rakam çıkardı: sözleşmenin
    personele TALEP ÜZERİNDEN bağlandığı, yalnızca imzalı/tamamlanmış
    sayıldığı ve imza anı boşsa oluşturulma gününe düşüldüğü kuralların
    hepsi o işlevde ve testli.

    Sözleşmeler önce okunuyor, talepler SONRA ve yalnızca o
    sözleşmelerin fırsat kimlikleriyle: talep eski olabilir, dönemle
    süzmek satışı sahipsiz bırakırdı.
  */
  const ayDonemi = { startKey: ay, endKey: ayinSonGunu(Number(ay.slice(0, 4)), Number(ay.slice(5, 7))), key: "ay" };
  const sozlesmeler = await tumSatirlar<PersonelSozlesmesi & { opportunity_id: string | null }>("sözleşmeler", (bas, son) =>
    supabase.from("crm_contracts")
      .select("opportunity_id,amount,status,signed_at,created_at")
      .eq("organization_id", org)
      .in("status", ["signed", "completed"])
      .or(`signed_at.gte.${ayDonemi.startKey},created_at.gte.${ayDonemi.startKey}`)
      .lte("created_at", `${ayDonemi.endKey}T23:59:59.999Z`)
      .order("opportunity_id")
      .range(bas, son));
  const firsatKimlikleri = [...new Set(sozlesmeler.map((c) => c.opportunity_id).filter((id): id is string => Boolean(id)))];
  const talepler = firsatKimlikleri.length
    ? await tumSatirlar<{ id: string; assigned_employee_id: string | null }>("talepler", (bas, son) =>
        supabase.from("crm_opportunities")
          .select("id,assigned_employee_id")
          .eq("organization_id", org)
          .in("id", firsatKimlikleri)
          .order("id")
          .range(bas, son))
    : [];
  const talebinPersoneli = new Map<string, string>();
  for (const t of talepler) if (t.assigned_employee_id) talebinPersoneli.set(t.id, t.assigned_employee_id);
  const gerceklesenHarita = sozlesmeleriBagla({ sozlesmeler, talebinPersoneli, donem: ayDonemi });

  const personel = ((pVeri ?? []) as Personel[]).filter((p) => CALISAN.includes(p.employment_status));
  const hedefler = (hVeri ?? []) as HedefKaydi[];
  const hedef = new Map(hedefler.map((h) => [h.employee_id, h.tutar]));
  const departman = new Map(((dVeri ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]));
  const toplam = hedefler.reduce((t, h) => t + h.tutar, 0);
  const konan = personel.filter((p) => hedef.has(p.id)).length;
  const hedefsiz = personel.length - konan;
  const oncekiSayi = ((oVeri ?? []) as HedefKaydi[]).length;
  /* Gerçekleşen toplamı yalnızca HEDEFİ OLANLARDAN: hedefi konmamış
     kişinin satışını paya katmak "hedefin %140'ı" gibi bir sayı
     üretirdi (raporla aynı kural). */
  const gerceklesenToplam = personel.reduce((t, p) => t + (hedef.has(p.id) ? gerceklesenHarita.get(p.id)?.tutar ?? 0 : 0), 0);
  const kalanToplam = personel.reduce((t, p) => {
    const h = hedef.get(p.id);
    return h === undefined ? t : t + Math.max(0, h - (gerceklesenHarita.get(p.id)?.tutar ?? 0));
  }, 0);
  const gecmisAy = ay < buAy;

  return <main className="talep cari ekip talepler teklifler liste-sayfa hedefler-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">İNSAN KAYNAKLARI</small>
        <h1>Satış hedefleri</h1>
        <p className="ek-alt">
          Aylık hedef kişi başına konur; Personel Performansı raporu gerçekleşmeyi bu rakama göre
          hesaplar. Hedef konmayan kişinin raporda hedef hücresi boş kalır — sıfır değil.
        </p>
      </div>
      <div className="talep-bas-eylem">
        {/*
          KOPYALAMA BAŞLIKTA, AYRI BİR FORM. Tablonun altında kendi
          kartındaydı ve sabit yükseklikli liste sayfasında dikey yer
          yiyordu. Ayrı form olması şart: aynı formun içindeki ikinci
          düğme, Enter'a basan kullanıcının yazdığı rakamların üstüne
          geçen ayı kopyalardı. Yalnızca bu ayda BOŞ olan satırlar
          doldurulur.
        */}
        {yonetir && oncekiSayi > 0 && hedefsiz > 0 ? (
          <form action={hedefleriOncekiAydanKopyala}>
            <input type="hidden" name="ay" value={ay} />
            <input type="hidden" name="kaynak" value={oncekiAy} />
            <button className="panel-secondary" type="submit" title={`${ayEtiketi(oncekiAy)} ayında ${oncekiSayi} kişiye hedef konmuştu`}>
              {ayEtiketi(oncekiAy)} hedeflerini kopyala
            </button>
          </form>
        ) : null}
        <Link className="panel-secondary" href="/panel/finance/raporlar?rapor=personel">Personel raporu</Link>
      </div>
    </header>

    <nav className="kayit-serit talep-serit" aria-label="Hedef özeti">
      <dl>
        <div><dt>Seçili ay</dt><dd>{ayEtiketi(ay)}</dd><small>{ay === buAy ? "ay sürüyor" : gecmisAy ? "geçmiş ay" : "gelecek ay"}</small></div>
        <div><dt>Toplam hedef</dt><dd className={toplam ? "cari-arti" : "talep-bos"}>{toplam ? money(toplam) : "—"}</dd><small>{konan} kişiye konmuş</small></div>
        {/* Gerçekleşen ve kalan yalnızca hedefi olanlardan; oran da
            aynı tabandan, yoksa "hedefin %140'ı" gibi bir sayı çıkar. */}
        <div>
          <dt>Gerçekleşen</dt>
          <dd className={gerceklesenToplam ? "cari-arti" : "talep-bos"}>{gerceklesenToplam ? money(gerceklesenToplam) : "—"}</dd>
          <small>{toplam ? `hedefin %${(gerceklesme(gerceklesenToplam, toplam) ?? 0).toLocaleString("tr-TR")}'i` : "hedef konmamış"}</small>
        </div>
        <div>
          <dt>Kalan</dt>
          <dd className={kalanToplam ? "talep-uyari" : toplam ? "cari-arti" : "talep-bos"}>{toplam ? money(kalanToplam) : "—"}</dd>
          <small>{toplam ? (kalanToplam ? (buAy === ay ? "ay sonuna kadar" : "tutturulamadı") : "hedefe ulaşıldı") : "—"}</small>
        </div>
        <div><dt>Hedefsiz personel</dt><dd className={hedefsiz ? "talep-uyari" : undefined}>{hedefsiz}</dd><small>{personel.length} kişilik kadro</small></div>
      </dl>
    </nav>

    {/* Ay seçici: listelerdeki segment şeridiyle aynı. Bağlantıların
        stili `.ek-arac .ek-segment a` ile geliyor, sarmalayıcı şart. */}
    <div className="ek-arac hedefler-arac">
      <nav className="ek-segment hedefler-aylar" aria-label="Hedef ayı">
        {secenekler.map((secenek) => (
          <Link
            key={secenek}
            href={`/panel/hr/hedefler?ay=${secenek}`}
            className={secenek === ay ? "is-active" : undefined}
            aria-current={secenek === ay ? "page" : undefined}
          >
            {ayEtiketi(secenek)}
          </Link>
        ))}
      </nav>
    </div>

    {/*
      KABUK PANELİN KENDİ KABUĞU: `talep-bilgi` kartı sabit yükseklikli
      liste sayfasında esneyen bir flex sütunu yapıyor, `talep-tablo`
      da içindeki asıl kaydırma alanı (os-shell.css). Önce kendi
      kurallarımı yazmıştım: formun kaydet satırı kartı taşırıp
      overflow:hidden ile kırpılıyordu, sonra da kendi "flex:1"
      kuralım panelin `>:not(.talep-izgara):not(.talep-bilgi)
      {flex:0 0 auto}` kuralına özgüllükte yeniliyordu — tablo sayfayı
      taşırıyor, başlık üst çubuğun altına kayıyordu.
    */}
    <section className="panel-card talep-bilgi hedefler-kart" aria-label={`${ayEtiketi(ay)} hedefleri`}>
      {personel.length === 0 ? (
        <div className="panel-empty hedefler-bos">
          <b>Kadroda çalışan personel yok</b>
          <p>Hedef koymadan önce <Link href="/panel/hr">personel kaydı</Link> açın.</p>
        </div>
      ) : (
        <form action={hedefleriKaydet} className="panel-form kayit-formu hedefler-form">
          <input type="hidden" name="ay" value={ay} />
          {/* Sarmal `crm-table-wrap`: panelin kendi mobil kart
              görünümü (≤760px) ona bağlı. Kendi sarmalımı yazdığımda
              tablo min-width'iyle kalıyordu ve telefonda hücreler
              ekranın dışına taşıyordu. */}
          {/* `talep-tablo` kaydırma alanı, `crm-table-wrap` telefon
              kart görünümü; ikisi birden gerekiyor. */}
          <div className="talep-tablo crm-table-wrap hedefler-tablo-sarmal">
            <table className="crm-data-table hedefler-tablo">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Departman</th>
                  <th className="crm-col-amount">Aylık hedef (₺)</th>
                  <th className="crm-col-amount">Gerçekleşen</th>
                  <th className="crm-col-amount">Kalan</th>
                </tr>
              </thead>
              <tbody>
                {personel.map((p) => {
                  const tutar = hedef.get(p.id) ?? null;
                  const gerceklesen = gerceklesenHarita.get(p.id)?.tutar ?? 0;
                  const adet = gerceklesenHarita.get(p.id)?.adet ?? 0;
                  const kalan = tutar === null ? null : Math.max(0, tutar - gerceklesen);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="crm-rep hedefler-kisi">
                          <i aria-hidden="true">{basHarf(p.full_name)}</i>
                          <span>
                            <Link href={`/panel/hr/${p.id}`}>{p.full_name}</Link>
                            <small>{p.job_title?.trim() || "—"}</small>
                          </span>
                        </span>
                      </td>
                      <td className="hedefler-dep" data-label="Departman">{(p.department_id && departman.get(p.department_id)) || "—"}</td>
                      <td className="crm-col-amount hedefler-tutar" data-label="Aylık hedef">
                        <input
                          name={`hedef_${p.id}`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          maxLength={18}
                          defaultValue={tutar === null ? "" : liraYazisi(tutar)}
                          placeholder="Hedef yok"
                          disabled={!yonetir}
                          aria-label={`${p.full_name} için ${ayEtiketi(ay)} hedefi`}
                        />
                      </td>
                      {/*
                        GERÇEKLEŞEN HEDEFTEN BAĞIMSIZ GÖSTERİLİYOR:
                        hedefi konmamış kişinin de satışı var ve onu
                        gizlemek "bu kişi hiç satmadı" gibi okunurdu.
                        KALAN ise hedefsiz satırda yok — hedefi
                        olmayanın "kalanı" tanımsız, sıfır değil.
                      */}
                      <td className="crm-col-amount" data-label="Gerçekleşen">
                        {gerceklesen ? (
                          /* Rakam ve altındaki bağlam TEK öğede: telefonda
                             hücre etiketli bir satıra dönüşüyor ve iki ayrı
                             çocuk, etiketle rakamı alt alta düşürüyordu. */
                          <span className="hedefler-deger">
                            {money(gerceklesen)}
                            {adet ? <small>{adet} sözleşme</small> : null}
                          </span>
                        ) : <span className="talep-bos">—</span>}
                      </td>
                      <td className="crm-col-amount" data-label="Kalan">
                        {tutar === null || kalan === null ? <span className="talep-bos">—</span>
                          : kalan === 0 ? <span className="hedefler-tuttu">Tamam</span>
                          : (
                            <span className="hedefler-deger">
                              {money(kalan)}
                              <small>%{(gerceklesme(gerceklesen, tutar) ?? 0).toLocaleString("tr-TR")}</small>
                            </span>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {yonetir ? (
            <div className="wide panel-form-actions kayit-formu-eylem hedefler-eylem">
              <p>
                Tutarı boş bırakmak hedefi <b>kaldırır</b>; sıfır hedef için <b>0</b> yazın.
                Binlik ayırıcı nokta, kuruş virgül: <b>30.000,00</b>
              </p>
              <button className="panel-primary" type="submit">Hedefleri kaydet</button>
            </div>
          ) : (
            <p className="hedefler-not">
              Hedefleri yalnızca Kurum Sahibi ve Yönetici değiştirebilir; bu ekranı görüntüleyebilirsiniz.
            </p>
          )}
        </form>
      )}
    </section>

  </main>;
}
