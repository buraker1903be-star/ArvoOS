import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { istanbulDateTime } from "@/lib/istanbul-date";
import { createSupportTicket, replySupportTicket, updateSupportTicketStatus } from "./actions";
import "./support.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";
import { modulGerek } from "@/lib/modul-kapisi";

type Message = { id:string; body:string; is_staff:boolean; created_at:string };
type Ticket = { id:string; subject:string; category:string; priority:string; status:string; last_message_at:string; organizations:{name?:string}|{name?:string}[]|null; support_messages:Message[] };
const statusNames:Record<string,string>={open:"Açık",in_progress:"İşlemde",waiting_customer:"Müşteri bekleniyor",resolved:"Çözüldü",closed:"Kapalı"};
const priorityNames:Record<string,string>={low:"Düşük",normal:"Normal",high:"Yüksek",urgent:"Acil"};
/*
  KATEGORİ ETİKETLERİ (15.10.2026). Durum ve öncelik için harita vardı,
  kategori için yoktu: kart `{ticket.category.toUpperCase()}` yazıyordu
  ve kiracı formda "Faturalama" seçtikten sonra kendi talebinde
  "BILLING" görüyordu — müşteriye görünen ekranda ham İngilizce kod.
  Dört değer de sütunun CHECK kısıtından; formdaki seçeneklerin aynısı.
*/
const categoryNames:Record<string,string>={general:"Genel",technical:"Teknik",billing:"Faturalama",feature:"Özellik talebi"};

export default async function SupportPage(){
  const { supabase,membership,isPlatformOwner,modules }=await getPanelContext();
  modulGerek(modules, "support");
  let query=supabase.from("support_tickets").select("id,subject,category,priority,status,last_message_at,organizations(name),support_messages(id,body,is_staff,created_at)").order("last_message_at",{ascending:false});
  if(!isPlatformOwner) query=query.eq("organization_id",membership.organization_id);
  const {data,error}=await query;
  if(error) throw new Error("Destek talepleri okunamadı: "+error.message);
  const tickets=(data??[]) as Ticket[];
  const openCount=tickets.filter((t)=>!["resolved","closed"].includes(t.status)).length;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">DESTEK MERKEZİ</small><h1>{isPlatformOwner?"Müşteri destek operasyonu":"Destek talepleriniz"}</h1><p>{isPlatformOwner?"Tüm kurum taleplerini öncelik ve durum bazında yönetin.":"Teknik, faturalama ve ürün taleplerinizi oluşturun; yanıtları aynı konuşmada takip edin."}{isPlatformOwner?null:<> &quot;Nasıl yapılır&quot; soruları için önce <Link href="/panel/kilavuz">Kullanım kılavuzu</Link>na bakabilirsiniz.</>}</p></div><span className="status-pill">{openCount} açık talep</span></div>
    <section className="support-layout">
      {!isPlatformOwner?<article className="panel-card support-create"><small>YENİ TALEP</small><h3>Destek kaydı oluştur</h3><form className="panel-form kayit-formu" action={createSupportTicket}><label className="wide"><span>Konu<b className="req" aria-hidden="true">*</b></span><input name="subject" required minLength={3} maxLength={180} placeholder="Örn. Sözleşme bağlantısı açılmıyor"/></label><label>Kategori<select name="category" defaultValue="general"><option value="general">Genel</option><option value="technical">Teknik</option><option value="billing">Faturalama</option><option value="feature">Özellik talebi</option></select></label><label>Öncelik<select name="priority" defaultValue="normal"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label><label className="wide"><span>Açıklama<b className="req" aria-hidden="true">*</b></span><textarea name="body" required maxLength={5000} placeholder="Ne oldu, hangi ekranda, ne bekliyordunuz?"/></label><div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">Talebi gönder</button></div></form></article>:null}
      <section className="support-list">{tickets.length?tickets.map((ticket)=>{const org=Array.isArray(ticket.organizations)?ticket.organizations[0]:ticket.organizations;const messages=[...(ticket.support_messages??[])].sort((a,b)=>a.created_at.localeCompare(b.created_at));return <article className="panel-card support-ticket" key={ticket.id}><div className="support-head"><div><small>{priorityNames[ticket.priority]??ticket.priority} ÖNCELİK · {(categoryNames[ticket.category]??ticket.category).toLocaleUpperCase("tr-TR")}</small><h3>{ticket.subject}</h3><p>{isPlatformOwner?(org?.name??"Kurum"):"Destek kaydı"} · {istanbulDateTime(ticket.last_message_at)}</p></div><span className={"support-status status-"+ticket.status}>{statusNames[ticket.status]??ticket.status}</span></div><div className="support-thread">{messages.map((message)=><div className={message.is_staff?"support-message staff":"support-message"} key={message.id}><b>{message.is_staff?"ArvoOS Destek":"Kurum"}</b><p>{message.body}</p><small>{istanbulDateTime(message.created_at)}</small></div>)}</div><div className="support-actions"><form action={replySupportTicket}><input type="hidden" name="ticket_id" value={ticket.id}/><textarea name="body" required maxLength={5000} placeholder="Yanıtınızı yazın"/><button type="submit">Yanıt gönder</button></form>{isPlatformOwner?<form action={updateSupportTicketStatus}><input type="hidden" name="ticket_id" value={ticket.id}/><select name="status" defaultValue={ticket.status}><option value="open">Açık</option><option value="in_progress">İşlemde</option><option value="waiting_customer">Müşteri bekleniyor</option><option value="resolved">Çözüldü</option><option value="closed">Kapalı</option></select><button type="submit">Durumu güncelle</button></form>:null}</div></article>}):<div className="panel-card panel-empty">Henüz destek talebi bulunmuyor.</div>}</section>
    </section>
  </>;
}