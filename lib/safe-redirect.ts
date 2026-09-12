// Kullanıcıdan gelen "next" gibi dönüş adreslerini yalnızca bu sitedeki göreli
// yollara izin verecek şekilde temizler. Aksi halde "?next=https://kotu.site"
// ile şifre belirleyen kullanıcı sahte bir giriş sayfasına yönlendirilebiliyordu.
// "//kotu.site" ve "/\kotu.site" gibi tarayıcının başka siteye çevirdiği
// biçimler de URL ayrıştırılarak reddedilir.
const BASE = "https://arvoos.invalid";

export function safeNextPath(value: unknown, fallback = "/panel") {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/")) return fallback;
  try {
    const url = new URL(path, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
