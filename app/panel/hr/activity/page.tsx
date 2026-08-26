import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { ActivityAutoRefresh } from "./activity-auto-refresh";
import "./activity.css";

type Presence={user_id:string;last_seen_at:string;current_path:string|null};
type Employee={id:string;user_id:string|null;full_name:string;job_title:string|null};
type Session={id:string;user_id:string;employee_id:string|null;login_at:string;last_seen_at:string;logout_at:string|null;logout_reason:string|null;ip_address:string|null};
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toLocaleUpperCase("tr-TR");
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"}):"—";
const duration=(start:string,end:string)=>{const ms=Math.max(0,new Date(end).getTime()-new Date(start).getTime());const minutes=Math.round(ms/60000);if(minutes<60)return minutes+" dk";return Math.floor(minutes/60)+" sa "+minutes%60+" dk";};
const reasonNames:Record<string,string>={manual:"Normal çıkış",timeout:"Zaman aşımı",workspace_switch:"Çalışma alanı değişti"};

export default async function PersonnelActivityPage(){
 const {supabase,membership,modules}=await getPanelContext();
 if(!modules.some(module=>module.code==="hr"))throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
 if(!["owner","admin","manager"].includes(membership.role))throw new Error("Personel hareketlerini görme yetkiniz yok.");
 const [{data:presenceData},{data:employeeData},{data:sessionData}]=await Promise.all([
  supabase.from("user_presence").select("user_id,last_seen_at,current_path").eq("organization_id",membership.organization_id).order("last_seen_at",{ascending:false}),
  supabase.from("hr_employees").select("id,user_id,full_name,job_title").eq("organization_id",membership.organization_id).order("full_name"),
  supabase.from("user_session_logs").select("id,user_id,employee_id,login_at,last_seen_at,logout_at,logout_reason,ip_address").eq("organization_id",membership.organization_id).order("login_at",{ascending:false}).limit(250),
 ]);
 const presences=(presenceData??[]) as Presence[];const employees=(employeeData??[]) as Employee[];const sessions=(sessionData??[]) as Session[];
 const employeeByUser=new Map(employees.filter(item=>item.user_id).map(item=>[item.user_id!,item]));const employeeById=new Map(employees.map(item=>[item.id,item]));const presenceByUser=new Map(presences.map(item=>[item.user_id,item]));
 const onlineCutoff=Date.now()-2*60*1000;const connected=employees.filter(item=>item.user_id);
 const onlineCount=connected.filter(item=>new Date(presenceByUser.get(item.user_id!)?.last_seen_at??0).getTime()>=onlineCutoff).length;
 const today=new Date();today.setHours(0,0,0,0);const todaySessions=sessions.filter(item=>new Date(item.login_at)>=today);
 const openSessions=sessions.filter(item=>!item.logout_at&&new Date(item.last_seen_at).getTime()>=onlineCutoff);
 const averageMinutes=todaySessions.length?Math.round(todaySessions.reduce((total,item)=>total+(new Date(item.logout_at??item.last_seen_at).getTime()-new Date(item.login_at).getTime()),0)/todaySessions.length/60000):0;
 return <div className="activity-page"><ActivityAutoRefresh/>
  <div className="panel-pagehead"><div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Personel Hareketleri</h1><p>Çevrimiçi durum, son görülme ve giriş-çıkış geçmişi 30 saniyede bir yenilenir.</p></div><div className="panel-page-actions"><Link className="panel-secondary" href="/panel/hr">← Personellere Dön</Link></div></div>
  <section className="activity-metrics"><article><small>ÇEVRİMİÇİ</small><strong>{onlineCount}</strong><span>Son 2 dakikada aktif</span></article><article><small>PANEL ERİŞİMİ</small><strong>{connected.length}</strong><span>Hesabı bağlı personel</span></article><article><small>BUGÜNKÜ GİRİŞ</small><strong>{todaySessions.length}</strong><span>Bugün başlayan oturum</span></article><article><small>ORTALAMA OTURUM</small><strong>{averageMinutes} dk</strong><span>Bugünkü kayıtlar</span></article></section>
  <section className="activity-grid">
   <div className="panel-card"><div className="panel-card-head"><div><small>ANLIK DURUM</small><h2>Personeller</h2></div><span>{openSessions.length} aktif oturum</span></div><div className="activity-list">
    {connected.map(employee=>{const presence=presenceByUser.get(employee.user_id!);const online=Boolean(presence&&new Date(presence.last_seen_at).getTime()>=onlineCutoff);const detail=online?(presence?.current_path||"Panel"):(presence?"Son görülme "+dateTime(presence.last_seen_at):"Henüz giriş yapmadı");return <article className="activity-person" key={employee.id}><div className="activity-avatar">{initials(employee.full_name)}</div><div><b>{employee.full_name}</b><small>{employee.job_title||"Pozisyon belirtilmedi"} · {detail}</small></div><span className={online?"activity-status online":"activity-status"}>{online?"Çevrimiçi":"Çevrimdışı"}</span></article>;})}
    {!connected.length?<div className="activity-empty">Panel hesabı bağlı personel bulunmuyor.</div>:null}
   </div></div>
   <div className="panel-card"><div className="panel-card-head"><div><small>OTURUM GEÇMİŞİ</small><h2>Giriş ve Çıkış Kayıtları</h2></div></div><div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>PERSONEL</th><th>GİRİŞ</th><th>ÇIKIŞ / SON GÖRÜLME</th><th>SÜRE</th><th>DURUM</th></tr></thead><tbody>
    {sessions.map(session=>{const employee=(session.employee_id?employeeById.get(session.employee_id):undefined)||employeeByUser.get(session.user_id);const active=!session.logout_at&&new Date(session.last_seen_at).getTime()>=onlineCutoff;const end=session.logout_at??session.last_seen_at;return <tr key={session.id}><td><b>{employee?.full_name||"Kullanıcı"}</b><small>{employee?.job_title||session.ip_address||""}</small></td><td>{dateTime(session.login_at)}</td><td>{dateTime(end)}</td><td>{duration(session.login_at,end)}</td><td><span className={active?"activity-status online":"activity-status"}>{active?"Aktif":session.logout_reason?(reasonNames[session.logout_reason]||"Çıkış"):"Bağlantı kapandı"}</span></td></tr>;})}
   </tbody></table>{!sessions.length?<div className="activity-empty">Henüz oturum kaydı oluşmadı.</div>:null}</div></div>
  </section>
 </div>;
}
