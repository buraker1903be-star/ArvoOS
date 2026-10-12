import { getPanelContext } from "@/lib/panel-context";
import { portalDurumu, simdiAn, zamanYazisi, type PortalZiyaretKaydi } from "@/lib/portal-ziyareti";
import "./portal-ziyareti.css";

/*
  MÜŞTERİ TAKİP PORTALI: şu an ekranda mı, en son ne zaman girdi
  (12.10.2026). Sözleşme detayındaki takip kartında ve iş detayının
  künyesinde. Kayıt kapı işlevinden (arvo_tracking_guard,
  20261012131639); okunamazsa (migration öncesi) hiçbir şey çizilmez —
  "girmedi" demek yanlış bilgi olurdu.

  Künyede (sade) değer öteki satırlar gibi sağa yaslı: üstte durum,
  altında giriş sayısı. Son giriş, son görülmeyle aynı dakikadaysa
  yazılmaz; eskiden "Son görülme bugün 16:25 · son giriş bugün 16:25"
  aynı saati iki kez söylüyordu.
*/
export async function PortalZiyareti({ contractId, sade = false }: { contractId: string; /** Künye satırı: sağa yaslı, kısa. */ sade?: boolean }) {
  const { supabase, membership } = await getPanelContext();
  const { data, error } = await supabase
    .from("crm_contract_portal_visits")
    .select("first_login_at,last_login_at,login_count,last_seen_at")
    .eq("organization_id", membership.organization_id).eq("contract_id", contractId).maybeSingle();
  if (error) return null;

  const simdi = simdiAn();
  const durum = portalDurumu(data as PortalZiyaretKaydi | null, simdi);
  const sonGorulme = durum.tur === "cevrimdisi" ? zamanYazisi(durum.sonGorulme, simdi) : null;
  const sonGiris = durum.tur !== "hic" && durum.sonGiris ? zamanYazisi(durum.sonGiris, simdi) : null;
  const ayrinti = [
    durum.tur !== "hic" && durum.girisSayisi ? `${durum.girisSayisi} giriş` : null,
    sonGiris && sonGiris !== sonGorulme ? `son giriş ${sonGiris}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <span className={sade ? "portal-ziyaret is-sade" : "portal-ziyaret"} data-durum={durum.tur}>
      <span className="portal-ziyaret-ana">
        <i aria-hidden="true" />
        {durum.tur === "hic" ? (sade ? "Henüz girmedi" : "Müşteri portala henüz girmedi")
          : durum.tur === "cevrimici" ? "Şu an portalda"
          : `Son görülme ${sonGorulme}`}
      </span>
      {ayrinti ? <small>{ayrinti}</small> : null}
    </span>
  );
}
