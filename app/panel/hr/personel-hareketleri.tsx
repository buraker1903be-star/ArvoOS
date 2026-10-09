import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";

/*
  PERSONEL HAREKETLERİ SEKMESİ (2026-10): personel detayının orta
  sütununda. Eskiden kurum geneli ayrı bir sayfaydı (/panel/hr/activity)
  ve bir kişinin oturumlarını görmek için süzgeçten onu seçmek
  gerekiyordu; artık kişinin kendi sayfasında.

  Süzgeç ve sayfa adreste (?hareket=30&hsayfa=2): sayfa yenilenince sekme
  açık ve yer kaybolmadan kalsın. Varsayılan son 7 gün, sayfa başına
  SAYFA_BOYU kayıt; toplam ayrı ve sınırsız sayım sorgusundan (sayfadaki
  satırları saymak sayfa boyunu toplam sanmak olurdu).
*/

const TZ = "Europe/Istanbul";
const DAY = 86_400_000;
const SAYFA_BOYU = 25;
export const HAREKET_ARALIKLARI = [
  { value: "1", label: "Bugün", gun: 1 },
  { value: "7", label: "Son 7 gün", gun: 7 },
  { value: "30", label: "Son 30 gün", gun: 30 },
  { value: "tum", label: "Tümü", gun: null },
] as const;
const VARSAYILAN = "7";

type Oturum = { id: string; login_at: string; last_seen_at: string; logout_at: string | null; logout_reason: string | null; current_path: string | null };

const saat = (deger: string) => new Date(deger).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const tarihSaat = (deger: string) => new Date(deger).toLocaleString("tr-TR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
const gunAnahtari = (deger: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deger));
const sure = (bas: string, son: string) => {
  const dk = Math.round(Math.max(0, Date.parse(son) - Date.parse(bas)) / 60000);
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
};
const NEDEN: Record<string, string> = { manual: "Normal çıkış", timeout: "Zaman aşımı", workspace_switch: "Çalışma alanı değişti" };
const NEDEN_TONU: Record<string, string> = { manual: "neutral", timeout: "warning", workspace_switch: "info" };

// Saate bağlı değerler bileşen gövdesinde okunmaz (react-hooks/purity).
function saatler() {
  const simdi = Date.now();
  const bugun = todayInIstanbul(new Date(simdi));
  return { cevrimiciSiniri: simdi - 2 * 60 * 1000, bugunBasi: istanbulMidnight(bugun).getTime(), bugun, dun: todayInIstanbul(new Date(simdi - DAY)) };
}

function gunYazisi(anahtar: string, bugun: string, dun: string) {
  if (anahtar === bugun) return "Bugün";
  if (anahtar === dun) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${anahtar}T12:00:00Z`));
}

export async function PersonelHareketleri({ supabase, orgId, userId, temelAdres, aralik, sayfa }: { supabase: SupabaseClient; orgId: string; userId: string | null; temelAdres: string; aralik?: string; sayfa?: string }) {
  if (!userId) return <p className="ic-akis-bos">Bu personelin panel hesabı yok; giriş-çıkış kaydı tutulmuyor.</p>;
  const secilen = HAREKET_ARALIKLARI.find((item) => item.value === aralik) ?? HAREKET_ARALIKLARI.find((item) => item.value === VARSAYILAN)!;
  const sayfaNo = Math.max(1, Number.parseInt(sayfa ?? "1", 10) || 1);
  const { cevrimiciSiniri, bugunBasi, bugun, dun } = saatler();
  const aralikBasi = secilen.gun ? new Date(bugunBasi - (secilen.gun - 1) * DAY).toISOString() : null;

  let gecmis = supabase.from("user_session_logs").select("id,login_at,last_seen_at,logout_at,logout_reason,current_path").eq("organization_id", orgId).eq("user_id", userId).order("login_at", { ascending: false });
  let sayim = supabase.from("user_session_logs").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("user_id", userId);
  if (aralikBasi) {
    gecmis = gecmis.gte("login_at", aralikBasi);
    sayim = sayim.gte("login_at", aralikBasi);
  }
  const [{ data: varlik }, { data: oturumVerisi }, { count }] = await Promise.all([
    supabase.from("user_presence").select("last_seen_at").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
    gecmis.range((sayfaNo - 1) * SAYFA_BOYU, sayfaNo * SAYFA_BOYU - 1),
    sayim,
  ]);
  const oturumlar = (oturumVerisi ?? []) as Oturum[];
  const sonGorulme = (varlik as { last_seen_at: string } | null)?.last_seen_at ?? null;
  const cevrimici = sonGorulme ? Date.parse(sonGorulme) >= cevrimiciSiniri : false;
  const acik = oturumlar.find((o) => !o.logout_at && Date.parse(o.last_seen_at) >= cevrimiciSiniri);
  const toplam = count ?? oturumlar.length;
  const sonSayfa = typeof count === "number" ? Math.max(1, Math.ceil(count / SAYFA_BOYU)) : oturumlar.length === SAYFA_BOYU ? sayfaNo + 1 : sayfaNo;
  const adres = (deger: { hareket?: string; hsayfa?: number }) => {
    const p = new URLSearchParams();
    // Parametre varsayılan aralıkta da yazılır: sayfa yenilenince sekme açık gelsin.
    p.set("hareket", deger.hareket ?? secilen.value);
    if (deger.hsayfa && deger.hsayfa > 1) p.set("hsayfa", String(deger.hsayfa));
    return `${temelAdres}?${p.toString()}`;
  };

  // Ardışık aynı günler tek başlık altında (oturumlar yeniden eskiye sıralı).
  const gruplar: { anahtar: string; oturumlar: Oturum[] }[] = [];
  for (const o of oturumlar) {
    const anahtar = gunAnahtari(o.login_at);
    const son = gruplar[gruplar.length - 1];
    if (son?.anahtar === anahtar) son.oturumlar.push(o);
    else gruplar.push({ anahtar, oturumlar: [o] });
  }

  return (
    <div className="personel-hareket">
      <div className="cari-baslik">
        <h2>Anlık durum</h2>
        {cevrimici ? <span className="status-pill" data-tone="success">Çevrimiçi</span> : <small>{sonGorulme ? `Son görülme ${tarihSaat(sonGorulme)}` : "Henüz giriş yapmadı"}</small>}
      </div>
      {acik?.current_path ? <p className="talep-bos cari-not">Şu an: <code>{acik.current_path}</code></p> : null}

      <div className="talep-not">
        <div className="cari-baslik"><h2>Giriş ve çıkış kayıtları</h2><small>{secilen.label} · {toplam} kayıt</small></div>
        <nav className="ekip-suzgec talep-suzgec" aria-label="Tarih aralığı">
          {HAREKET_ARALIKLARI.map((item) => (
            <Link key={item.value} href={adres({ hareket: item.value })} scroll={false} className={secilen.value === item.value ? "is-active" : undefined} aria-current={secilen.value === item.value ? "page" : undefined}>{item.label}</Link>
          ))}
        </nav>
        {gruplar.length ? (
          gruplar.map((grup) => (
            <div key={grup.anahtar} className="personel-hareket-gun">
              <h3>{gunYazisi(grup.anahtar, bugun, dun)} <small>{grup.oturumlar.length} oturum</small></h3>
              <ul className="cari-hareketler">
                {grup.oturumlar.map((o) => {
                  const aktif = !o.logout_at && Date.parse(o.last_seen_at) >= cevrimiciSiniri;
                  const son = o.logout_at ?? o.last_seen_at;
                  return (
                    <li key={o.id}>
                      <span className="cari-hareket-metin">
                        <b>{saat(o.login_at)} – {aktif ? "şimdi" : gunAnahtari(son) === grup.anahtar ? saat(son) : tarihSaat(son)}</b>
                        <small>{sure(o.login_at, son)}{o.current_path ? ` · son sayfa ${o.current_path}` : ""}</small>
                      </span>
                      <span className="status-pill" data-tone={aktif ? "success" : NEDEN_TONU[o.logout_reason ?? ""] ?? "neutral"}>{aktif ? "Aktif" : o.logout_reason ? NEDEN[o.logout_reason] ?? "Çıkış" : "Bağlantı kapandı"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="talep-bos cari-not">{secilen.gun ? "Bu aralıkta oturum yok; aralığı genişletmeyi deneyin." : "Henüz oturum kaydı yok."}</p>
        )}
        {sonSayfa > 1 ? (
          <nav className="hr-act-sayfalar personel-sayfalar" aria-label="Sayfalar">
            {sayfaNo > 1 ? <Link href={adres({ hsayfa: sayfaNo - 1 })} scroll={false}>← Önceki</Link> : <span aria-hidden="true">← Önceki</span>}
            <b>{sayfaNo} / {sonSayfa}</b>
            {sayfaNo < sonSayfa ? <Link href={adres({ hsayfa: sayfaNo + 1 })} scroll={false}>Sonraki →</Link> : <span aria-hidden="true">Sonraki →</span>}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
