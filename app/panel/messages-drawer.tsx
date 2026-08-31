"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Person={userId:string;name:string;jobTitle:string|null;lastSeenAt:string|null};
type Channel={id:string;name:string;description:string|null;channelType:string;directKey:string|null};
type Message={id:string;channel_id:string;sender_id:string;body:string;created_at:string};

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toLocaleUpperCase("tr-TR");
const online=(lastSeen:string|null)=>Boolean(lastSeen&&Date.now()-new Date(lastSeen).getTime()<120000);

export function MessagesDrawer({organizationId,userId,people,initialChannels,initialUnreadByChannel}:{organizationId:string;userId:string;people:Person[];initialChannels:Channel[];initialUnreadByChannel:Record<string,number>}){
  const [open,setOpen]=useState(false);
  const [channels,setChannels]=useState(initialChannels);
  const [activeId,setActiveId]=useState(initialChannels[0]?.id??null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [presence,setPresence]=useState<Record<string,string|null>>(()=>Object.fromEntries(people.map((person)=>[person.userId,person.lastSeenAt])));
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [mobileThreadOpen,setMobileThreadOpen]=useState(false);
  const [unreadByChannel,setUnreadByChannel]=useState(initialUnreadByChannel);
  const closeRef=useRef<HTMLButtonElement>(null);
  const threadRef=useRef<HTMLDivElement>(null);
  const supabase=useMemo(()=>createClient(),[]);
  const peopleMap=useMemo(()=>new Map(people.map((person)=>[person.userId,person])),[people]);
  const filteredPeople=people.filter((person)=>person.userId!==userId&&person.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")));
  const channelTitle=(channel:Channel)=>{if(channel.channelType!=="direct")return `# ${channel.name}`;const target=channel.directKey?.split(":").find((id)=>id!==userId);return target?peopleMap.get(target)?.name??"Ekip Üyesi":"Ekip Üyesi";};
  const activeChannel=channels.find((channel)=>channel.id===activeId)??null;
  const unreadCount=Object.values(unreadByChannel).reduce((total,count)=>total+count,0);

  const publishUnread=useCallback((next:Record<string,number>)=>window.dispatchEvent(new CustomEvent("arvo:message-unread-count",{detail:Object.values(next).reduce((total,count)=>total+count,0)})),[]);
  const markChannelRead=useCallback(async(channelId:string)=>{const now=new Date().toISOString();await supabase.from("message_read_states").upsert({organization_id:organizationId,channel_id:channelId,user_id:userId,last_read_at:now,updated_at:now},{onConflict:"channel_id,user_id"});setUnreadByChannel((current)=>{if(!current[channelId])return current;const next={...current,[channelId]:0};publishUnread(next);return next})},[organizationId,publishUnread,supabase,userId]);

  useEffect(()=>{const handler=()=>{setLoading(true);setError("");setMobileThreadOpen(false);setOpen(true)};window.addEventListener("arvo:open-messages",handler);return()=>window.removeEventListener("arvo:open-messages",handler);},[]);
  useEffect(()=>{document.documentElement.classList.toggle("messages-drawer-open",open);if(open)requestAnimationFrame(()=>closeRef.current?.focus());return()=>document.documentElement.classList.remove("messages-drawer-open");},[open]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[]);
  useEffect(()=>{if(!open||!activeId)return;let cancelled=false;supabase.from("internal_messages").select("id,channel_id,sender_id,body,created_at").eq("organization_id",organizationId).eq("channel_id",activeId).order("created_at").limit(150).then(({data,error})=>{if(cancelled)return;if(error)setError("Mesajlar yüklenemedi.");else{setMessages((data??[]) as Message[]);void markChannelRead(activeId)}setLoading(false)});return()=>{cancelled=true};},[open,activeId,organizationId,supabase,markChannelRead]);
  useEffect(()=>{const subscription=supabase.channel(`team-chat-${organizationId}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"internal_messages",filter:`organization_id=eq.${organizationId}`},(payload)=>{const message=payload.new as Message;if(message.channel_id===activeId)setMessages((current)=>current.some((item)=>item.id===message.id)?current:[...current,message]);if(message.sender_id!==userId){if(open&&message.channel_id===activeId)void markChannelRead(message.channel_id);else setUnreadByChannel((current)=>{const next={...current,[message.channel_id]:(current[message.channel_id]??0)+1};publishUnread(next);return next})}})
    .on("postgres_changes",{event:"*",schema:"public",table:"user_presence",filter:`organization_id=eq.${organizationId}`},(payload)=>{const row=(payload.new||payload.old) as {user_id?:string;last_seen_at?:string};if(row.user_id)setPresence((current)=>({...current,[row.user_id!]:row.last_seen_at??null}));})
    .subscribe();return()=>{void supabase.removeChannel(subscription)};},[activeId,open,organizationId,publishUnread,supabase,userId,markChannelRead]);
  useEffect(()=>{threadRef.current?.scrollTo({top:threadRef.current.scrollHeight,behavior:"smooth"})},[messages]);

  const startDirect=async(person:Person)=>{setError("");setLoading(true);const {data,error}=await supabase.rpc("create_direct_message_channel",{target_user_id:person.userId,target_organization_id:organizationId});if(error||!data){setError(error?.message??"Sohbet başlatılamadı.");setLoading(false);return}let channel=channels.find((item)=>item.id===data);if(!channel){channel={id:String(data),name:"Birebir Sohbet",description:"Kişiye özel ekip sohbeti",channelType:"direct",directKey:[userId,person.userId].sort().join(":")};setChannels((current)=>[channel!,...current])}setActiveId(channel.id);setMobileThreadOpen(true);setLoading(false)};
  const send=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!activeId||sending)return;const form=event.currentTarget;const field=form.elements.namedItem("body") as HTMLTextAreaElement;const body=field.value.trim();if(!body)return;setSending(true);setError("");const {error}=await supabase.from("internal_messages").insert({organization_id:organizationId,channel_id:activeId,sender_id:userId,body:body.slice(0,4000)});if(error)setError("Mesaj gönderilemedi: "+error.message);else field.value="";setSending(false)};

  return <>
    <button className="panel-quick-action" type="button" onClick={()=>{setLoading(true);setError("");setOpen(true)}} aria-label={`Mesajları aç${unreadCount?`, ${unreadCount} okunmamış`:""}`} aria-expanded={open} aria-controls="messages-drawer"><span className="panel-quick-icon" aria-hidden="true">◇</span><b>Mesajlar</b>{unreadCount?<span className="panel-unread-badge">{unreadCount>99?"99+":unreadCount}</span>:null}</button>
    <button className="messages-drawer-backdrop" type="button" aria-label="Mesajları kapat" onClick={()=>setOpen(false)} tabIndex={open?0:-1}/>
    <aside id="messages-drawer" className={`messages-drawer${mobileThreadOpen?" mobile-thread-open":""}`} aria-hidden={!open}>
      <header className="messages-drawer-head"><div><small>KURUM İÇİ İLETİŞİM</small><h2>Mesajlar</h2></div><button ref={closeRef} type="button" onClick={()=>setOpen(false)} aria-label="Mesajları kapat">×</button></header>
      <div className="messages-drawer-body">
        <aside className="messages-people"><label><span className="sr-only">Personel ara</span><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Personel ara..."/></label><div className="messages-person-list">{filteredPeople.map((person)=><button type="button" key={person.userId} onClick={()=>void startDirect(person)}><i>{initials(person.name)}<em className={online(presence[person.userId])?"online":""}/></i><span><b>{person.name}</b><small>{online(presence[person.userId])?"Çevrimiçi":presence[person.userId]?`Son görülme ${new Date(presence[person.userId]!).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}`:"Çevrimdışı"}</small></span></button>)}</div><div className="messages-channel-list"><small>SOHBETLER</small>{channels.map((channel)=><button className={channel.id===activeId?"active":""} type="button" key={channel.id} onClick={()=>{setLoading(true);setError("");setActiveId(channel.id);setMobileThreadOpen(true)}}><span>{channelTitle(channel)}</span>{unreadByChannel[channel.id]?<b className="message-channel-badge">{unreadByChannel[channel.id]>99?"99+":unreadByChannel[channel.id]}</b>:null}</button>)}</div></aside>
        <section className="messages-thread"><header><button className="messages-mobile-back" type="button" onClick={()=>setMobileThreadOpen(false)} aria-label="Sohbet listesine dön">‹</button>{activeChannel?<><div className="messages-thread-avatar">{initials(channelTitle(activeChannel).replace("# ",""))}</div><div><b>{channelTitle(activeChannel)}</b><small>{activeChannel.channelType==="direct"?"Özel ekip sohbeti":"Kurum kanalı"}</small></div></>:<div><b>Sohbet seçin</b><small>Bir personel veya kanal seçerek başlayın.</small></div>}</header>
          <div className="messages-thread-scroll" ref={threadRef}>{loading?<p className="messages-empty">Mesajlar yükleniyor...</p>:messages.map((message)=>{const mine=message.sender_id===userId;return <article className={mine?"mine":""} key={message.id}>{!mine?<b>{peopleMap.get(message.sender_id)?.name??"Ekip Üyesi"}</b>:null}<p>{message.body}</p><small>{new Date(message.created_at).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</small></article>})}{!loading&&activeChannel&&!messages.length?<p className="messages-empty">Henüz mesaj yok. İlk mesajı siz gönderin.</p>:null}</div>
          {error?<p className="messages-error">{error}</p>:null}
          {activeChannel?<form className="messages-composer" onSubmit={send}><textarea name="body" required maxLength={4000} rows={1} placeholder="Mesajınızı yazın..."/><button type="submit" disabled={sending}>{sending?"…":"Gönder"}</button></form>:null}
        </section>
      </div>
    </aside>
  </>;
}
