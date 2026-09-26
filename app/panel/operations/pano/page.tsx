import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { OperationsTabs } from "../operations-tabs";
import {
  asamaPanosuKur,
  SABLON_DISI_KOLONU,
  VARSAYILAN_PANO_SABLONU,
  type CizelgeIsi,
  type SablonAsamasi,
} from "@/lib/operasyon-cizelge";
import { todayIstanbul } from "../ops-shared";
import { PanoTahtasi } from "./pano-tahtasi";
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

  TARİH KARTTAN GİRİLİYOR. Canlıda (27.09.2026) sekiz işin sekizinde de
  aşama tarihi boştu: pano gecikme uyarısı üretemiyor, kart sıralaması
  anlamsız kalıyor ve operasyoncunun asıl derdi olan PLANLAMA yapılamıyor.
  Yetkisi olmayana alan gösterilmiyor (çizelgedeki kuralın aynısı) —
  kaydetmeyen bir alan göstermek yanıltıcı olurdu.

  SÜZGEÇ YOK, bilerek. Denendi ve kaldırıldı: müşteri adları şirket unvanı
  olduğunda ("… LİMİTED ŞİRKETİ") rozetler iki satıra taşıyor ve panonun
  kendisini ekranın dışına itiyor — oysa panonun bütün değeri bir bakışta
  görünmesi. Süzme ihtiyacı Çalışma Çizelgesi'nde karşılanıyor.

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
};
type Kayit = CizelgeIsi & { operation_steps: AdimSatiri[] };

export default async function OperationsPanoPage() {
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");

  const [{ data, error }, { data: employees }, { data: sablonSatirlari }, { data: benimKaydim }] = await Promise.all([
    supabase
      .from("operation_workflows")
      .select(
        "id,title,customer_name,status,priority,start_date,due_date,assigned_employee_id,operation_steps(id,title,sort_order,due_date,is_completed,assigned_employee_id,status,completed_at)",
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

  const kurumSablonu = (sablonSatirlari ?? []) as SablonAsamasi[];
  const sablon = kurumSablonu.length ? kurumSablonu : VARSAYILAN_PANO_SABLONU;
  const kendiSablonu = kurumSablonu.length > 0;

  const sorumlular = new Map(
    ((employees ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]),
  );
  const kayitlar = (data ?? []) as Kayit[];
  const tumIsler: CizelgeIsi[] = kayitlar.map((kayit) => ({ ...kayit, steps: kayit.operation_steps ?? [] }));

  /*
    Aşamaları yöneticiler ve İŞİN sorumlusu değiştirebiliyor (actions.ts
    isManagerOrAssignee ile aynı kural). Yetkisi olmayanın kartı
    sürüklenemiyor ve tarih alanı gösterilmiyor — kaydetmeyen bir alan
    göstermek yanıltıcı olurdu. Asıl karar yine sunucuda ve RLS'te.
  */
  const benimPersonelId = (benimKaydim as { id?: string } | null)?.id ?? null;
  const yonetici = ["owner", "admin", "manager"].includes(membership.role);
  const yetkiliIsler = kayitlar
    .filter((kayit) => yonetici || Boolean(benimPersonelId && benimPersonelId === kayit.assigned_employee_id))
    .map((kayit) => kayit.id);

  const bugun = todayIstanbul();
  const { kolonlar, bosAsamalar } = asamaPanosuKur(tumIsler, sablon, (id) => sorumlular.get(id) ?? null, bugun);
  const kartlar = kolonlar.flatMap((kolon) => kolon.kartlar);
  const toplamKart = kartlar.length;
  const sablonDisi = kolonlar.find((kolon) => kolon.anahtar === SABLON_DISI_KOLONU)?.kartlar.length ?? 0;
  // Sürmekte olan işler arasında tarihi girilmemiş olanlar (bitmiş işte aşama yok).
  const tarihsiz = kartlar.filter((kart) => kart.guncelAsamaId && !kart.tarih).length;
  const surmekte = kartlar.filter((kart) => kart.guncelAsamaId).length;

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div>
          <small className="panel-kicker">OPERASYON / PANO</small>
          <h1>Pano</h1>
          <p>
            İşler bulundukları aşamanın kolonunda. Kolonlar{" "}
            {kendiSablonu ? "kurumunuzun adım şablonundan" : "varsayılan sekiz aşamadan"} geliyor; kartı sürükleyerek
            ya da düğmeyle başka aşamaya taşıyabilir, “Aşamalar” ile işin tamamını panodan çıkmadan görebilirsiniz.
          </p>
        </div>
        <div className="panel-page-actions">
          <span className="status-pill">{toplamKart} iş</span>
          <Link className="panel-secondary" href="/panel/operations/sablon">Adım şablonu</Link>
        </div>
      </div>
      <OperationsTabs active="pano" />
      <div className="module-tab-panel">
        {tarihsiz ? (
          /*
            Panonun en önemli uyarısı bu: tarih yoksa gecikme uyarısı,
            takvim ve hatırlatma zinciri sessizce çalışmıyor. Sayı yerine
            "tarih girin" demek eksiğin büyüklüğünü göstermezdi.
          */
          <p className="ops-pano-uyari">
            Süren {surmekte} işin {tarihsiz === surmekte ? "hepsinde" : `${tarihsiz} tanesinde`} şu anki aşamanın
            tarihi girilmemiş. Tarih olmadan pano “gecikti / yaklaştı” uyarısı üretemiyor ve Takvim bu işleri
            göstermiyor. Kartlardaki tarih alanına doğrudan yazabilirsiniz.
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
            <PanoTahtasi kolonlar={kolonlar} bugun={bugun} yetkiliIsler={yetkiliIsler} />
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
