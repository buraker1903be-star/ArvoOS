import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { createChannel, createDirectConversation, sendMessage } from "./actions";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  channel_type: "channel" | "direct";
  created_at: string;
};

type Profile = { id: string; full_name: string | null; job_title: string | null };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "messages")) throw new Error("Mesajlaşma modülüne erişiminiz yok.");
  const { channel } = await searchParams;
  const canManage = ["owner","admin"].includes(membership.role);

  const [{ data: channelData, error: channelError }, { data: membershipData, error: membershipError }] = await Promise.all([
    supabase.from("message_channels")
      .select("id,name,description,is_private,channel_type,created_at")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: true }),
    supabase.from("organization_memberships")
      .select("user_id,role")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true),
  ]);
  if (channelError) throw new Error("Sohbetler okunamadı: " + channelError.message);
  if (membershipError) throw new Error("Ekip üyeleri okunamadı: " + membershipError.message);

  const memberIds = (membershipData ?? []).map((item) => item.user_id);
  const { data: profileData, error: profileError } = memberIds.length
    ? await supabase.from("profiles").select("id,full_name,job_title").in("id", memberIds)
    : { data: [], error: null };
  if (profileError) throw new Error("Kullanıcı profilleri okunamadı: " + profileError.message);

  const profiles = (profileData ?? []) as Profile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const teammates = (membershipData ?? [])
    .filter((item) => item.user_id !== userId)
    .map((item) => ({ userId: item.user_id, role: item.role, profile: profileMap.get(item.user_id) }))
    .sort((a,b) => (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? "", "tr"));

  const channels = (channelData ?? []) as Channel[];
  const directChannels = channels.filter((item) => item.channel_type === "direct");
  const teamChannels = channels.filter((item) => item.channel_type !== "direct");
  const directIds = directChannels.map((item) => item.id);
  const { data: directMemberData, error: directMemberError } = directIds.length
    ? await supabase.from("message_channel_members").select("channel_id,user_id").in("channel_id", directIds)
    : { data: [], error: null };
  if (directMemberError) throw new Error("Özel sohbet üyeleri okunamadı: " + directMemberError.message);

  const directTitle = new Map<string,string>();
  for (const directChannel of directChannels) {
    const otherId = (directMemberData ?? []).find((item) => item.channel_id === directChannel.id && item.user_id !== userId)?.user_id;
    const other = otherId ? profileMap.get(otherId) : null;
    directTitle.set(directChannel.id, other?.full_name || "Özel sohbet");
  }

  const activeChannel = channels.find((item) => item.id === channel) ?? teamChannels[0] ?? directChannels[0] ?? null;
  const { data: messages, error: messageError } = activeChannel ? await supabase.from("internal_messages")
    .select("id,body,sender_id,created_at")
    .eq("organization_id", membership.organization_id)
    .eq("channel_id", activeChannel.id)
    .order("created_at", { ascending: true })
    .limit(100) : { data: [], error: null };
  if (messageError) throw new Error("Mesajlar okunamadı: " + messageError.message);

  const activeTitle = activeChannel?.channel_type === "direct"
    ? directTitle.get(activeChannel.id) ?? "Özel sohbet"
    : activeChannel ? `# ${activeChannel.name}` : "Sohbet seçin";

  return <div style={{display:"flex",flexDirection:"column",gap:24}}>
    <div className="panel-pagehead">
      <div><small className="panel-kicker">KURUM İÇİ İLETİŞİM</small><h1>Mesajlar</h1><p>Ekip kanallarında veya bir ekip üyesiyle güvenli biçimde iletişim kurun.</p></div>
      <span className="status-pill">{teamChannels.length} kanal · {directChannels.length} özel sohbet</span>
    </div>

    <section className="panel-card" style={{padding:16}}>
      <form className="panel-form" action={createDirectConversation}>
        <label>Kişiye özel mesaj
          <select name="target_user_id" required defaultValue="">
            <option value="" disabled>Ekip üyesi seçin</option>
            {teammates.map((item) => <option value={item.userId} key={item.userId}>{item.profile?.full_name || "İsimsiz kullanıcı"}{item.profile?.job_title ? ` · ${item.profile.job_title}` : ""}</option>)}
          </select>
        </label>
        <div className="form-actions" style={{alignSelf:"end"}}><button className="panel-primary" type="submit">Sohbeti aç</button></div>
      </form>
    </section>

    {canManage ? <details className="panel-card panel-action-details"><summary>+ Yeni ekip kanalı</summary><form className="panel-form" action={createChannel}><label>Kanal adı<input name="name" required minLength={2} maxLength={80}/></label><label>Açıklama<input name="description" maxLength={300}/></label><div className="wide form-actions"><button className="panel-primary" type="submit">Kanalı oluştur</button></div></form></details> : null}

    <section style={{display:"grid",gridTemplateColumns:"260px minmax(0,1fr)",gap:16}}>
      <aside className="panel-card" style={{padding:12,display:"flex",flexDirection:"column",gap:18}}>
        <div><small className="panel-kicker">KANALLAR</small><div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>{teamChannels.map((item)=><Link className={activeChannel?.id===item.id?"panel-primary":"panel-secondary"} href={`/panel/messages?channel=${item.id}`} key={item.id}># {item.name}</Link>)}{!teamChannels.length?<p className="panel-muted">Henüz kanal yok.</p>:null}</div></div>
        <div><small className="panel-kicker">ÖZEL SOHBETLER</small><div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>{directChannels.map((item)=><Link className={activeChannel?.id===item.id?"panel-primary":"panel-secondary"} href={`/panel/messages?channel=${item.id}`} key={item.id}>● {directTitle.get(item.id) ?? "Özel sohbet"}</Link>)}{!directChannels.length?<p className="panel-muted">Henüz özel sohbet yok.</p>:null}</div></div>
      </aside>

      <article className="panel-card" style={{minHeight:520,display:"flex",flexDirection:"column",gap:16}}>
        <div className="section-heading"><div><small className="panel-kicker">{activeChannel?.channel_type === "direct" ? "KİŞİYE ÖZEL" : "AKTİF KANAL"}</small><h2>{activeTitle}</h2>{activeChannel?.description?<p>{activeChannel.description}</p>:null}</div></div>
        <div style={{display:"flex",flexDirection:"column",gap:10,flex:1,overflowY:"auto",maxHeight:440}}>{(messages ?? []).map((message)=>{
          const sender = profileMap.get(message.sender_id);
          return <div key={message.id} style={{padding:"12px 14px",border:"1px solid var(--ux-line)",borderRadius:10,background:message.sender_id===userId?"var(--ux-soft)":"#fff",alignSelf:message.sender_id===userId?"flex-end":"stretch",maxWidth:"84%"}}><small>{message.sender_id===userId?"Siz":sender?.full_name || "Ekip üyesi"} · {new Date(message.created_at).toLocaleString("tr-TR")}</small><p style={{margin:"6px 0 0",whiteSpace:"pre-wrap"}}>{message.body}</p></div>})}{activeChannel && !messages?.length?<p className="panel-muted">Bu sohbette henüz mesaj yok.</p>:null}</div>
        {activeChannel ? <form className="panel-form" action={sendMessage}><input type="hidden" name="channel_id" value={activeChannel.id}/><label className="wide">Mesaj<textarea name="body" required minLength={1} maxLength={4000} placeholder="Mesajınızı yazın..."/></label><div className="wide form-actions"><button className="panel-primary" type="submit">Gönder</button></div></form> : null}
      </article>
    </section>
  </div>;
}
