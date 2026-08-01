import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

const labels: Record<string, [string, string]> = {
  crm: ["◎", "Talep, teklif ve satış süreçleri"],
  operations: ["↗", "Görevler, terminler ve ilerleme"],
  finance: ["₺", "Gelir, gider ve tahsilat görünümü"],
  reporting: ["▦", "Yetkiye bağlı kurum raporları"],
  hr: ["◇", "Ekip ve organizasyon yönetimi"],
  documents: ["⌁", "Kurumsal belge merkezi"],
};

export default async function PanelPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: rows } = await supabase
    .from("organization_memberships")
    .select("organization_id,role,organizations(id,name,status,plan_code)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1);

  const membership = rows?.[0] as {
    organization_id: string;
    role: string;
    organizations: { id: string; name: string; status: string; plan_code: string } | { id: string; name: string; status: string; plan_code: string }[] | null;
  } | undefined;
  const organization = Array.isArray(membership?.organizations)
    ? membership.organizations[0]
    : membership?.organizations;

  if (!membership || !organization) {
    return <main className="pending-shell"><section className="pending-card"><span>A</span><small>ARVOOS KURUM PANELİ</small><h1>Hesabınız doğrulandı.</h1><p>Kullanıcınıza henüz kurum ve paket atanmamış. Kurulum ekibi erişim kapsamınızı tanımladığında çalışma alanınız otomatik olarak açılır.</p><a href="mailto:info@arvo-os.com?subject=ArvoOS%20kurum%20ataması">Kurulum desteği alın</a><form action={logout}><button>Güvenli çıkış</button></form></section></main>;
  }

  const { data: modules } = await supabase
    .from("organization_modules")
    .select("module_code,arvo_modules(name,description,sort_order)")
    .eq("organization_id", membership.organization_id)
    .eq("is_enabled", true);

  return <main className="panel-shell">
    <aside><div className="panel-logo"><span>A</span><b>ArvoOS</b></div><nav><a className="active" href="/panel">⌂ <span>Genel Bakış</span></a>{(modules ?? []).map((item) => <a key={item.module_code} href={"#"+item.module_code}>{labels[item.module_code]?.[0] ?? "•"} <span>{item.module_code}</span></a>)}</nav><form action={logout}><button>↪ <span>Güvenli çıkış</span></button></form></aside>
    <section className="panel-main"><header><div><small>{organization.name.toUpperCase()}</small><h1>Genel Bakış</h1></div><div className="user-chip"><span>{organization.name[0]}</span><p><b>Kurum kullanıcısı</b><small>{membership.role}</small></p></div></header>
      <section className="welcome"><div><small>KURUM ÇALIŞMA ALANI</small><h2>Hoş geldiniz.</h2><p>ArvoOS kurum ve paket çekirdeğiniz aktif. Yetkinize ve paketinize tanımlanan modüller güvenli biçimde sunulur.</p></div><div><span>Paket</span><b>{organization.plan_code}</b><small>{organization.status === "active" ? "Aktif kullanım" : "Kurulum sürecinde"}</small></div></section>
      <section className="panel-metrics"><article><span>ETKİN MODÜL</span><b>{modules?.length ?? 0}</b><small>Kurum paketine tanımlı</small></article><article><span>ERİŞİM ROLÜ</span><b>{membership.role}</b><small>Yetki kapsamınız</small></article><article><span>KURUM DURUMU</span><b>{organization.status}</b><small>Güncel sistem durumu</small></article></section>
      <section className="module-area"><div><small>ÇALIŞMA ALANLARI</small><h2>Etkin modülleriniz</h2></div><div className="panel-modules">{(modules ?? []).length ? (modules ?? []).map((item) => { const relation = item.arvo_modules as {name?:string;description?:string}|{name?:string;description?:string}[]|null; const mod=Array.isArray(relation)?relation[0]:relation; return <article id={item.module_code} key={item.module_code}><span>{labels[item.module_code]?.[0] ?? "•"}</span><small>ETKİN MODÜL</small><h3>{mod?.name ?? item.module_code}</h3><p>{labels[item.module_code]?.[1] ?? mod?.description}</p><b>Kurulum kapsamına göre açılacak →</b></article>; }) : <div className="empty">Kurumunuza ait modüller kurulum ekibi tarafından tanımlanıyor.</div>}</div></section>
    </section>
  </main>;
}
