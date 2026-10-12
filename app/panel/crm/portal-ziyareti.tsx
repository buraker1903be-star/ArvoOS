import { getPanelContext } from "@/lib/panel-context";
import { portalDurumu, simdiAn, zamanYazisi, type PortalZiyaretKaydi } from "@/lib/portal-ziyareti";
import "./portal-ziyareti.css";

/*
  MÜŞTERİ TAKİP PORTALI: şu an ekranda mı, en son ne zaman girdi
  (12.10.2026). Sözleşme detayındaki takip kartında ve iş detayının
  künyesinde. Kayıt kapı işlevinden (arvo_tracking_guard,
  20261012131639); okunamazsa (migration öncesi) hiçbir şey çizilmez —
  "girmedi" demek yanlış bilgi olurdu.
*/
export async function PortalZiyareti({ contractId, sade = false }: { contractId: string; /** Künye satırı için tek satır. */ sade?: boolean }) {
  const { supabase, membership } = await getPanelContext();
  const { data, error } = await supabase
    .from("crm_contract_portal_visits")
    .select("first_login_at,last_login_at,login_count,last_seen_at")
    .eq("organization_id", membership.organization_id).eq("contract_id", contractId).maybeSingle();
  if (error) return null;

  const simdi = simdiAn();
  const durum = portalDurumu(data as PortalZiyaretKaydi | null, simdi);
  const giris = durum.tur !== "hic" && durum.sonGiris ? `son giriş ${zamanYazisi(durum.sonGiris, simdi)}` : null;
  const sayi = durum.tur !== "hic" && durum.girisSayisi ? `${durum.girisSayisi} giriş` : null;
  const ayrinti = [giris, sayi].filter(Boolean).join(" · ");

  return (
    <span className={sade ? "portal-ziyaret is-sade" : "portal-ziyaret"} data-durum={durum.tur}>
      <i aria-hidden="true" />
      {durum.tur === "hic" ? <b>Müşteri portala henüz girmedi</b>
        : durum.tur === "cevrimici" ? <b>Şu an portalda</b>
        : <b>Son görülme {zamanYazisi(durum.sonGorulme, simdi)}</b>}
      {ayrinti ? <small>{ayrinti}</small> : null}
    </span>
  );
}
