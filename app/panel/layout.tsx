import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { tenantTheme } from "@/lib/tenant-theme";
import { logout } from "./actions";
import { PanelNavigation } from "./panel-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { PanelBreadcrumb } from "./panel-breadcrumb";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import { GlobalActionFeedback } from "./global-action-feedback";
import { MobileDrawer } from "./mobile-drawer";
import { PresenceHeartbeat } from "./presence-heartbeat";
import { MessagesDrawer } from "./messages-drawer";
import "./panel-tokens.css";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";
import "./panel-top-actions.css";
import "./sidebar-workspace-switcher.css";
import "./panel-mobile.css";
import "./mobile-drawer.css";
import "./messages-drawer.css";
import "./panel-compact.css";
import "./panel-premium.css";

export const metadata: Metadata = {
  title: "ArvoOS | Yönetim Merkezi",
  description: "ArvoOS güvenli kurum ve platform çalışma alanı",
};

const roleNames: Record<string, string> = {
  owner: "Kurum Sahibi",
  admin: "Yönetici",
  manager: "Yönetici",
  member: "Satış Personeli",
  operasyoncu: "Operasyon Personeli",
};

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys } = await getPanelContext();
  const roleName = isPlatformOwner ? "Kurucu / Owner" : roleNames[membership.role] ?? "Kurum Kullanıcısı";
  const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");
  let notificationQuery = supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  notificationQuery = isPlatformOwner
    ? notificationQuery.eq("audience", "founder")
    : notificationQuery.eq("audience", "organization").eq("organization_id", membership.organization_id).or(`user_id.is.null,user_id.eq.${userId}`);
  // Beyaz etiket (white-label) deneyimi: platformun kendi kurumu (arvo-os)
  // dışında, panel navigasyonu artık sabit "ArvoOS" markası yerine
  // kurumun kendi logosunu ve tabela unvanını gösteriyor.
  const isPlatformOrg = organization.slug === "arvo-os";
  const brandName = isPlatformOrg ? "ArvoOS" : (organization.display_name || organization.name);
  const brandLogoUrl = isPlatformOrg ? null : organization.logo_url;
  const brandTagline = isPlatformOrg ? "BUSINESS OPERATING SYSTEM" : "YÖNETİM PANELİ";
  const ownEmployeeQuery = supabase.from("hr_employees").select("id").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  const messageQueries = hasMessages ? Promise.all([
    supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id",membership.organization_id).eq("employment_status","active").not("user_id","is",null).order("full_name"),
    supabase.from("message_channels").select("id,name,description,channel_type,direct_key").eq("organization_id",membership.organization_id).order("updated_at",{ascending:false}),
    supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id",membership.organization_id),
    supabase.from("message_read_states").select("channel_id,last_read_at").eq("organization_id",membership.organization_id).eq("user_id",userId),
  ]) : Promise.resolve([{data:[]},{data:[]},{data:[]},{data:[]}]);
  const [{ count: notificationUnreadCount }, { data: ownEmployee }, messageResults] = await Promise.all([
    notificationQuery,
    ownEmployeeQuery,
    messageQueries,
  ]);
  const [{data:messageEmployees},{data:messageChannels},{data:presenceRows},{data:messageReadRows}] = messageResults;
  const presenceMap=new Map((presenceRows??[]).map((row)=>[row.user_id,row.last_seen_at]));
  const drawerPeople=(messageEmployees??[]).map((employee)=>({userId:employee.user_id as string,name:employee.full_name,jobTitle:employee.job_title,lastSeenAt:presenceMap.get(employee.user_id as string)??null}));
  const drawerChannels=(messageChannels??[]).map((channel)=>({id:channel.id,name:channel.name,description:channel.description,channelType:channel.channel_type??"group",directKey:channel.direct_key}));
  const readableChannelIds=drawerChannels.map((channel)=>channel.id);
  const pendingAgreementQuery = ownEmployee ? supabase.from("hr_confidentiality_agreements").select("id").eq("employee_id", ownEmployee.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null });
  const unreadMessagesQuery = hasMessages&&readableChannelIds.length?supabase.from("internal_messages").select("channel_id,created_at").eq("organization_id",membership.organization_id).in("channel_id",readableChannelIds).neq("sender_id",userId).order("created_at",{ascending:false}).limit(1000):Promise.resolve({data:[]});
  const [{ data: pendingAgreement }, { data: unreadMessageRows }] = await Promise.all([pendingAgreementQuery, unreadMessagesQuery]);
  const lastReadByChannel=new Map((messageReadRows??[]).map((row)=>[row.channel_id,new Date(row.last_read_at).getTime()]));
  const unreadByChannel:Record<string,number>={};
  for(const message of unreadMessageRows??[]){if(new Date(message.created_at).getTime()>(lastReadByChannel.get(message.channel_id)??0))unreadByChannel[message.channel_id]=(unreadByChannel[message.channel_id]??0)+1;}
  const messageUnreadCount=Object.values(unreadByChannel).reduce((total,count)=>total+count,0);

  // Beyaz etiket: kurum kendi marka rengini seçtiyse tüm panel vurgusu
  // (buton, aktif menü, rozet, odak halkası) o renge döner. Seçmediyse
  // panel-tokens.css içindeki fallback ArvoOS yeşilini kullanır.
  const tenantStyle = isPlatformOrg ? {} : tenantTheme(organization.brand_color);

  return <div className="panel-root" style={tenantStyle}><main className="panel-frame">
    <PresenceHeartbeat />
    <NavProgress />
    <GlobalActionFeedback />
    <MobileDrawer modules={modules} organizationName={organization.name} roleName={roleName} isPlatformOwner={isPlatformOwner} role={membership.role} brandName={brandName} brandLogoUrl={brandLogoUrl} brandTagline={brandTagline} hiddenModuleKeys={[...hiddenModuleKeys]} notificationUnreadCount={notificationUnreadCount??0} messageUnreadCount={messageUnreadCount} />
    <aside id="panel-sidebar" className="panel-sidebar">
      <Link className="panel-brand" href="/panel">{brandLogoUrl?<img src={brandLogoUrl} alt={brandName}/>:<i>{brandName.slice(0,1).toUpperCase()}</i>}<span><b>{brandName}</b><small>{brandTagline}</small></span></Link>
      <div className="panel-org panel-org-switchable">
        <WorkspaceSwitcher workspaces={workspaces} activeOrganizationId={organization.id} variant="card" />
      </div>
      <PanelNavigation modules={modules} isPlatformOwner={isPlatformOwner} role={membership.role} hiddenModuleKeys={[...hiddenModuleKeys]} />
      <div className="panel-sidebar-footer">
        <div className="panel-security"><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        <form className="panel-logout" action={logout}><button type="submit">↪ <span>Çıkış yap</span></button></form>
      </div>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar">
        <PanelBreadcrumb brandName={isPlatformOwner ? "Kurucu Merkezi" : brandName} />
        <div className="panel-top-actions">
          <div className="panel-quick-actions" aria-label="Hızlı erişim">
            {hasMessages ? <MessagesDrawer organizationId={membership.organization_id} userId={userId} people={drawerPeople} initialChannels={drawerChannels} initialUnreadByChannel={unreadByChannel}/> : null}
            <Link className="panel-quick-action" href="/panel/notifications" aria-label={`Bildirimler${notificationUnreadCount?`, ${notificationUnreadCount} okunmamış`:""}`}><span className="panel-quick-icon" aria-hidden="true">♢</span><b>Bildirimler</b>{notificationUnreadCount?<span className="panel-unread-badge">{notificationUnreadCount>99?"99+":notificationUnreadCount}</span>:null}</Link>
          </div>
          <ThemeToggle />
          <div className="panel-user"><span>{organization.name[0]}</span><p><b>{roleName}</b><small>{organization.plan_code.toUpperCase()}</small></p></div>
        </div>
      </header>
      <div className="panel-content">{pendingAgreement?<Link href={`/panel/confidentiality/${pendingAgreement.id}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:18,padding:"15px 18px",borderRadius:14,background:"#fff7e8",border:"1px solid #efd59c",color:"#6b4912",fontWeight:750,textDecoration:"none"}}><span>Gizlilik sözleşmeniz imza bekliyor.</span><b>İncele ve İmzala →</b></Link>:null}{children}</div>
    </section>
  </main></div>;
}
