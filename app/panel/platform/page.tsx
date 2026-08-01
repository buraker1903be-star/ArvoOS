import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";

const areas = [
  { icon: "KR", title: "Kurumlar", description: "Müşteri kurumlarını, durumlarını ve özel alan adlarını yönetin.", value: "Kurum yönetimi" },
  { icon: "PK", title: "Paketler ve Modüller", description: "Paket kapsamlarını ve kurumlara açılan modülleri belirleyin.", value: "6 etkin modül" },
  { icon: "KY", title: "Kullanıcılar ve Roller", description: "Owner, yönetici ve ekip rollerinin erişim kapsamını yönetin.", value: "Rol bazlı erişim" },
  { icon: "DN", title: "Denetim ve Güvenlik", description: "Kritik işlemleri, oturumları ve sistem güvenliğini izleyin.", value: "RLS korumalı" },
];

export default async function PlatformPage() {
  const { membership, organization, modules } = await getPanelContext();
  if (membership.role !== "owner") notFound();

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">YALNIZCA OWNER ERİŞİMİ</small><h1>Platform Yönetimi</h1><p>ArvoOS ürün çekirdeğini ve kurumsal müşterileri tek merkezden yönetin.</p></div><span className="owner-badge">◇ TAM YETKİ</span></div>
    <section className="platform-overview">
      <div><small>PLATFORM ÖZETİ</small><h2>ArvoOS yönetim katmanı hazır.</h2><p>Kurum, paket, kullanıcı ve modül çekirdeği güvenli biçimde çalışıyor. Yeni müşteriler bu merkezden yönetilecek.</p></div>
      <dl><div><dt>AKTİF KURUM</dt><dd>{organization.name}</dd></div><div><dt>PAKET</dt><dd>{organization.plan_code}</dd></div><div><dt>MODÜL</dt><dd>{modules.length}</dd></div><div><dt>ROL</dt><dd>Owner</dd></div></dl>
    </section>
    <section className="platform-grid">{areas.map((area) => <article className="panel-card platform-card" key={area.title}><i>{area.icon}</i><span>{area.value}</span><h3>{area.title}</h3><p>{area.description}</p><button type="button" disabled>Yönetim ekranı hazırlanıyor</button></article>)}</section>
    <div className="platform-note"><span>i</span><p><b>Bu alan kurum panelinden farklı bir ürün değildir.</b> Aynı ArvoOS arayüzü, owner rolünde platform yönetim araçlarını ek olarak gösterir.</p><Link href="/panel">Genel bakışa dön →</Link></div>
  </>;
}
