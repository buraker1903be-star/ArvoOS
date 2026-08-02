import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { createChannel, sendMessage } from "./actions";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "messages")) throw new Error("Mesajlaşma modülüne erişiminiz yok.");
  const { channel } = await searchParams;
  const canManage = ["owner","admin"].includes(membership.role);
  const { data: channels, error: channelError } = await supabase.from("message_channels")
    .select("id,name,description,is_private,created_at")
    .eq("organization_id", membership.organization_id)
    .order("name");
  if (channelError) throw new Error("Kanallar okunamadı: " + channelError.message);
  const activeChannel = (channels ?? []).find((item) => item.id === channel) ?? channels?.[0] ?? null;
  const { data: messages, error: messageError } = activeChannel ? await supabase.from("internal_messages")
    .select("id,body,sender_id,created_at")
    .eq("organization_id", membership.organization_id)
    .eq("channel_id", activeChannel.id)
    .order("created_at", { ascending: true })
    .limit(100) : { data: [], error: null };
  if (messageError) throw new Error("Mesajlar okunamadı: " + messageError.message);

  return <div style={{display:"flex",flexDirection:"column",gap:24}}>
    <div className="panel-pagehead"><div><small className="panel-kicker">KURUM İÇİ İLETİŞİM</small><h1>Mesajlar</h1><p>Ekip kanallarında hızlı ve kurum içinde güvenli iletişim kurun.</p></div><span className="status-pill">{channels?.length ?? 0} kanal</span></div>
    {canManage ? <details className="panel-card panel-action-details"><summary>+ Yeni kanal</summary><form className="panel-form" action={createChannel}><label>Kanal adı<input name="name" required minLength={2} maxLength={80}/></label><label>Açıklama<input name="description" maxLength={300}/></label><div className="wide form-actions"><button className="panel-primary" type="submit">Kanalı oluştur</button></div></form></details> : null}
    <section style={{display:"grid",gridTemplateColumns:"240px minmax(0,1fr)",gap:16}}>
      <aside className="panel-card" style={{padding:12}}><div className="section-heading"><div><small className="panel-kicker">KANALLAR</small><h2>Ekip alanları</h2></div></div><div style={{display:"flex",flexDirection:"column",gap:6}}>{(channels ?? []).map((item)=><Link className={activeChannel?.id===item.id?"panel-primary":"panel-secondary"} href={`/panel/messages?channel=${item.id}`} key={item.id}># {item.name}</Link>)}{!channels?.length?<p className="panel-muted">Henüz kanal yok.</p>:null}</div></aside>
      <article className="panel-card" style={{minHeight:480,display:"flex",flexDirection:"column",gap:16}}>
        <div className="section-heading"><div><small className="panel-kicker">AKTİF KANAL</small><h2>{activeChannel ? `# ${activeChannel.name}` : "Kanal seçin"}</h2>{activeChannel?.description?<p>{activeChannel.description}</p>:null}</div></div>
        <div style={{display:"flex",flexDirection:"column",gap:10,flex:1,overflowY:"auto",maxHeight:420}}>{(messages ?? []).map((message)=><div key={message.id} style={{padding:"12px 14px",border:"1px solid var(--ux-line)",borderRadius:10,background:message.sender_id===membership.user_id?"var(--ux-soft)":"#fff"}}><small>{new Date(message.created_at).toLocaleString("tr-TR")}</small><p style={{margin:"6px 0 0",whiteSpace:"pre-wrap"}}>{message.body}</p></div>)}{activeChannel && !messages?.length?<p className="panel-muted">Bu kanalda henüz mesaj yok.</p>:null}</div>
        {activeChannel ? <form className="panel-form" action={sendMessage}><input type="hidden" name="channel_id" value={activeChannel.id}/><label className="wide">Mesaj<textarea name="body" required minLength={1} maxLength={4000} placeholder="Mesajınızı yazın..."/></label><div className="wide form-actions"><button className="panel-primary" type="submit">Gönder</button></div></form> : null}
      </article>
    </section>
  </div>;
}