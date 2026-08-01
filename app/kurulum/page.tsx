import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SetupPendingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return <main className="min-h-screen grid place-items-center bg-[#f4f6f3] p-6 text-[#06264e]"><section className="w-full max-w-xl rounded-3xl border border-[#e1e6df] bg-white p-12 text-center shadow-xl">
    <span className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-xl bg-[#6f9844] font-bold text-white">A</span>
    <small className="font-bold tracking-[.15em] text-[#6f9844]">ARVOOS KURUM PANELİ</small>
    <h1 className="my-5 text-4xl font-bold">Hesabınız doğrulandı.</h1>
    <p className="leading-7 text-[#6c7784]">Kullanıcınıza henüz kurum ve paket atanmamış. Kurulum tamamlandığında çalışma alanınız otomatik olarak açılır.</p>
    <a className="mt-7 inline-block font-bold text-[#6f9844]" href="mailto:info@arvo-os.com?subject=ArvoOS%20kurum%20ataması">Kurulum desteği alın</a>
  </section></main>;
}
