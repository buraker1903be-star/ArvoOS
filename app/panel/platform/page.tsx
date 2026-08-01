import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

export default async function PlatformPage() {
  const { supabase, membership, organization, modules, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) notFound();

  const [
    { count: memberCount },
    { count: requestCount },
    { data: plans },
  ] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("is_active", true),
    supabase.from("crm_requests").select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id),
    supabase.from("plans").select("code,name").eq("is_active", true).order("created_at"),
  ]);

  const areas = [
    { icon: "KR", title: "Kurum Çekirdeği", description: "Kurum kimliği, kullanım durumu ve özel alan adı kapsamı.", value: organization.status === "active" ? "Aktif" : "Kurulumda" },
    { icon: "PK", title: "Paketler ve Modüller", description: "Tanımlı paket kataloğu ve bu kuruma açılan çalışma alanları.", value: `${plans?.length ?? 0} paket · ${modules.length} modül` },
    { icon: "KY", title: "Kullanıcılar ve Roller", description: "RLS ile kurum sınırında tutulan aktif kullanıcı erişimleri.", value: `${memberCount ?? 0} aktif kullanıcı` },
    { icon: "DN", title: "Denetim ve Güvenlik", description: "Kurum üyeliği, rol ve modül izinleri sunucu tarafında doğrulanır.", value: "RLS korumalı" },
  ];

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">YALNIZCA ARVOOS KURUCU ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>Ürün çekirdeğinin canlı durumunu ve kurum erişim kapsamını tek merkezden izleyin.</p></div><span className="owner-badge">◇ KURUCU YETKİSİ</span></div>
    <section className="platform-overview">
      <div><small>CANLI PLATFORM ÖZETİ</small><h2>ArvoOS yönetim katmanı çalışıyor.</h2><p>Bu göstergeler doğrudan kurum, paket, üyelik ve modül kayıtlarından okunur. Erişim mevcut RLS sınırlarının dışına çıkmaz.</p></div>
      <dl><div><dt>AKTİF KURUM</dt><dd>{organization.name}</dd></div><div><dt>PAKET</dt><dd>{organization.plan_code}</dd></div><div><dt>CRM TALEBİ</dt><dd>{requestCount ?? 0}</dd></div><div><dt>ROL</dt><dd>Kurucu</dd></div></dl>
    </section>
    <section className="platform-grid">{areas.map((area) => <article className="panel-card platform-card" key={area.title}><i>{area.icon}</i><span>{area.value}</span><h3>{area.title}</h3><p>{area.description}</p><small className="platform-coming">CANLI VERİYLE DOĞRULANDI</small></article>)}</section>
    <div className="platform-note"><span>i</span><p><b>Kurucu erişimi kurum owner rolünden ayrıldı.</b> Yalnızca ArvoOS ana kurumunun owner hesabı bu yönetim alanını görebilir.</p><Link href="/panel">Genel bakışa dön →</Link></div>
  </>;
}
