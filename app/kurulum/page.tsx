import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SetupPendingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return <main className="pending-shell"><section className="pending-card"><span>A</span><small>ARVOOS KURUM PANELİ</small><h1>Hesabınız doğrulandı.</h1><p>Kullanıcınıza henüz kurum ve paket atanmamış. Kurulum tamamlandığında çalışma alanınız otomatik olarak açılır.</p><a href="mailto:info@arvo-os.com?subject=ArvoOS%20kurum%20ataması">Kurulum desteği alın</a></section></main>;
}
