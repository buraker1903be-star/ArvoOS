import Link from "next/link";
import { redirect } from "next/navigation";
import { getPanelContextErisimdenBagimsiz } from "@/lib/panel-context";
import "./erisim-kapali.css";

/*
  ERİŞİM KAPALI (14.10.2026).

  Kurucu, ödemesi yapılmayan kurumun ArvoOS erişimini konsoldan kapatınca
  (çekirdek lisans 'suspended') panelin her sayfası ve işlemi buraya
  yönlendiriyor (lib/panel-context getPanelContext).

  Kurum sahibi ve yöneticisi buradan ABONELİK ekranına gidebiliyor:
  ödeme bildirimi ya da kartla ödeme o ekranda ve kilitliyken de açık
  — yoksa erişimi geri açtırmanın yolu kalmazdı. Ödeme onaylanınca lisans
  aktif olur, erişim kendiliğinden açılır. Diğer çalışanlara kime
  başvuracakları yazıyor.

  Verisi silinmedi: yalnızca erişim kapalı. Bunu açıkça yazıyoruz, çünkü
  kilit ekranını gören birinin ilk sorusu "verilerimiz gitti mi" oluyor.
*/
export default async function ErisimKapali() {
  const { organization, membership, erisimKapali, kapanmaNedeni } = await getPanelContextErisimdenBagimsiz();
  if (!erisimKapali) redirect("/panel");
  const yonetici = membership.role === "owner" || membership.role === "admin";
  const ad = organization.display_name || organization.name;

  return (
    <main className="erisim-kapali">
      <section className="panel-card erisim-kapali-kart" aria-labelledby="erisim-kapali-baslik">
        <span className="erisim-kapali-simge" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </span>
        <small className="panel-kicker">{ad}</small>
        <h1 id="erisim-kapali-baslik">ArvoOS erişiminiz geçici olarak kapatıldı</h1>
        <p>
          {kapanmaNedeni || "Aboneliğinizin ödemesi alınamadığı için panel erişimi durduruldu."}
          {" "}Verileriniz silinmedi; ödeme onaylandığında erişim kendiliğinden açılır.
        </p>
        {yonetici ? (
          <div className="erisim-kapali-eylem">
            <Link className="panel-primary" href="/panel/billing">Ödeme yap</Link>
          </div>
        ) : (
          <p className="erisim-kapali-not">Erişimi geri açtırmak için kurum yöneticinize başvurun.</p>
        )}
      </section>
    </main>
  );
}
