import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { alanAdiKurumu } from "@/lib/alan-adi-kurumu";
import { kurumMarkasi } from "@/lib/takip-markasi";

/*
  Bu ekran YALNIZCA kurumun kendi alan adında var; platform
  adresinde (arvo-os.com/is-durumu) bir karşılığı yok. Orada 404
  dönmesi doğru — ama 200 ile dönüyordu.

  Sebep ve çözüm durum/[slug]/layout.tsx ile aynı: `loading.tsx`
  bir Suspense sınırı kuruyor, yanıt akmaya başladıktan sonra
  çağrılan `notFound()` durum kodunu değiştiremiyor. Denetim
  sınırın üstüne, yerleşime alındı.
*/
export default async function IsDurumuYerlesimi({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const supabase = await createClient();
  const organizationId = await alanAdiKurumu(supabase, host);
  if (!organizationId) notFound();
  if (!(await kurumMarkasi(supabase, organizationId))) notFound();
  return children;
}
