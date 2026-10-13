import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInIstanbul, istanbulMidnight } from "@/lib/istanbul-date";
import { dueBadge } from "@/lib/operasyon-termin";
import { formatSubject } from "@/lib/table-format";
import { activeStatuses } from "../operations/ops-shared";
import { toggleWorkflowStep } from "../operations/actions";
import { AnlikBildirimAyari } from "../notifications/anlik-bildirim-ayari";
import { pushGenelAnahtar, pushYapilandi } from "@/lib/anlik-bildirim-gonder";
import "./bugun-paneli.css";

/*
  TELEFONDA "BUGÜN" (13.10.2026). Ana ekranın en üstünde, yalnızca
  telefonda (bugun-paneli.css; masaüstündeki genel bakış değişmedi).

  Kurum sahibinin tarifi: yöneticiler ve sahadaki personel işlemlerin
  çoğunu telefondan yapıyor. Telefonda ilk ekran "bugün ne yapmalıyım":
  - Herkese: hızlı işlemler (yeni talep, işlerim, mesajlar).
  - Yöneticiye (operations.ekip.gor / operations.gorev.ata): geciken iş,
    atanmamış iş, imza bekleyen sözleşme, bugün gelen talep, bugünkü
    tahsilat — her kutu süzülmüş listeye götürür.
  - İşi olan personele: KENDİ adımları (geciken, bugün, yarın…), tek
    dokunuşla "Tamamla" (toggleWorkflowStep; yetki ve kayıt geçmişi
    oradaki kurallarla).

  Kutular rol listesiyle değil yetenekle açılıyor (AGENTS.md).
*/

type Adim = {
  id: string;
  title: string;
  due_date: string | null;
  workflow_id: string;
  operation_workflows: { title: string; customer_name: string | null } | null;
};

const ADIM_SINIRI = 6;
const MESAJ_SINIRI = 4;

type BekleyenMesaj = {
  workflow_id: string;
  body: string;
  created_at: string;
  operation_workflows: { title: string; customer_name: string | null } | null;
};

const saatBicim = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
const gunBicim = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short" });
const gunAnahtari = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });

async function adimlarim(supabase: SupabaseClient, orgId: string, benId: string): Promise<{ adimlar: Adim[]; hata: boolean }> {
  /*
    Benim adımım: adım bana atanmış, ya da adımın sorumlusu yok ve işin
    sorumlusu benim (iş detayındaki kural: adım sorumlusu yoksa iş
    sorumlusu üstlenir). İki sorgu: PostgREST tek bir "or" içinde ana
    tabloyla gömülü tabloyu birleştiremiyor. Bir kişinin açık adımları
    sınırlı sayıda; sayılar doğru olsun diye hepsi okunuyor (sınırsız
    okuma bilerek — gösterim aşağıda kısaltılıyor).
  */
  const ortak = "id,title,due_date,workflow_id,operation_workflows!inner(title,customer_name,status,assigned_employee_id)";
  const [bana, isimden] = await Promise.all([
    supabase.from("operation_steps").select(ortak)
      .eq("organization_id", orgId).eq("is_completed", false).eq("assigned_employee_id", benId)
      .in("operation_workflows.status", [...activeStatuses]),
    supabase.from("operation_steps").select(ortak)
      .eq("organization_id", orgId).eq("is_completed", false).is("assigned_employee_id", null)
      .eq("operation_workflows.assigned_employee_id", benId)
      .in("operation_workflows.status", [...activeStatuses]),
  ]);
  if (bana.error || isimden.error) return { adimlar: [], hata: true };
  const hepsi = [...(bana.data ?? []), ...(isimden.data ?? [])] as unknown as Adim[];
  // Tarihli olan önce (en eski = en gecikmiş), tarihsiz sonda.
  hepsi.sort((a, b) => (a.due_date ?? "9999") .localeCompare(b.due_date ?? "9999"));
  return { adimlar: hepsi, hata: false };
}

export async function BugunPaneli({ supabase, orgId, userId, izin, crmGorur, operasyonGorur, finansGorur }: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  izin: (anahtar: string) => boolean;
  crmGorur: boolean;
  operasyonGorur: boolean;
  finansGorur: boolean;
}) {
  const bugun = todayInIstanbul();
  const yonetici = operasyonGorur && (izin("operations.ekip.gor") || izin("operations.gorev.ata"));
  const bugunBasi = istanbulMidnight(bugun).toISOString();
  const say = (q: PromiseLike<{ count: number | null; error: unknown }>) => q.then((r) => (r.error ? null : r.count ?? 0));
  const yok = Promise.resolve(null);

  const { data: ben } = await supabase.from("hr_employees").select("id").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
  const benId = (ben as { id?: string } | null)?.id ?? null;

  /*
    YANIT BEKLEYEN MESAJLAR: sayı kutusu "kaç tane" diyordu, kime ve ne
    yazıldığı için işler listesine, oradan işe, oradan da sayfanın en
    altındaki sohbete inmek gerekiyordu. Burada son mesajlar iş başına
    bir satır; dokununca telefonda sohbet doğrudan açılıyor
    (?pencere=mesajlar). Okuma sınırlı ama yalnızca GÖSTERİM için —
    sayı kutudaki head sorgusundan geliyor.
  */
  const mesajSorgusu = () => {
    const q = supabase.from("customer_file_messages").select("workflow_id,body,created_at,operation_workflows!inner(title,customer_name,status,assigned_employee_id)")
      .eq("organization_id", orgId).eq("sender_type", "customer").is("read_at", null).neq("operation_workflows.status", "cancelled")
      .order("created_at", { ascending: false }).limit(40);
    return yonetici ? q : q.eq("operation_workflows.assigned_employee_id", benId as string);
  };

  const [adimSonucu, gecikenIs, atanmamisIs, imzaBekleyen, bugunTalep, okunmamisMesaj, tahsilat, mesajSonucu] = await Promise.all([
    operasyonGorur && benId ? adimlarim(supabase, orgId, benId) : Promise.resolve({ adimlar: [] as Adim[], hata: false }),
    yonetici ? say(supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", [...activeStatuses]).lt("due_date", bugun)) : yok,
    yonetici ? say(supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", orgId).in("status", [...activeStatuses]).is("assigned_employee_id", null)) : yok,
    yonetici && crmGorur ? say(supabase.from("crm_sozlesme_liste").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("sozlesme_grubu", "sent")) : yok,
    yonetici && crmGorur ? say(supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", bugunBasi)) : yok,
    // Yanıt bekleyen müşteri mesajı: yönetici bütün işlerde, personel kendi işlerinde.
    operasyonGorur && (yonetici || benId)
      ? say((() => {
          const q = supabase.from("customer_file_messages").select("id,operation_workflows!inner(status,assigned_employee_id)", { count: "exact", head: true })
            .eq("organization_id", orgId).eq("sender_type", "customer").is("read_at", null).neq("operation_workflows.status", "cancelled");
          return yonetici ? q : q.eq("operation_workflows.assigned_employee_id", benId as string);
        })())
      : yok,
    // Bugünkü tahsilat: yalnızca bugünün ödeme kayıtları (gün sınırlı okuma, toplam doğru).
    yonetici && finansGorur
      ? supabase.from("account_entries").select("amount").eq("organization_id", orgId).eq("entry_type", "credit").eq("source_type", "payment").eq("transaction_date", bugun)
          .then((r) => (r.error ? null : ((r.data ?? []) as { amount: number }[]).reduce((t, e) => t + Number(e.amount), 0)))
      : yok,
    operasyonGorur && (yonetici || benId)
      ? mesajSorgusu().then((r) => {
          // Liste yalnızca kısayol; okunamazsa ana ekran düşmesin ama iz kalsın.
          if (r.error) console.error("[bugun] bekleyen mesajlar okunamadı", r.error.message);
          return r.error ? [] : (r.data ?? []) as unknown as BekleyenMesaj[];
        })
      : Promise.resolve([] as BekleyenMesaj[]),
  ]);

  // İş başına en yeni mesaj (sorgu yeniden eskiye sıralı).
  const mesajIsleri = new Map<string, BekleyenMesaj>();
  for (const m of mesajSonucu) if (!mesajIsleri.has(m.workflow_id)) mesajIsleri.set(m.workflow_id, m);
  const bekleyenMesajlar = [...mesajIsleri.values()].slice(0, MESAJ_SINIRI);
  const mesajZamani = (iso: string) => {
    const t = new Date(iso);
    return gunAnahtari.format(t) === bugun ? saatBicim.format(t) : gunBicim.format(t);
  };

  const adimlar = adimSonucu.adimlar;
  const geciken = adimlar.filter((a) => a.due_date && a.due_date < bugun).length;
  const bugunku = adimlar.filter((a) => a.due_date === bugun).length;
  const para = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(kurus / 100);

  const kutular = [
    gecikenIs !== null ? { ad: "Termini geçen iş", deger: String(gecikenIs), href: "/panel/operations/isler?termin=geciken", ton: gecikenIs ? "uyari" : "" } : null,
    atanmamisIs !== null ? { ad: "Atanmamış iş", deger: String(atanmamisIs), href: "/panel/operations/isler?sorumlu=atanmamis", ton: atanmamisIs ? "uyari" : "" } : null,
    imzaBekleyen !== null ? { ad: "İmza bekleyen", deger: String(imzaBekleyen), href: "/panel/crm/contracts?status=sent", ton: "" } : null,
    bugunTalep !== null ? { ad: "Bugün gelen talep", deger: String(bugunTalep), href: "/panel/crm", ton: bugunTalep ? "arti" : "" } : null,
    okunmamisMesaj !== null ? { ad: "Yanıt bekleyen mesaj", deger: String(okunmamisMesaj), href: yonetici ? "/panel/operations/isler?mesaj=yeni" : `/panel/operations/isler?mesaj=yeni&sorumlu=${benId}`, ton: okunmamisMesaj ? "uyari" : "" } : null,
    tahsilat !== null ? { ad: "Bugün tahsilat", deger: para(tahsilat), href: "/panel/finance", ton: tahsilat ? "arti" : "" } : null,
  ].filter((k): k is { ad: string; deger: string; href: string; ton: string } => k !== null);

  const kisayollar = [
    crmGorur ? { ad: "Yeni talep", href: "/panel/crm?yeni=talep", birincil: true } : null,
    operasyonGorur && benId ? { ad: "İşlerim", href: `/panel/operations/isler?sorumlu=${benId}`, birincil: false } : null,
    operasyonGorur ? { ad: "Pano", href: "/panel/operations/pano", birincil: false } : null,
    crmGorur ? { ad: "Talepler", href: "/panel/crm", birincil: false } : null,
  ].filter((k): k is { ad: string; href: string; birincil: boolean } => k !== null);

  if (!kutular.length && !kisayollar.length && !adimlar.length) return null;

  return (
    <section className="bugun" aria-label="Bugün">
      {/* Bildirim henüz açılmadıysa en üstte tek satırlık öneri (kapatılabilir). */}
      <AnlikBildirimAyari genelAnahtar={pushYapilandi() ? pushGenelAnahtar() : null} gorunum="serit" />
      {kisayollar.length ? (
        <nav className="bugun-kisayol" aria-label="Hızlı işlemler">
          {kisayollar.map((k) => <Link key={k.ad} href={k.href} className={k.birincil ? "is-birincil" : undefined}>{k.birincil ? "+ " : ""}{k.ad}</Link>)}
        </nav>
      ) : null}

      {kutular.length ? (
        <div className="bugun-kutular">
          {kutular.map((k) => (
            <Link key={k.ad} href={k.href} className="bugun-kutu" data-ton={k.ton || undefined}>
              <b>{k.deger}</b>
              <span>{k.ad}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {bekleyenMesajlar.length ? (
        <section className="bugun-adimlar bugun-mesajlar" aria-label="Yanıt bekleyen mesajlar">
          <header>
            <h2>Yanıt bekleyen mesajlar</h2>
            <small>{okunmamisMesaj ? `${okunmamisMesaj} okunmamış` : null}</small>
          </header>
          <ul>
            {bekleyenMesajlar.map((m) => (
              <li key={m.workflow_id}>
                <Link href={`/panel/operations/${m.workflow_id}?pencere=mesajlar`} className="bugun-adim-metin">
                  <b>{m.operation_workflows?.customer_name || formatSubject(m.operation_workflows?.title)}</b>
                  <small className="bugun-mesaj-govde">{m.body}</small>
                  <small>{formatSubject(m.operation_workflows?.title)} · {mesajZamani(m.created_at)}</small>
                </Link>
                <Link href={`/panel/operations/${m.workflow_id}?pencere=mesajlar`} className="bugun-tamamla" aria-label={`${m.operation_workflows?.customer_name ?? "Müşteri"}: yanıtla`}>Yanıtla</Link>
              </li>
            ))}
          </ul>
          {mesajIsleri.size > MESAJ_SINIRI ? <Link className="bugun-tumu" href={yonetici ? "/panel/operations/isler?mesaj=yeni" : `/panel/operations/isler?mesaj=yeni&sorumlu=${benId}`}>Mesajı olan bütün işler ›</Link> : null}
        </section>
      ) : null}

      {/* Yöneticinin üstünde adım yoksa kart yer kaplamaz; sahadaki personel
          boş olsa da görür ("açık adımınız yok" da bir bilgi). */}
      {operasyonGorur && benId && (adimlar.length || adimSonucu.hata || !yonetici) ? (
        <section className="bugun-adimlar" aria-label="Adımlarım">
          <header>
            <h2>Adımlarım</h2>
            <small>{adimlar.length ? [geciken ? `${geciken} geciken` : null, bugunku ? `${bugunku} bugün` : null, `${adimlar.length} açık`].filter(Boolean).join(" · ") : "Açık adım yok"}</small>
          </header>
          {adimSonucu.hata ? <p className="bugun-bos">Adımlar okunamadı; sayfayı yenileyin.</p>
            : adimlar.length ? (
              <ul>
                {adimlar.slice(0, ADIM_SINIRI).map((a) => {
                  const rozet = dueBadge(a.due_date, bugun);
                  return (
                    <li key={a.id}>
                      <Link href={`/panel/operations/${a.workflow_id}`} className="bugun-adim-metin">
                        <b>{formatSubject(a.title)}</b>
                        <small>{formatSubject(a.operation_workflows?.title)}{a.operation_workflows?.customer_name ? ` · ${a.operation_workflows.customer_name}` : ""}</small>
                        {a.due_date ? <span className="status-pill" data-tone={rozet.tone}>{rozet.label}</span> : null}
                      </Link>
                      <form action={toggleWorkflowStep}>
                        <input type="hidden" name="step_id" value={a.id} />
                        <input type="hidden" name="is_completed" value="true" />
                        <button type="submit" className="bugun-tamamla" aria-label={`${a.title}: tamamla`}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                          Tamamla
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="bugun-bos">Size atanmış açık adım yok.</p>}
          {adimlar.length > ADIM_SINIRI ? <Link className="bugun-tumu" href={`/panel/operations/isler?sorumlu=${benId}`}>Bütün işlerim ({adimlar.length} adım) ›</Link> : null}
        </section>
      ) : null}
    </section>
  );
}
