import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import {
  asamaPanosuKur,
  SABLON_DISI_KOLONU,
  VARSAYILAN_PANO_SABLONU,
  type OperasyonIsi,
  type SablonAsamasi,
} from "@/lib/operasyon-panosu";
import { todayIstanbul, priorityNames } from "../ops-shared";
import { PanelDrawer } from "../../components/panel-drawer";
import { WorkflowCreateForm } from "../workflow-create-form";
import { PanoTahtasi } from "./pano-tahtasi";
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

  BOŞ KOLON GÖSTERİLMİYOR (gerekçe lib/operasyon-panosu.ts'te): sekiz aşama +
  Tamamlandı dokuz kolon ediyor ve pano yatay kaydırmadan görünmez oluyordu.
  Kolon başlığındaki numara ŞABLONDAKİ sıra, panodaki sıra değil — atlanan
  aşamalar böyle görünüyor; gizlenenler de altta tek satırda sayılıyor.

  TARİH KARTTAN GİRİLİYOR. Canlıda (27.09.2026) sekiz işin sekizinde de
  aşama tarihi boştu: pano gecikme uyarısı üretemiyor, kart sıralaması
  anlamsız kalıyor ve operasyoncunun asıl derdi olan PLANLAMA yapılamıyor.
  Yetkisi olmayana alan gösterilmiyor (actions.ts isManagerOrAssignee ile
  aynı kural) — kaydetmeyen bir alan göstermek yanıltıcı olurdu.

  SÜZGEÇ GERİ GELDİ — ama rozet olarak değil. İlk denemede süzgeçler
  tıklanabilir rozetlerdi; müşteri adları şirket unvanı olunca
  ("… LİMİTED ŞİRKETİ") iki satıra taşıyor ve panonun kendisini ekranın
  dışına itiyorlardı. Bu sefer İşler sayfasıyla AYNI kalıpta: sabit
  yükseklikte tek satırlık form kartı. Panonun bir bakışta görünmesi
  bozulmuyor, üstelik süzme modülde yeniden mümkün (Çalışma Çizelgesi
  27.09.2026'da kaldırılmıştı, o günden beri hiçbir yerde yoktu).

  Bu dosya yalnızca VERİYİ hazırlıyor; sürükle-bırak, hızlı bakış ve
  düğmeler pano-tahtasi.tsx'te (istemci bileşeni).
*/

type AdimSatiri = {
  id: string;
  title: string;
  sort_order: number;
  due_date: string | null;
  is_completed: boolean;
  assigned_employee_id: string | null;
  status: string;
  completed_at: string | null;
  /** Görevin aşaması; kolon buradan çıkıyor (lib/operasyon-panosu.ts: kolonAdi). */
  phase_title: string | null;
};
type Kayit = OperasyonIsi & { operation_steps: AdimSatiri[]; step_template_set: string | null };

export default async function OperationsPanoPage({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string; arama?: string; sorumlu?: string; oncelik?: string; mesaj?: string }>;
}) {
  const { tur: istenenTur, arama, sorumlu: seciliSorumlu, oncelik: seciliOncelik, mesaj } = await searchParams;
  const aranan = (arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const yalnizOkunmamis = mesaj === "yeni";
  const { supabase, membership, modules, userId, izin } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const [{ data, error }, { data: employees }, { data: sablonSatirlari }, { data: turSatirlari }, { data: benimKaydim }] = await Promise.all([
    supabase
      .from("operation_workflows")
      .select(
        "id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,step_template_set,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id,status,completed_at,phase_title)",
      )
      .eq("organization_id", membership.organization_id)
      // İptal edilen ve arşivdeki işler panoyu doldurmasın
      .not("status", "in", "(cancelled,archived)"),
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id),
    // Kolonlar kurumun şablonundan; yoksa varsayılan sekiz aşama.
    supabase
      .from("organization_step_templates")
      .select("title,sort_order,phase_title,set_code")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("organization_step_template_sets")
      .select("code,name,is_default")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("sort_order")
      .order("code"),
    // Taşıma ve tarih yetkisi için: işin sorumlusu ben miyim?
    supabase
      .from("hr_employees")
      .select("id")
      .eq("organization_id", membership.organization_id)
      .eq("user_id", userId)
      .eq("employment_status", "active")
      .maybeSingle(),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);

  /*
    OKUNMAMIŞ MÜŞTERİ MESAJI. İşler sayfasında en görünür sinyal buydu ama
    panoda hiç yoktu: pano operasyoncunun gün içinde baktığı ekran, müşteri
    yazdığında burada da görünmeli. Sayım İşler'dekiyle aynı sorgu.
  */
  const panoIsIdleri = ((data ?? []) as { id: string }[]).map((satir) => satir.id);
  const [{ data: okunmamisSatirlar }, { count: arsivSayisi }] = await Promise.all([
    panoIsIdleri.length
      ? supabase.from("customer_file_messages").select("workflow_id")
          .eq("organization_id", membership.organization_id).eq("sender_type", "customer")
          .is("read_at", null).in("workflow_id", panoIsIdleri)
      : Promise.resolve({ data: [] as { workflow_id: string | null }[] }),
    supabase.from("operation_workflows").select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("status", "archived"),
  ]);
  const okunmamis = new Map<string, number>();
  for (const satir of (okunmamisSatirlar ?? []) as { workflow_id: string | null }[]) {
    if (satir.workflow_id) okunmamis.set(satir.workflow_id, (okunmamis.get(satir.workflow_id) ?? 0) + 1);
  }
  const toplamOkunmamis = [...okunmamis.values()].reduce((a, c) => a + c, 0);

  /*
    ÇALIŞMA TÜRÜ SEKMESİ. Kurumun birden çok görev listesi olabiliyor (tez,
    makale, ödev) ve kolonlar listeye göre değişiyor; tek bir panoda
    hepsini göstermek, tez işlerini makalenin kolonlarına ya da "şablon
    dışı"na düşürürdü. Her tür kendi panosunda.

    Türü seçilmemiş iş öntanımlı türün panosunda görünür —
    add_standard_operation_steps da adımlarını oradan üretiyor.
  */
  const turler = (turSatirlari ?? []) as { code: string; name: string; is_default: boolean }[];
  const ontanimliTur = turler.find((tur) => tur.is_default)?.code ?? turler[0]?.code ?? null;
  const seciliTur = turler.find((tur) => tur.code === istenenTur)?.code ?? ontanimliTur;

  const tumSablon = (sablonSatirlari ?? []) as (SablonAsamasi & { set_code?: string | null })[];
  const kurumSablonu = seciliTur ? tumSablon.filter((satir) => (satir.set_code ?? "varsayilan") === seciliTur) : tumSablon;
  const sablon = kurumSablonu.length ? kurumSablonu : VARSAYILAN_PANO_SABLONU;
  const kendiSablonu = kurumSablonu.length > 0;

  const sorumlular = new Map(
    ((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]),
  );
  const tumKayitlar = (data ?? []) as Kayit[];
  const turKayitlari = seciliTur
    ? tumKayitlar.filter((kayit) => (kayit.step_template_set ?? ontanimliTur) === seciliTur)
    : tumKayitlar;

  /*
    SÜZGEÇ PANO KURULMADAN ÖNCE. Kartları sonradan elemek kolon
    başlıklarındaki sayıyı ve "içinde iş olmayan aşama gizlendi"
    satırını yanlış yapardı: süzgeçten sonra boşalan kolon "aşama yok"
    diye görünürdü. Eleme kaynakta.
  */
  const kayitlar = turKayitlari.filter((kayit) => {
    if (aranan) {
      const saman = [kayit.title, kayit.customer_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      if (!saman.includes(aranan)) return false;
    }
    if (seciliSorumlu) {
      if (seciliSorumlu === "yok" ? kayit.assigned_employee_id : kayit.assigned_employee_id !== seciliSorumlu) return false;
    }
    if (seciliOncelik && kayit.priority !== seciliOncelik) return false;
    if (yalnizOkunmamis && !okunmamis.get(kayit.id)) return false;
    return true;
  });
  const tumIsler: OperasyonIsi[] = kayitlar.map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] }));

  /*
    Aşamaları yöneticiler ve İŞİN sorumlusu değiştirebiliyor (actions.ts
    isManagerOrAssignee ile aynı kural). Yetkisi olmayanın kartı
    sürüklenemiyor ve tarih alanı gösterilmiyor — kaydetmeyen bir alan
    göstermek yanıltıcı olurdu. Asıl karar yine sunucuda ve RLS'te.
  */
  const benimPersonelId = (benimKaydim as { id?: string } | null)?.id ?? null;
  const yonetici = izin("operations.is.yonet");
  const yetkiliIsler = kayitlar
    .filter((kayit) => yonetici || Boolean(benimPersonelId && benimPersonelId === kayit.assigned_employee_id))
    .map((kayit) => kayit.id);

  const bugun = todayIstanbul();
  const { kolonlar } = asamaPanosuKur(tumIsler, sablon, (id) => sorumlular.get(id) ?? null, bugun);
  const kartlar = kolonlar.flatMap((kolon) => kolon.kartlar);
  const toplamKart = kartlar.length;
  const sablonDisi = kolonlar.find((kolon) => kolon.anahtar === SABLON_DISI_KOLONU)?.kartlar.length ?? 0;
  // Sürmekte olan işler arasında tarihi girilmemiş olanlar (bitmiş işte aşama yok).
  const tarihsiz = kartlar.filter((kart) => kart.guncelAsamaId && !kart.tarih).length;
  const surmekte = kartlar.filter((kart) => kart.guncelAsamaId).length;
  const geciken = kartlar.filter((kart) => kart.guncelAsamaId && kart.tarih && kart.tarih < bugun).length;
  const tamamlanan = kartlar.filter((kart) => kart.tamamlandi).length;
  /*
    İlerleme İşler sayfasıyla AYNI hesap: bütün adımların kaçı bitti.
    Kart başına ortalama almak az adımlı işi çok adımlıyla eşitlerdi.
  */
  const tumAdimlar = kayitlar.flatMap((kayit) => kayit.operation_steps ?? []);
  const ilerleme = tumAdimlar.length
    ? Math.round((tumAdimlar.filter((adim) => adim.is_completed).length / tumAdimlar.length) * 100)
    : 0;
  const suzuluyor = Boolean(aranan || seciliSorumlu || seciliOncelik || yalnizOkunmamis);
  const sorumluSecenekleri = [...sorumlular.entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
  const turSorgusu = seciliTur ? `tur=${encodeURIComponent(seciliTur)}` : "";

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">OPERASYON / PANO</small>
          <h1>Pano</h1>
          <p>
            İşler bulundukları aşamanın kolonunda. Kolonlar{" "}
            {kendiSablonu
              ? `kurumunuzun ${turler.length > 1 ? `“${turler.find((tur) => tur.code === seciliTur)?.name ?? ""}” ` : ""}görev listesinden`
              : "varsayılan sekiz aşamadan"} geliyor; kartı sürükleyerek
            ya da düğmeyle başka aşamaya taşıyabilir, “Aşamalar” ile işin tamamını panodan çıkmadan görebilirsiniz.
          </p>
        </div>
        {/* Başlık eylemleri İşler sayfasıyla aynı: sayı · yeni mesaj · arşiv · yeni iş. */}
        <div className="panel-page-actions">
          <span className="status-pill">{toplamKart} iş</span>
          {toplamOkunmamis ? (
            <Link className="status-pill" data-tone="danger" href={`/panel/operations/pano?${[turSorgusu, "mesaj=yeni"].filter(Boolean).join("&")}`}>
              {toplamOkunmamis} yeni müşteri mesajı
            </Link>
          ) : null}
          <Link className="panel-secondary" href="/panel/operations/sablon">Adım şablonu</Link>
          <Link className="panel-secondary" href="/panel/operations/arsiv">Arşiv ({arsivSayisi ?? 0})</Link>
          {yonetici ? (
            <PanelDrawer triggerLabel="+ Yeni iş" kicker="YENİ KAYIT" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin.">
              <WorkflowCreateForm />
            </PanelDrawer>
          ) : null}
        </div>
      </div>
      <div className="module-tab-panel">
                {/*
          ÖLÇÜLER VE SÜZGEÇ TEK ŞERİTTE.

          İlk denemede İşler sayfasının birebir kopyasıydı: dört ölçü
          KARTI (214px) + süzgeç kartı (108px). Ölçtüm, panoyu 764px
          aşağı itiyordu — 950px'lik ekranda panodan 186px görünüyor.
          Panonun bütün değeri bir bakışta görünmesi; kartları olduğu
          gibi taşımak İşler'in kalitesini değil, İşler'in BİÇİMİNİ
          kopyalamak olurdu.

          Aynı bilgi, tek satırlık şeritte: solda sayılar, sağda
          süzgeç. Tablo sayfasında kart doğru, kanban'da şerit.
        */}
        <section className="panel-card ops-pano-serit">
          <div className="ops-pano-olculer">
            <span><b>{surmekte}</b> süren</span>
            <span data-tone={geciken ? "danger" : undefined}><b>{geciken}</b> geciken aşama</span>
            <span data-tone={tarihsiz ? "warning" : undefined}><b>{tarihsiz}</b> tarihsiz aşama</span>
            <span><b>%{ilerleme}</b> ilerleme</span>
            {tamamlanan ? <span><b>{tamamlanan}</b> tamamlandı</span> : null}
          </div>
          <form method="get" className="ops-pano-suzgec">
            {/*
              ÇALIŞMA TÜRÜ SÜZGECİN İÇİNDE. Üstte ayrı bir düğme şeridiydi
              ("Varsayılan · Tez · Standart") ve iki sorunu vardı: panelin
              kenarlığına yapışıyordu (sistem kuralı yalnızca section ve
              .panel-card'ı içeri alıyor, nav listede yok) ve aynı işi
              yapan dört denetimden biri tek başına başka bir biçimdeydi.
              Tür de bir süzgeç: hangi işleri ve hangi kolonları
              göreceğini seçiyor.
            */}
            {turler.length > 1 ? (
              <select name="tur" defaultValue={seciliTur ?? ""} aria-label="Çalışma türü">
                {turler.map((tur) => <option key={tur.code} value={tur.code}>{tur.name}</option>)}
              </select>
            ) : seciliTur ? (
              <input type="hidden" name="tur" value={seciliTur} />
            ) : null}
            <input name="arama" defaultValue={arama ?? ""} placeholder="İş / müşteri ara" aria-label="İş ya da müşteri ara" />
            <select name="sorumlu" defaultValue={seciliSorumlu ?? ""} aria-label="Sorumlu">
              <option value="">Sorumlu: tümü</option>
              <option value="yok">Atanmamış</option>
              {sorumluSecenekleri.map(([id, ad]) => <option key={id} value={id}>{ad}</option>)}
            </select>
            <select name="oncelik" defaultValue={seciliOncelik ?? ""} aria-label="Öncelik">
              <option value="">Öncelik: tümü</option>
              {["urgent", "high", "normal", "low"].map((deger) => (
                <option key={deger} value={deger}>{priorityNames[deger] ?? deger}</option>
              ))}
            </select>
            <select name="mesaj" defaultValue={yalnizOkunmamis ? "yeni" : ""} aria-label="Müşteri mesajı">
              <option value="">Mesaj: tümü</option>
              <option value="yeni">Okunmamış mesajı olan</option>
            </select>
            <button className="panel-primary">Filtrele</button>
            {suzuluyor ? (
              <Link className="panel-secondary" href={`/panel/operations/pano${turSorgusu ? `?${turSorgusu}` : ""}`}>Temizle</Link>
            ) : null}
          </form>
        </section>

        {tarihsiz ? (
          /*
            Panonun en önemli uyarısı bu: tarih yoksa gecikme uyarısı,
            takvim ve hatırlatma zinciri sessizce çalışmıyor. Sayı yerine
            "tarih girin" demek eksiğin büyüklüğünü göstermezdi.
          */
          <p className="ops-pano-uyari">
            Tarihi girilmemiş aşamalar “gecikti / yaklaştı” uyarısı üretmiyor ve Takvim’de görünmüyor. Kartlardaki
            tarih alanına tek tek yazabilir, ya da işin detayındaki “Tarihleri dağıt” ile bütün aşamaları işin
            takvimine bir kerede yayabilirsiniz.
          </p>
        ) : null}
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
            <PanoTahtasi kolonlar={kolonlar} bugun={bugun} yetkiliIsler={yetkiliIsler} okunmamis={Object.fromEntries(okunmamis)} />
          </>
        ) : (
          <p className="panel-empty">
            {suzuluyor ? "Eşleşen iş bulunamadı. Süzgeci temizleyip tekrar deneyin." : "Panoda gösterilecek iş bulunmuyor."}
          </p>
        )}
      </div>
    </div>
  );
}
