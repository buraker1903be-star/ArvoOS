import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { hostFromHeaders, robotsFor } from "@/lib/site/host-rules";

// Host'a duyarlı robots.txt: arvo-os.com açık (yapay zekâ tarayıcıları
// dahil), app.arvo-os.com / kurum alan adları / önizlemeler tamamen kapalı.
// Kurallar lib/site/host-rules.ts içinde (test edilebilir saf fonksiyon).
export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsFor(hostFromHeaders(await headers()));
}
