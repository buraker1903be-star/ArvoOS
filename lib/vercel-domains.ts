type VercelVerificationChallenge = { type: string; domain: string; value: string; reason: string };

type VercelDomainResponse = {
  name?: string;
  apexName?: string;
  verified?: boolean;
  verification?: VercelVerificationChallenge[];
  error?: { code: string; message: string };
};

type VercelDomainConfigResponse = {
  misconfigured?: boolean;
  recommendedCNAME?: { rank: number; value: string }[];
  recommendedIPv4?: { rank: number; value: string[] }[];
  error?: { code: string; message: string };
};

export type DomainConnectResult = {
  ok: boolean;
  verified: boolean;
  message: string;
  records: { type: string; name: string; value: string }[];
};

// Platformun kendi alan adları hiçbir kuruma bağlanamaz ve asla Vercel
// projesinden kaldırılmaz. Eskiden bir müşteri yöneticisi ör.
// www.arvo-os.com'u kendi kurumuna kaydedip sonra alanı temizleyerek
// platform alan adını projeden sildirebiliyordu.
const PLATFORM_DOMAINS = ["arvo-os.com", "vercel.app"];

export function isPlatformDomain(domain: string) {
  const name = domain.trim().toLowerCase().replace(/\.$/, "");
  return PLATFORM_DOMAINS.some((root) => name === root || name.endsWith(`.${root}`));
}

function vercelConfig() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";
  return { token, projectId, teamId };
}

function apiUrl(path: string, teamId: string) {
  const base = `https://api.vercel.com${path}`;
  return teamId ? `${base}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : base;
}

function isApexDomain(domain: string) {
  return domain.split(".").length <= 2;
}

function recordHintsFor(domain: string): { type: string; name: string; value: string }[] {
  return isApexDomain(domain)
    ? [{ type: "A", name: "@", value: "76.76.21.21" }]
    : [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }];
}

/**
 * Adds a domain to the Vercel project.
 *
 * allowExisting: yalnızca kurumun ZATEN kayıtlı alan adının durumunu
 * tazelerken true. Eskiden Vercel "zaten ekli" dediğinde bu başarı
 * sayılıyordu; projede bağlı ama hiçbir kuruma ait olmayan (ör. platformun
 * kendi) alan adları bu yolla sahiplenilebiliyordu.
 */
export async function connectDomainToVercel(
  domain: string,
  { allowExisting = false }: { allowExisting?: boolean } = {},
): Promise<DomainConnectResult> {
  if (isPlatformDomain(domain)) {
    return { ok: false, verified: false, message: "Bu alan adı platforma ait; kendi alan adınızı girin (örn. panel.firma.com).", records: [] };
  }
  const { token, projectId, teamId } = vercelConfig();
  if (!token || !projectId) {
    return { ok: false, verified: false, message: "Vercel entegrasyonu yapılandırılmamış (VERCEL_TOKEN / VERCEL_PROJECT_ID eksik).", records: [] };
  }

  const addResponse = await fetch(apiUrl(`/v10/projects/${projectId}/domains`, teamId), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: domain }),
  });
  const addData = (await addResponse.json().catch(() => ({}))) as VercelDomainResponse;

  if (!addResponse.ok) {
    const alreadyAttached = addData?.error?.code === "domain_already_in_use" || (addResponse.status === 400 && /already/i.test(addData?.error?.message ?? ""));
    if (!alreadyAttached) {
      return { ok: false, verified: false, message: addData?.error?.message || "Alan adı Vercel'e eklenemedi.", records: recordHintsFor(domain) };
    }
    if (!allowExisting) {
      return { ok: false, verified: false, message: "Bu alan adı zaten kullanımda (başka bir kuruma veya projeye bağlı).", records: [] };
    }
  }

  // Ekleme cevabı (özellikle "zaten ekli" durumunda) doğrulama bilgisini
  // içermeyebilir — güncel, kesin durumu ayrı bir uçtan çekiyoruz.
  let ownershipVerified = Boolean(addData.verified);
  let ownershipRecords: { type: string; name: string; value: string }[] = (addData.verification ?? []).map((item) => ({ type: item.type.toUpperCase(), name: item.domain, value: item.value }));
  try {
    const stateResponse = await fetch(apiUrl(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, teamId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stateData = (await stateResponse.json().catch(() => ({}))) as VercelDomainResponse;
    if (stateResponse.ok) {
      ownershipVerified = Boolean(stateData.verified);
      ownershipRecords = (stateData.verification ?? []).map((item) => ({ type: item.type.toUpperCase(), name: item.domain, value: item.value }));
    }
  } catch {
    // güncel durum çekilemezse, eklemeden gelen veriyle devam edilir
  }

  // Asıl yönlendirme kaydı (CNAME/A) bu alan adına özel Vercel önerisi
  // olmalı. Aynı uç DNS'in doğru yapılandırılıp yapılandırılmadığını da
  // söylüyor (misconfigured).
  let routingRecords: { type: string; name: string; value: string }[] = [];
  let misconfigured: boolean | undefined;
  try {
    const configResponse = await fetch(apiUrl(`/v6/domains/${encodeURIComponent(domain)}/config`, teamId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const config = (await configResponse.json().catch(() => ({}))) as VercelDomainConfigResponse;
    if (configResponse.ok) misconfigured = config.misconfigured;
    const recommendedCname = config.recommendedCNAME?.[0]?.value;
    const recommendedIp = config.recommendedIPv4?.[0]?.value?.[0];
    if (recommendedCname) {
      routingRecords = [{ type: "CNAME", name: isApexDomain(domain) ? "@" : domain.split(".")[0], value: recommendedCname }];
    } else if (recommendedIp) {
      routingRecords = [{ type: "A", name: "@", value: recommendedIp }];
    }
  } catch {
    // config endpoint unreachable; fall through to the generic hint below
  }

  const records = [...ownershipRecords, ...(routingRecords.length ? routingRecords : recordHintsFor(domain))];
  // "Doğrulandı" yalnızca sahiplik doğrulanmış VE DNS doğru yönlendiriyorsa.
  // Eskiden yalnızca sahiplik bayrağına bakılıyordu; DNS'i hiç ayarlanmamış
  // alan adı hemen "doğrulandı" görünüyordu.
  const verified = ownershipVerified && misconfigured === false;

  return {
    ok: true,
    verified,
    message: verified
      ? "Alan adı doğrulandı."
      : "Alan adı eklendi, DNS kayıtlarının doğrulanması bekleniyor.",
    records,
  };
}

/** Re-checks whether a previously-added domain's DNS is now correctly configured. */
export async function checkVercelDomainStatus(domain: string): Promise<{ ok: boolean; verified: boolean; message: string }> {
  const { token, teamId } = vercelConfig();
  if (!token) return { ok: false, verified: false, message: "Vercel entegrasyonu yapılandırılmamış." };

  const response = await fetch(apiUrl(`/v6/domains/${encodeURIComponent(domain)}/config`, teamId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await response.json().catch(() => ({}))) as VercelDomainConfigResponse;
  if (!response.ok) return { ok: false, verified: false, message: data?.error?.message || "Durum kontrol edilemedi." };

  const verified = data.misconfigured === false;
  return { ok: true, verified, message: verified ? "Alan adı doğrulandı ve aktif." : "DNS kayıtları henüz doğrulanmadı; yayılması birkaç saat sürebilir." };
}

/** Removes a domain from the Vercel project (used when a customer changes/clears their custom domain). */
export async function disconnectDomainFromVercel(domain: string): Promise<void> {
  if (isPlatformDomain(domain)) return;
  const { token, projectId, teamId } = vercelConfig();
  if (!token || !projectId) return;
  await fetch(apiUrl(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`, teamId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}
