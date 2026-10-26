import Link from "next/link";
import type { CSSProperties } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { bakiyeyeSigdir, taksitleriDagit } from "@/lib/taksit-dagitimi";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaytrStatus } from "@/lib/paytr-status";
import { normalizePhone } from "@/lib/whatsapp-send";
import { OdemeBaglantilari, OdemeBaglantisiFormu, type OdemeBaglantisiSatiri } from "./odeme-baglantisi";
import { PanelDrawer } from "../components/panel-drawer";
import { SatirTiklama } from "../crm/satir-tiklama";
import { elleGirilenTur } from "@/lib/cari-hareket";
import { createAdditionalService, createCollection, createRefund, deleteParty, hareketiDuzelt, hareketiSil } from "./actions";
import { ConfirmDeleteButton } from "./confirm-delete-button";
import { ekHizmetiTaksitlerdenCikar, ekHizmetiTaksitlereDagit, taksitiDuzenle, taksitSecenegiDegistir } from "../finance/actions";
import { type FinTone } from "../finance/finance-ui";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";
import { EkHizmetTaksitFormu, TaksitDuzenleFormu, TaksitPlaniFormu } from "./taksit-formlari";
import { liraYazisi } from "@/lib/turkish-amount";

/*
  CARİ HESAP İÇERİĞİ (2026-10): müşteri sayfasında ortada açılan pencere.

  Eskiden ayrı bir sayfaydı (/panel/accounts/[id]); müşterinin kimliği,
  yazışmaları ve kayıtları başka bir sayfadaydı ve ikisi arasında gidip
  gelmek gerekiyordu. Artık müşteri sayfası tek yer, cari onun içinde bir
  pencere ("Müşteri sorgula" gibi). Eski adres buraya yönleniyor.

  İçerik eski sayfanın aynısı: işlemler (ödeme linki, tahsilat, ek hizmet,
  iade, sil), bakiye şeridi, hareket dökümü, sözleşmeler, ödeme
  bağlantıları, ödeme takvimi ve bakiyenin nasıl hesaplandığı. Müşteri
  kartı ve yazışmalar müşteri sayfasında olduğu için burada yok.
*/

const money = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n / 100);
/* Dilim şart: bu yardımcıya gün sütunları (transaction_date, due_date) KADAR
   an sütunları da geliyor — "Kayıt zamanı" (created_at) ve sözleşmenin imza
   günü (signed_at). Dilimsizken sunucunun UTC'si yazılıyordu ve Türkiye'de
   gece 00:00–03:00 arasında kaydedilen her hareket bir önceki güne düşüyordu;
   para kütüğünde bu, ayın 1'indeki bir tahsilatı önceki aya yazmak demek. */
const date = (v: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric" }).format(new Date(v));

type Entry = {
  id: string;
  entry_type: "debit" | "credit";
  amount: number;
  description: string;
  reference_no: string | null;
  source_type: string | null;
  transaction_date: string;
  created_at: string;
  /** Ek hizmet sözleşme taksitlerine dağıtıldıysa o plan (20261026120852). */
  payment_plan_id: string | null;
};
type Party = { id: string; name: string; email: string | null; phone: string | null; account_entries: Entry[] };
type Contract = { id: string; contract_no: string; title: string; amount: number; status: string; signed_at: string | null; payment_plan_id: string | null };
type Taksit = { id: string; payment_plan_id: string; installment_no: number; due_date: string | null; amount: number; status: string };

// Hareketin türü ve rozet tonu (etiket kuralı öncekiyle aynı)
function entryKind(e: Entry): { label: string; tone: FinTone } {
  if (e.source_type === "adjustment") return { label: "İade", tone: "warning" };
  if (e.entry_type === "credit") return { label: "Tahsilat", tone: "success" };
  if (e.source_type === "manual" && e.description.startsWith("Ek hizmet ·")) return { label: "Ek Hizmet", tone: "gold" };
  return { label: "Sözleşme", tone: "info" };
}

// Hareketin nereden geldiği (account_entries.source_type), ayrıntı penceresi için.
const KAYNAK: Record<string, string> = {
  manual: "Elle girildi",
  invoice: "Fatura",
  payment: "Ödeme",
  expense: "Gider",
  adjustment: "İade / düzeltme",
  crm_contract: "Sözleşme",
};

const IC_ANAHTAR = /^[A-Z]{2,8}:[0-9a-f-]{36}$/i;

const TAKSIT_DURUMU: Record<string, { ad: string; ton: string }> = {
  odendi: { ad: "Ödendi", ton: "success" },
  kismi: { ad: "Kısmen ödendi", ton: "info" },
  bekliyor: { ad: "Bekliyor", ton: "neutral" },
  gecikti: { ad: "Gecikti", ton: "danger" },
  iptal: { ad: "İptal", ton: "neutral" },
};

export async function CariHesapIcerigi({ partyId }: { partyId: string }) {
  const { supabase, membership, modules, isPlatformOwner, izin } = await getPanelContext();
  if (!modules.some((m) => m.code === "accounts")) return null;
  const org = membership.organization_id;
  const [{ data: party, error }, { data: contracts, error: contractError }] = await Promise.all([
    supabase
      .from("account_parties")
      .select("id,name,email,phone,account_entries(id,entry_type,amount,description,reference_no,source_type,transaction_date,created_at,payment_plan_id)")
      .eq("id", partyId)
      .eq("organization_id", org)
      .maybeSingle(),
    supabase
      .from("crm_contracts")
      .select("id,contract_no,title,amount,status,signed_at,payment_plan_id")
      .eq("party_id", partyId)
      .eq("organization_id", org)
      .in("status", ["signed", "completed"])
      .order("created_at", { ascending: false }),
  ]);
  if (error || !party) return <p className="ic-akis-bos">Cari hesap bulunamadı veya erişiminiz yok.</p>;
  if (contractError) throw new Error("Sözleşmeler okunamadı: " + contractError.message);
  const current = party as Party;
  const sozlesmeler = (contracts ?? []) as Contract[];

  /*
    ÖDEME TAKVİMİ (sözleşme detayıyla eşitleme): bu carinin sözleşmelerine
    bağlı taksitler, vade sırasıyla. Okunamazsa bölüm boş.
  */
  const planlar = new Map(sozlesmeler.filter((c) => c.payment_plan_id).map((c) => [c.payment_plan_id as string, c]));
  const [{ data: taksitData }, { data: planData, error: planError }] = planlar.size
    ? await Promise.all([
        supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status").eq("organization_id", org).in("payment_plan_id", [...planlar.keys()]).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("payment_plans").select("id,total_amount").eq("organization_id", org).in("id", [...planlar.keys()]),
      ])
    : [{ data: [] }, { data: [], error: null }];
  const taksitler = (taksitData ?? []) as Taksit[];
  /* Planın toplamı sözleşme tutarından büyük olabilir: taksitlere dağıtılan
     ek hizmetler ona eklenir (20261026120852). Taksit pencereleri toplamı
     buradan alıyor; okunamazsa sözleşme tutarına düşmek yerine hata —
     yanlış toplamla açılan pencere her kayıtta "toplam tutmuyor" derdi. */
  if (planError) throw new Error("Ödeme planları okunamadı: " + planError.message);
  const planToplami = new Map(((planData ?? []) as { id: string; total_amount: number }[]).map((p) => [p.id, Number(p.total_amount)]));

  /*
    Ödeme bağlantıları (PayTR): payment_links kullanıcıya kapalı (RLS
    politikası yok), service_role ile okunuyor. Cari yukarıda kullanıcının
    kendi RLS'iyle bu kurumda bulundu; sorgu da kurum ve cariyle sınırlı.
    Son 10 bağlantı yalnızca listeleniyor; bekleyen sayısı ayrı sayılıyor.
  */
  const admin = createAdminClient();
  const [paytr, { data: linkData }, { count: bekleyenLink }] = await Promise.all([
    getPaytrStatus(org),
    admin
      ? admin.from("payment_links").select("id,url,amount,note,status,created_at,paid_at").eq("organization_id", org).eq("party_id", partyId).eq("purpose", "account").order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    admin
      ? admin.from("payment_links").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("party_id", partyId).eq("purpose", "account").eq("status", "active")
      : Promise.resolve({ count: 0 }),
  ]);
  const odemeLinkleri = (linkData ?? []) as OdemeBaglantisiSatiri[];
  const paytrHazir = Boolean(paytr.available && paytr.connected && paytr.enabled);

  const entries = [...(current.account_entries ?? [])].sort(
    (a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at),
  );
  const contractDebt = sozlesmeler.reduce((sum, c) => sum + Number(c.amount), 0);
  const ledgerDebt = entries.filter((e) => e.entry_type === "debit" && e.source_type !== "adjustment").reduce((s, e) => s + Number(e.amount), 0);
  const additionalServices = entries
    .filter((e) => e.entry_type === "debit" && e.source_type === "manual" && e.description.startsWith("Ek hizmet ·"))
    .reduce((s, e) => s + Number(e.amount), 0);
  const debt = contractDebt ? contractDebt + additionalServices : ledgerDebt;
  const recorded = entries.filter((e) => e.entry_type === "credit").reduce((s, e) => s + Number(e.amount), 0);
  const refunds = entries.filter((e) => e.entry_type === "debit" && e.source_type === "adjustment").reduce((s, e) => s + Number(e.amount), 0);
  const collections = Math.min(recorded, debt + refunds);
  const balance = Math.max(0, debt + refunds - collections);
  const refundable = Math.max(0, collections - refunds);
  // Taksit durumları cari dökümünden türetilir (lib/taksit-dagitimi.ts): net tahsilat en eski vadeden dağıtılır.
  // Plan sözleşmeden büyük olabiliyor: kalanlar açık bakiyeyi aşmasın (bakiyeyeSigdir).
  const dagitilmis = bakiyeyeSigdir(taksitleriDagit(taksitler, collections - refunds, todayInIstanbul()), balance);
  const gecikenTaksitler = dagitilmis.filter((t) => t.durum === "gecikti");
  const gecikenTutar = gecikenTaksitler.reduce((sum, t) => sum + t.kalan, 0);
  // Silme yıkıcı: hareket dökümünü de götürür (CASCADE). Sunucu eylemi ayrıca denetliyor.
  const canDelete = isPlatformOwner || izin("finance.cari.sil");
  // Elle girilen hareketi düzeltme/silme: hareket girişiyle aynı yetki.
  const hareketDuzeltir = isPlatformOwner || izin("finance.cari.yonet");
  // Taksit vadesi tahsilat girişiyle aynı yetki (finans kaydı yönetimi).
  const vadeDegistirir = modules.some((m) => m.code === "finance") && (isPlatformOwner || izin("finance.kayit.yonet"));
  /* Taksit seçeneği formu için plan başına özet: ödenen, kalan, açık taksit sayısı, ilk açık vade. */
  const planOzetleri = [...planlar.entries()].map(([planId, sozlesme]) => {
    const liste = dagitilmis.filter((t) => t.payment_plan_id === planId && t.durum !== "iptal");
    const acik = liste.filter((t) => t.kalan > 0);
    const toplam = planToplami.get(planId) ?? Number(sozlesme.amount);
    return {
      planId,
      sozlesme,
      toplam,
      ekHizmet: toplam - Number(sozlesme.amount),
      odenen: liste.reduce((t, x) => t + x.odenen, 0),
      kalan: toplam - liste.reduce((t, x) => t + x.odenen, 0),
      acikAdet: acik.length,
      ilkVade: acik[0]?.due_date ?? todayInIstanbul(),
    };
  }).filter((p) => p.kalan > 0);
  /* Ödeme takvimi pencerelerinin önizlemesi (taksit-formlari.tsx): plan,
     sunucu işleminin okuduğu gibi (finance/actions.ts planiOku) — iptal
     hariç, taksit numarasına göre, vadesiz taksit bugünle; ödenen kısım
     cari dağılımından (sunucu da aynı dağılımı kullanıyor). */
  const planTaksitleri = (planId: string) => dagitilmis
    .filter((t) => t.payment_plan_id === planId && t.status !== "cancelled")
    .sort((a, b) => a.installment_no - b.installment_no)
    .map((t, i) => ({ id: t.id, no: i + 1, vade: t.due_date ?? todayInIstanbul(), tutar: Number(t.amount), odenen: t.odenen }));
  /* Ek hizmeti taksitlere dağıtma penceresi için: taksiti olan her plan.
     Plan sözleşme tutarının tamamı ödenmiş olsa da listede (ters işlem
     için gerekebilir); açık taksit yoksa önizleme bunu söylüyor. */
  const dagitimPlanlari = [...planlar.entries()]
    .filter(([planId]) => taksitler.some((t) => t.payment_plan_id === planId))
    .map(([planId, sozlesme]) => ({ planId, ad: sozlesme.contract_no, toplam: planToplami.get(planId) ?? Number(sozlesme.amount), taksitler: planTaksitleri(planId) }));
  // Sözleşmeye bağlantı yalnızca CRM'i olana: yoksa sayfa hata verirdi.
  const crmVar = modules.some((m) => m.code === "crm");
  const tahsilOrani = debt + refunds > 0 ? Math.round((collections / (debt + refunds)) * 100) : 0;
  const telefonVar = Boolean(normalizePhone(String(current.phone ?? "")));
  const epostaVar = Boolean(current.email?.trim());

  return (
    <div className="cari-pencere">
      <div className="cari-pencere-eylem">
        {balance > 0 ? (
          <PanelDrawer
            triggerLabel="Ödeme linki"
            triggerClassName="panel-secondary"
            kicker={`CARİ · ${current.name}`}
            title="Ödeme linki"
            description="Müşterinin söylediği tutarla PayTR bağlantısı oluşturun ve gönderin."
          >
            <OdemeBaglantisiFormu partyId={partyId} acikBakiye={balance} telefonVar={telefonVar} epostaVar={epostaVar} hazir={paytrHazir} />
          </PanelDrawer>
        ) : null}
        <PanelDrawer triggerLabel="Tahsilat" kicker={`CARİ · ${current.name}`} title="Tahsilat" description={`Açık bakiye: ${money(balance)}`}>
          <form className="panel-form fin-form kayit-formu" action={createCollection}>
            <input type="hidden" name="party_id" value={partyId} />
            <label>
              <span>Tahsilat tutarı (₺)<b className="req" aria-hidden="true">*</b></span>
              <input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" />
            </label>
            <label>
              Tarih
              <input name="transaction_date" type="date" />
            </label>
            <label>
              Referans / dekont no
              <input name="reference_no" placeholder="İsteğe bağlı" />
            </label>
            <label className="wide">
              <span>Açıklama<b className="req" aria-hidden="true">*</b></span>
              <input name="description" defaultValue="Müşteri tahsilatı" required />
            </label>
            <p className="fin-form-note">
              {balance ? `En fazla açık bakiye kadar (${money(balance)}) tahsilat kaydedebilirsiniz.` : "Bu carinin açık bakiyesi yok; yeni tahsilat kaydedilemez."}
            </p>
            <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
              <button className="panel-primary" disabled={!balance}>Tahsilatı kaydet</button>
            </div>
          </form>
        </PanelDrawer>
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            <PanelDrawer triggerLabel="Ek hizmet" triggerClassName="os-menu-item" kicker={`CARİ · ${current.name}`} title="Ek hizmet" description="Yeni hizmeti cari bakiyeye ekleyin.">
              <form className="panel-form fin-form kayit-formu" action={createAdditionalService}>
                <input type="hidden" name="party_id" value={partyId} />
                <label>
                  <span>Hizmet tutarı (₺)<b className="req" aria-hidden="true">*</b></span>
                  <input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" />
                </label>
                <label>
                  İşlem tarihi
                  <input name="transaction_date" type="date" />
                </label>
                <label>
                  Vade tarihi
                  <input name="due_date" type="date" />
                </label>
                <label>
                  Referans
                  <input name="reference_no" placeholder="İsteğe bağlı" />
                </label>
                <label className="wide">
                  <span>Hizmet açıklaması<b className="req" aria-hidden="true">*</b></span>
                  <input name="description" minLength={2} maxLength={500} required />
                </label>
                <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                  <button className="panel-primary">Cari hesaba ekle</button>
                </div>
              </form>
            </PanelDrawer>
            <PanelDrawer triggerLabel="İade" triggerClassName="os-menu-item" kicker={`CARİ · ${current.name}`} title="İade" description={`İade edilebilir: ${money(refundable)}`}>
              <form className="panel-form fin-form kayit-formu" action={createRefund}>
                <input type="hidden" name="party_id" value={partyId} />
                <label>
                  <span>İade tutarı (₺)<b className="req" aria-hidden="true">*</b></span>
                  <input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" />
                </label>
                <label>
                  Tarih
                  <input name="transaction_date" type="date" />
                </label>
                <label>
                  Referans / dekont no
                  <input name="reference_no" placeholder="İsteğe bağlı" />
                </label>
                <label className="wide">
                  <span>İade nedeni<b className="req" aria-hidden="true">*</b></span>
                  <input name="description" required />
                </label>
                {collections <= refunds ? <p className="fin-form-note">İade edilebilecek tahsilat yok.</p> : null}
                <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                  <button className="panel-primary" disabled={collections <= refunds}>İadeyi kaydet</button>
                </div>
              </form>
            </PanelDrawer>
            {canDelete ? (
              <PanelDrawer triggerLabel="Cariyi sil" title="Cariyi sil" description="Silme geri alınamaz." triggerClassName="os-menu-item is-danger">
                <div className="panel-danger-zone">
                  <small className="panel-kicker">KALICI İŞLEM</small>
                  <p>Cari, {entries.length ? `${entries.length} hareketiyle birlikte ` : ""}kalıcı olarak silinir ve raporlardan da düşer.</p>
                  <form action={deleteParty}>
                    <input type="hidden" name="party_id" value={partyId} />
                    <ConfirmDeleteButton
                      label="Cariyi sil"
                      confirmMessage={entries.length ? `${current.name} ve ${entries.length} hareketi kalıcı olarak silinsin mi?` : `${current.name} kalıcı olarak silinsin mi?`}
                    />
                  </form>
                </div>
              </PanelDrawer>
            ) : null}
          </div>
        </details>
      </div>

      {/* BAKİYE ŞERİDİ */}
      <section className="kayit-serit" aria-label="Cari özeti">
        <dl>
          <div><dt>Borç</dt><dd>{money(debt)}</dd></div>
          <div><dt>Tahsilat</dt><dd className="cari-arti">{money(collections)}</dd></div>
          <div><dt>İade</dt><dd>{money(refunds)}</dd></div>
          <div className="cari-bakiye" data-tone={balance > 0 ? "warning" : "success"}><dt>Açık bakiye</dt><dd>{money(balance)}</dd></div>
          {gecikenTaksitler.length ? <div><dt>Vadesi geçen</dt><dd className="talep-uyari">{money(gecikenTutar)}</dd></div> : null}
        </dl>
        <div className="cari-oran">
          <span>Tahsil edilen %{tahsilOrani}</span>
          <div className="cari-oran-cubuk" aria-hidden="true"><i style={{ "--p": `${tahsilOrani}%` } as CSSProperties} /></div>
        </div>
      </section>

      <div className="cari-pencere-izgara">
        <section aria-label="Hareket dökümü">
          <div className="cari-baslik">
            <h3>Hareket dökümü</h3>
            <small>{entries.length} hareket</small>
          </div>
          {entries.length ? (
            <>
            {/* Satıra tıklamak hareketin ayrıntı penceresini açar. Salt okunur:
                hareketler sözleşme borcuna, PayTR tahsilatına ve banka
                eşleşmesine bağlı; düzenleme o bağları bozabilir. */}
            <SatirTiklama />
            <ul className="cari-hareketler satir-tiklanir">
              {entries.map((e) => {
                const kind = entryKind(e);
                // "TAH:<uuid>", "EKH:<uuid>" gibi referanslar iç anahtardır (kaydın tekilliği), kişiye gösterilmez.
                const referans = e.reference_no && !IC_ANAHTAR.test(e.reference_no) ? e.reference_no : null;
                // Elle girilen (tahsilat, iade, ek hizmet) düzeltilebilir; ötekiler bir kayda bağlı.
                const elleTur = hareketDuzeltir ? elleGirilenTur(e) : null;
                const aciklamaMetni = e.description.replace(/^(Müşteri iadesi|Ek hizmet) · /, "");
                // Taksitlere dağıtılmış ek hizmetin tutarı kilitli (arvo_ek_hizmet_plan_koru): önce taksitlerden çıkarılır.
                const taksitteki = e.payment_plan_id ? planlar.get(e.payment_plan_id) ?? null : null;
                return (
                  <li key={e.id}>
                    <span className="status-pill" data-tone={kind.tone}>{kind.label}</span>
                    <span className="cari-hareket-metin">
                      <b>{e.description}</b>
                      {/* İç anahtar (TAH:<uuid>) gösterilmez; eskiden satırda ham referans yazıyordu. */}
                      <small>{date(e.transaction_date)}{referans ? ` · ${referans}` : ""}{e.payment_plan_id ? ` · ${taksitteki?.contract_no ?? "sözleşme"} taksitlerine dağıtıldı` : ""}</small>
                    </span>
                    <strong className={e.entry_type === "credit" ? "cari-arti" : undefined}>
                      {e.entry_type === "credit" ? "−" : "+"}
                      {money(Number(e.amount))}
                    </strong>
                    <PanelDrawer
                      triggerLabel="Ayrıntı"
                      triggerClassName="panel-secondary cari-taksit-btn satir-ac"
                      kicker={kind.label.toLocaleUpperCase("tr-TR")}
                      title={e.description}
                      description={`${date(e.transaction_date)} · ${e.entry_type === "credit" ? "−" : "+"}${money(Number(e.amount))}`}
                    >
                      <dl className="cari-hareket-ayrinti">
                        <div><dt>Tür</dt><dd><span className="status-pill" data-tone={kind.tone}>{kind.label}</span></dd></div>
                        <div><dt>Tutar</dt><dd>{e.entry_type === "credit" ? "Bakiyeden düşer" : "Bakiyeye eklenir"} · <b>{money(Number(e.amount))}</b></dd></div>
                        <div><dt>İşlem tarihi</dt><dd>{date(e.transaction_date)}</dd></div>
                        <div><dt>Açıklama</dt><dd>{e.description}</dd></div>
                        <div><dt>Referans</dt><dd>{referans ?? "—"}</dd></div>
                        <div><dt>Kaynak</dt><dd>{KAYNAK[e.source_type ?? "manual"] ?? e.source_type}</dd></div>
                        <div><dt>Kayıt zamanı</dt><dd>{date(e.created_at)}</dd></div>
                      </dl>
                      {elleTur ? (
                        <>
                          <form className="panel-form fin-form kayit-formu cari-hareket-duzelt" action={hareketiDuzelt}>
                            <input type="hidden" name="entry_id" value={e.id} />
                            <label>
                              <span>Tutar (₺)<b className="req" aria-hidden="true">*</b></span>
                              <input name="amount" inputMode="decimal" required defaultValue={liraYazisi(Number(e.amount))} readOnly={Boolean(e.payment_plan_id)} />
                            </label>
                            <label>
                              <span>İşlem tarihi<b className="req" aria-hidden="true">*</b></span>
                              <input name="transaction_date" type="date" required defaultValue={e.transaction_date} />
                            </label>
                            <label className="wide">
                              <span>{elleTur === "iade" ? "İade nedeni" : elleTur === "ek-hizmet" ? "Hizmet açıklaması" : "Açıklama"}<b className="req" aria-hidden="true">*</b></span>
                              <input name="description" required minLength={2} maxLength={480} defaultValue={aciklamaMetni} />
                            </label>
                            <label className="wide">
                              Referans / dekont no
                              <input name="reference_no" defaultValue={referans ?? ""} placeholder="Boş bırakılırsa değişmez" />
                            </label>
                            <p className="fin-form-note">Taksitlerin ödeme durumu düzeltilen tutara göre yeniden hesaplanır.</p>
                            <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
                              <button className="panel-primary">Düzeltmeyi kaydet</button>
                            </div>
                          </form>
                          {e.payment_plan_id ? <p className="fin-form-note">Bu ek hizmet {taksitteki?.contract_no ?? "sözleşme"} taksitlerine dağıtıldı; tutarını değiştirmek ya da silmek için önce aşağıdan taksitlerden çıkarın.</p> : (
                          <details className="cari-hareket-sil">
                            <summary className="panel-danger">Hareketi sil</summary>
                            <form action={hareketiSil}>
                              <input type="hidden" name="entry_id" value={e.id} />
                              <p className="fin-form-note">{kind.label} kaydı ({money(Number(e.amount))}) dökümden kalıcı olarak silinir; bakiye ve taksitler yeniden hesaplanır.</p>
                              <button className="panel-danger">Evet, sil</button>
                            </form>
                          </details>
                          )}
                        </>
                      ) : (
                        hareketDuzeltir ? <p className="fin-form-note">Bu hareket bir sözleşmeye, PayTR ödemesine ya da finans kaydına bağlı; buradan değiştirilemez.</p> : null
                      )}
                      {/* Müşteri ek hizmetin bedelini taksitlere yaymak isteyebiliyor (26.10.2026). */}
                      {elleTur === "ek-hizmet" && vadeDegistirir && dagitimPlanlari.length ? (
                        <div className="talep-not">
                          <h3>{e.payment_plan_id ? "Sözleşme taksitlerinde" : "Sözleşme taksitlerine dağıt"}</h3>
                          <EkHizmetTaksitFormu
                            entryId={e.id}
                            tutar={Number(e.amount)}
                            planlar={dagitimPlanlari}
                            bagliPlanId={e.payment_plan_id}
                            eylem={e.payment_plan_id ? ekHizmetiTaksitlerdenCikar : ekHizmetiTaksitlereDagit}
                          />
                        </div>
                      ) : null}
                    </PanelDrawer>
                  </li>
                );
              })}
            </ul>
            </>
          ) : (
            <p className="ic-akis-bos">Henüz cari hareket yok. Tahsilat, ek hizmet ve iade kayıtları burada tarih sırasıyla görünür.</p>
          )}
        </section>

        <section aria-label="Sözleşmeler ve bakiye">
          <div className="cari-baslik">
            <h3>Sözleşmeler</h3>
            <small>{sozlesmeler.length} imzalı</small>
          </div>
          {sozlesmeler.length ? (
            <ul className="cari-hareketler">
              {sozlesmeler.map((c) => {
                const icerik = (
                  <>
                    <span className="cari-hareket-metin">
                      <b>{c.contract_no}</b>
                      <small>{c.title} · {c.signed_at ? date(c.signed_at) : "İmzalı"}</small>
                    </span>
                    <strong>{money(Number(c.amount))}</strong>
                  </>
                );
                return <li key={c.id}>{crmVar ? <Link href={`/panel/crm/contracts/${c.id}`}>{icerik}</Link> : icerik}</li>;
              })}
            </ul>
          ) : (
            <p className="talep-bos cari-not">Bu cariye bağlı imzalı sözleşme yok.</p>
          )}

          {odemeLinkleri.length ? (
            <div className="talep-not">
              <div className="cari-baslik"><h3>Ödeme bağlantıları</h3><small>{bekleyenLink ?? 0} bekliyor</small></div>
              <OdemeBaglantilari linkler={odemeLinkleri} telefonVar={telefonVar} epostaVar={epostaVar} />
            </div>
          ) : null}

          {taksitler.length ? (
            <div className="talep-not">
              <div className="cari-baslik"><h3>Ödeme takvimi</h3><small>{dagitilmis.filter((t) => t.durum === "odendi").length}/{dagitilmis.filter((t) => t.durum !== "iptal").length} ödendi</small></div>
              {/* Taksit seçeneği (adet, ilk vade, aralık): sözleşme başına; ödenmiş kısım korunur. */}
              {vadeDegistirir && planOzetleri.length ? (
                <div className="cari-plan-eylem">
                  {planOzetleri.map((p) => (
                    <PanelDrawer
                      key={p.planId}
                      triggerLabel={planOzetleri.length > 1 ? `${p.sozlesme.contract_no} · taksit seçeneği` : "Taksit seçeneğini değiştir"}
                      triggerClassName="panel-secondary cari-taksit-btn"
                      kicker={`SÖZLEŞME · ${p.sozlesme.contract_no}`}
                      title="Taksit planı"
                      description={`Sözleşme ${money(Number(p.sozlesme.amount))}${p.ekHizmet > 0 ? ` + ek hizmet ${money(p.ekHizmet)}` : ""} · ödenen ${money(p.odenen)} · kalan ${money(p.kalan)}`}
                    >
                      <TaksitPlaniFormu planId={p.planId} taksitler={planTaksitleri(p.planId)} toplam={p.toplam} ilkVade={p.ilkVade} acikAdet={p.acikAdet} eylem={taksitSecenegiDegistir} />
                    </PanelDrawer>
                  ))}
                </div>
              ) : null}
              {/* Taksit satırına tıklamak "Düzenle" penceresini açar. */}
              {vadeDegistirir ? <SatirTiklama /> : null}
              <ul className="cari-hareketler satir-tiklanir">
                {dagitilmis.map((t) => {
                  const sozlesme = planlar.get(t.payment_plan_id);
                  const durum = TAKSIT_DURUMU[t.durum];
                  return (
                    <li key={t.id}>
                      <span className="cari-hareket-metin">
                        <b>{t.due_date ? date(t.due_date) : "Vade yok"}</b>
                        <small>{sozlesme?.contract_no ?? "Sözleşme"} · {t.installment_no}. taksit{t.odenen > 0 && t.kalan > 0 ? ` · ${money(t.odenen)} ödendi, kalan ${money(t.kalan)}` : ""}</small>
                      </span>
                      <strong>{money(Number(t.amount))}</strong>
                      <span className="status-pill" data-tone={durum.ton}>{durum.ad}</span>
                      {vadeDegistirir && t.durum !== "odendi" && t.durum !== "iptal" ? (
                        <PanelDrawer
                          triggerLabel="Düzenle"
                          triggerClassName="panel-secondary cari-taksit-btn satir-ac"
                          kicker="TAKSİT"
                          title={`${sozlesme?.contract_no ?? "Sözleşme"} · ${t.installment_no}. taksit`}
                          description={`${money(Number(t.amount))} · vade ${t.due_date ? date(t.due_date) : "yok"}${t.odenen > 0 ? ` · ${money(t.odenen)} ödendi` : ""}`}
                        >
                          <TaksitDuzenleFormu taksitId={t.id} plan={planTaksitleri(t.payment_plan_id).map(({ no, vade, tutar }) => ({ no, vade, tutar }))} hedefNo={planTaksitleri(t.payment_plan_id).findIndex((x) => x.id === t.id) + 1} eylem={taksitiDuzenle} />
                        </PanelDrawer>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Bakiyenin nasıl çıktığı: şeritteki sayıların ilişkisi. */}
          <div className="talep-not">
            <h3>Bakiye hesabı</h3>
            <dl className="talep-liste">
              {contractDebt ? <div><dt>Sözleşmeler</dt><dd>{money(contractDebt)}</dd></div> : null}
              {contractDebt && additionalServices ? <div><dt>+ Ek hizmetler</dt><dd>{money(additionalServices)}</dd></div> : null}
              <div><dt>= Borç</dt><dd>{money(debt)}</dd></div>
              {refunds ? <div><dt>+ İadeler</dt><dd>{money(refunds)}</dd></div> : null}
              <div><dt>− Tahsilat</dt><dd>{money(collections)}</dd></div>
              <div className="cari-toplam"><dt>Açık bakiye</dt><dd>{money(balance)}</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
