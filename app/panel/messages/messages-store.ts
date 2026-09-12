"use client";

// Kurum içi mesajlaşmanın tek veri kaynağı (tarayıcı tarafı).
//
// Mesaj çekmecesi ve /panel/messages sayfası aynı depoyu kullanır: tek bir
// realtime bağlantısı, tek okunmamış sayacı. Eskiden her görünüm kendi
// durumunu tutuyor, pencere açılıp kapandıkça abonelik yeniden kuruluyor ve
// bu arada gelen mesajlar kayboluyordu.
//
// Önemli: depo yalnızca tarayıcıda doldurulur. Sunucu tarafında modül
// değişkeni istekler arasında paylaşılır; kullanıcı verisi orada tutulmaz.
// Sunucu çiziminde bileşenler props'tan kurulan "fallback" durumu gösterir.

import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { alertIncoming } from "./message-alerts";
import {
  CHANNEL_COLUMNS,
  MAX_FILE_BYTES,
  MESSAGE_COLUMNS,
  sortChannels,
  timeOf as time,
  toChannel,
  type Channel,
  type ChannelRow,
  type Message,
  type MessagesInit,
  type Person,
} from "./messages-shared";

export type MessagesState = {
  ready: boolean;
  organizationId: string;
  userId: string;
  people: Person[];
  presence: Record<string, string | null>;
  channels: Channel[];
  unread: Record<string, number>;
  messages: Record<string, Message[]>;
  loaded: Record<string, boolean>;
  loading: Record<string, boolean>;
  hasMore: Record<string, boolean>;
  members: Record<string, string[]>;
  readStates: Record<string, Record<string, string>>;
  typing: Record<string, Record<string, number>>;
  attachmentUrls: Record<string, string>;
  error: string;
};

export type { Channel, Message, MessagesInit, Person };
const PAGE_SIZE = 50;
const BUCKET = "internal-message-files";
const URL_TTL_SECONDS = 6 * 60 * 60;

export function createInitialState(init?: MessagesInit): MessagesState {
  return {
    ready: false,
    organizationId: init?.organizationId ?? "",
    userId: init?.userId ?? "",
    people: init?.people ?? [],
    presence: Object.fromEntries((init?.people ?? []).map((person) => [person.userId, person.lastSeenAt])),
    channels: sortChannels(init?.channels ?? []),
    unread: init?.unread ?? {},
    messages: {},
    loaded: {},
    loading: {},
    hasMore: {},
    members: {},
    readStates: {},
    typing: {},
    attachmentUrls: {},
    error: "",
  };
}

// ---------------------------------------------------------------
// Depo
// ---------------------------------------------------------------
let state: MessagesState = createInitialState();
const listeners = new Set<() => void>();
let supabase: ReturnType<typeof createClient> | null = null;
let realtime: RealtimeChannel | null = null;
const typingChannels = new Map<string, { channel: RealtimeChannel; refs: number }>();
const views = new Map<string, string | null>();
const localFiles = new Map<string, File>();
const readTimers = new Map<string, number>();
let typingSweep: number | null = null;
let lastTypingSentAt = 0;
let onVisibility: (() => void) | null = null;

function setState(patch: Partial<MessagesState> | ((current: MessagesState) => Partial<MessagesState>)) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Bileşenler için: sunucu çiziminde ve depo hazır olana kadar fallback döner. */
export function useMessagesState(fallback: MessagesState) {
  return useSyncExternalStore(
    subscribe,
    () => (state.ready ? state : fallback),
    () => fallback,
  );
}

export function getMessagesState() {
  return state;
}

function totalUnread(unread: Record<string, number>) {
  return Object.values(unread).reduce((sum, count) => sum + (count || 0), 0);
}

function publishUnread() {
  window.dispatchEvent(new CustomEvent("arvo:message-unread-count", { detail: totalUnread(state.unread) }));
}

function mergeChannels(current: Channel[], incoming: Channel[]) {
  const map = new Map(current.map((channel) => [channel.id, channel]));
  for (const channel of incoming) {
    const existing = map.get(channel.id);
    map.set(channel.id, existing && time(existing.lastMessageAt) > time(channel.lastMessageAt) ? { ...channel, ...pickActivity(existing) } : channel);
  }
  return sortChannels([...map.values()]);
}

const pickActivity = (channel: Channel) => ({
  lastMessageAt: channel.lastMessageAt,
  lastMessagePreview: channel.lastMessagePreview,
  lastMessageSender: channel.lastMessageSender,
});

function upsertMessage(list: Message[], message: Message) {
  const index = list.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = { ...list[index], ...message, pending: false, failed: false };
    return next;
  }
  const next = [...list, message];
  next.sort((a, b) => time(a.created_at) - time(b.created_at));
  return next;
}

function mergeMessageLists(base: Message[], extra: Message[]) {
  let merged = base;
  for (const message of extra) merged = upsertMessage(merged, message);
  return merged;
}

// ---------------------------------------------------------------
// Başlatma ve realtime
// ---------------------------------------------------------------
export function initMessages(init: MessagesInit) {
  if (typeof window === "undefined") return;
  if (state.ready && state.organizationId === init.organizationId && state.userId === init.userId) {
    // Sayfa sunucudan daha taze liste getirdi: birleştir
    setState((current) => ({
      people: init.people,
      channels: mergeChannels(current.channels, init.channels),
    }));
    return;
  }
  teardownMessages();
  state = { ...createInitialState(init), ready: true };
  supabase = createClient();
  subscribeRealtime();
  onVisibility = () => {
    if (document.visibilityState === "visible") viewedChannels().forEach((id) => scheduleRead(id));
  };
  document.addEventListener("visibilitychange", onVisibility);
  listeners.forEach((listener) => listener());
  publishUnread();
}

export function teardownMessages() {
  if (supabase && realtime) void supabase.removeChannel(realtime);
  typingChannels.forEach(({ channel }) => supabase && void supabase.removeChannel(channel));
  typingChannels.clear();
  readTimers.forEach((timer) => window.clearTimeout(timer));
  readTimers.clear();
  if (typingSweep) window.clearInterval(typingSweep);
  typingSweep = null;
  if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
  onVisibility = null;
  realtime = null;
}

function subscribeRealtime() {
  const client = supabase;
  if (!client) return;
  const { organizationId, userId } = state;
  realtime = client
    .channel(`messages-${organizationId}-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "internal_messages", filter: `organization_id=eq.${organizationId}` }, (payload) => {
      if (payload.eventType === "DELETE") return;
      receiveMessage(payload.new as Message, payload.eventType === "INSERT");
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_channels", filter: `organization_id=eq.${organizationId}` }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: string }).id;
        if (id) removeChannel(id);
        return;
      }
      upsertChannel(toChannel(payload.new as ChannelRow));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_channel_members", filter: `user_id=eq.${userId}` }, (payload) => {
      const row = payload.new as { channel_id?: string };
      if (row.channel_id) void refreshChannel(row.channel_id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_read_states", filter: `organization_id=eq.${organizationId}` }, (payload) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new as { channel_id: string; user_id: string; last_read_at: string };
      setState((current) => ({
        readStates: {
          ...current.readStates,
          [row.channel_id]: { ...(current.readStates[row.channel_id] ?? {}), [row.user_id]: row.last_read_at },
        },
      }));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "user_presence", filter: `organization_id=eq.${organizationId}` }, (payload) => {
      const row = (payload.new ?? payload.old) as { user_id?: string; last_seen_at?: string };
      if (row?.user_id) setState((current) => ({ presence: { ...current.presence, [row.user_id!]: row.last_seen_at ?? null } }));
    })
    .subscribe((status) => {
      // İlk bağlantıda ve bağlantı koptuktan sonra aradaki değişiklikleri al
      if (status === "SUBSCRIBED") void resync();
    });
}

async function resync() {
  const client = supabase;
  if (!client) return;
  const { organizationId } = state;
  const [{ data: channelRows }, { data: unreadRows }] = await Promise.all([
    client.from("message_channels").select(CHANNEL_COLUMNS).eq("organization_id", organizationId),
    client.rpc("arvo_message_unread_counts", { p_organization_id: organizationId }),
  ]);
  if (channelRows) {
    const incoming = (channelRows as ChannelRow[]).map(toChannel);
    const visible = new Set(incoming.map((channel) => channel.id));
    setState((current) => ({ channels: mergeChannels(current.channels.filter((channel) => visible.has(channel.id)), incoming) }));
  }
  if (unreadRows) {
    const unread = Object.fromEntries((unreadRows as { channel_id: string; unread: number }[]).map((row) => [row.channel_id, row.unread]));
    for (const id of viewedChannels()) unread[id] = 0;
    setState({ unread });
    publishUnread();
  }
  for (const channelId of Object.keys(state.loaded)) if (state.loaded[channelId]) void loadNewer(channelId);
}

function receiveMessage(message: Message, isInsert: boolean) {
  const { userId } = state;
  let countAsUnread = false;
  setState((current) => {
    const list = current.messages[message.channel_id];
    const shouldStore = Boolean(list) || current.loading[message.channel_id];
    const messages = shouldStore
      ? { ...current.messages, [message.channel_id]: upsertMessage(list ?? [], message) }
      : current.messages;
    const typing = current.typing[message.channel_id]?.[message.sender_id]
      ? { ...current.typing, [message.channel_id]: { ...current.typing[message.channel_id], [message.sender_id]: 0 } }
      : current.typing;
    let unread = current.unread;
    if (isInsert && message.sender_id !== userId && !message.deleted_at) {
      if (isViewing(message.channel_id)) countAsUnread = false;
      else {
        countAsUnread = true;
        unread = { ...current.unread, [message.channel_id]: (current.unread[message.channel_id] ?? 0) + 1 };
      }
    }
    return { messages, unread, typing };
  });
  if (isInsert) {
    bumpChannel(message);
    if (!state.channels.some((channel) => channel.id === message.channel_id)) void refreshChannel(message.channel_id);
    if (message.sender_id !== userId && !countAsUnread) scheduleRead(message.channel_id);
    if (countAsUnread) {
      publishUnread();
      alertFor(message);
    }
  }
  if (message.attachment_path) void signUrls([message.attachment_path]);
}

/** Ekranda olmayan sohbete gelen mesaj: ses ve (arka plandaysa) bildirim */
function alertFor(message: Message) {
  const channel = state.channels.find((item) => item.id === message.channel_id);
  const sender = state.people.find((person) => person.userId === message.sender_id)?.name ?? "Ekip üyesi";
  const text = message.body?.trim() || (message.attachment_name ? `Ek gönderdi: ${message.attachment_name}` : "Yeni mesaj");
  const isDirect = !channel || channel.channelType === "direct";
  alertIncoming({
    title: isDirect ? sender : channel.name,
    body: isDirect ? text : `${sender.split(" ")[0]}: ${text}`,
    tag: message.channel_id,
  });
}

function bumpChannel(message: Message) {
  setState((current) => ({
    channels: sortChannels(
      current.channels.map((channel) =>
        channel.id === message.channel_id && time(message.created_at) >= time(channel.lastMessageAt)
          ? {
              ...channel,
              lastMessageAt: message.created_at,
              lastMessagePreview: message.body?.trim() || (message.attachment_name ? `Ek: ${message.attachment_name}` : "Ek"),
              lastMessageSender: message.sender_id,
            }
          : channel,
      ),
    ),
  }));
}

function upsertChannel(channel: Channel) {
  setState((current) => ({ channels: mergeChannels(current.channels, [channel]) }));
}

function removeChannel(channelId: string) {
  setState((current) => {
    const unread = { ...current.unread };
    delete unread[channelId];
    return { channels: current.channels.filter((channel) => channel.id !== channelId), unread };
  });
  publishUnread();
}

export async function refreshChannel(channelId: string) {
  const client = supabase;
  if (!client) return null;
  const { data } = await client.from("message_channels").select(CHANNEL_COLUMNS).eq("id", channelId).maybeSingle();
  if (data) upsertChannel(toChannel(data as ChannelRow));
  else removeChannel(channelId);
  return data ? channelId : null;
}

// ---------------------------------------------------------------
// Görünümler ve okundu
// ---------------------------------------------------------------
function viewedChannels() {
  return [...new Set([...views.values()].filter((id): id is string => Boolean(id)))];
}

function isViewing(channelId: string) {
  return document.visibilityState === "visible" && viewedChannels().includes(channelId);
}

/** Çekmece veya sayfa bir sohbeti ekranda gösterdiğini bildirir. */
export function setViewChannel(viewId: string, channelId: string | null) {
  views.set(viewId, channelId);
  if (channelId) {
    setState((current) => (current.unread[channelId] ? { unread: { ...current.unread, [channelId]: 0 } } : {}));
    publishUnread();
    scheduleRead(channelId);
  }
}

export function clearView(viewId: string) {
  views.delete(viewId);
}

function scheduleRead(channelId: string) {
  if (!supabase || document.visibilityState !== "visible") return;
  const existing = readTimers.get(channelId);
  if (existing) window.clearTimeout(existing);
  readTimers.set(
    channelId,
    window.setTimeout(() => {
      readTimers.delete(channelId);
      void markRead(channelId);
    }, 350),
  );
}

async function markRead(channelId: string) {
  const client = supabase;
  if (!client) return;
  const { data, error } = await client.rpc("mark_message_channel_read", { p_channel_id: channelId });
  if (error) return;
  const readAt = String(data ?? new Date().toISOString());
  setState((current) => ({
    unread: current.unread[channelId] ? { ...current.unread, [channelId]: 0 } : current.unread,
    readStates: {
      ...current.readStates,
      [channelId]: { ...(current.readStates[channelId] ?? {}), [current.userId]: readAt },
    },
  }));
  publishUnread();
}

// ---------------------------------------------------------------
// Mesajları yükleme
// ---------------------------------------------------------------
export async function loadMessages(channelId: string) {
  const client = supabase;
  if (!client) return;
  if (state.loaded[channelId]) {
    void loadNewer(channelId);
    return;
  }
  if (state.loading[channelId]) return;
  setState((current) => ({ loading: { ...current.loading, [channelId]: true }, error: "" }));
  const [messageResult, memberResult, readResult] = await Promise.all([
    client.from("internal_messages").select(MESSAGE_COLUMNS).eq("channel_id", channelId).order("created_at", { ascending: false }).limit(PAGE_SIZE),
    client.from("message_channel_members").select("user_id").eq("channel_id", channelId),
    client.from("message_read_states").select("user_id,last_read_at").eq("channel_id", channelId),
  ]);
  if (messageResult.error) {
    setState((current) => ({ loading: { ...current.loading, [channelId]: false }, error: "Mesajlar yüklenemedi." }));
    return;
  }
  const rows = [...((messageResult.data ?? []) as Message[])].reverse();
  setState((current) => ({
    // Yükleme sırasında realtime ile gelenler kaybolmasın: kimliğe göre birleştir
    messages: { ...current.messages, [channelId]: mergeMessageLists(rows, current.messages[channelId] ?? []) },
    loaded: { ...current.loaded, [channelId]: true },
    loading: { ...current.loading, [channelId]: false },
    hasMore: { ...current.hasMore, [channelId]: rows.length === PAGE_SIZE },
    members: { ...current.members, [channelId]: ((memberResult.data ?? []) as { user_id: string }[]).map((row) => row.user_id) },
    readStates: {
      ...current.readStates,
      [channelId]: Object.fromEntries(((readResult.data ?? []) as { user_id: string; last_read_at: string }[]).map((row) => [row.user_id, row.last_read_at])),
    },
  }));
  void signUrls(rows.flatMap((row) => (row.attachment_path ? [row.attachment_path] : [])));
}

async function loadNewer(channelId: string) {
  const client = supabase;
  const list = state.messages[channelId];
  if (!client || !list) return;
  const newest = [...list].reverse().find((message) => !message.pending && !message.failed);
  let query = client.from("internal_messages").select(MESSAGE_COLUMNS).eq("channel_id", channelId).order("created_at", { ascending: true }).limit(200);
  if (newest) query = query.gt("created_at", newest.created_at);
  const { data } = await query;
  if (data?.length) {
    setState((current) => ({ messages: { ...current.messages, [channelId]: mergeMessageLists(current.messages[channelId] ?? [], data as Message[]) } }));
    void signUrls((data as Message[]).flatMap((row) => (row.attachment_path ? [row.attachment_path] : [])));
  }
}

export async function loadOlder(channelId: string) {
  const client = supabase;
  const list = state.messages[channelId];
  if (!client || !list?.length || state.loading[channelId]) return;
  setState((current) => ({ loading: { ...current.loading, [channelId]: true } }));
  const { data } = await client
    .from("internal_messages")
    .select(MESSAGE_COLUMNS)
    .eq("channel_id", channelId)
    .lt("created_at", list[0].created_at)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  const rows = [...((data ?? []) as Message[])].reverse();
  setState((current) => ({
    messages: { ...current.messages, [channelId]: mergeMessageLists(rows, current.messages[channelId] ?? []) },
    hasMore: { ...current.hasMore, [channelId]: rows.length === PAGE_SIZE },
    loading: { ...current.loading, [channelId]: false },
  }));
  void signUrls(rows.flatMap((row) => (row.attachment_path ? [row.attachment_path] : [])));
}

async function signUrls(paths: string[]) {
  const client = supabase;
  const missing = [...new Set(paths)].filter((path) => !state.attachmentUrls[path]);
  if (!client || !missing.length) return;
  const { data } = await client.storage.from(BUCKET).createSignedUrls(missing, URL_TTL_SECONDS);
  const urls: Record<string, string> = Object.fromEntries(
    (data ?? []).filter((item) => item.signedUrl && item.path).map((item) => [item.path as string, item.signedUrl as string]),
  );
  if (Object.keys(urls).length) setState((current) => ({ attachmentUrls: { ...current.attachmentUrls, ...urls } }));
}

// ---------------------------------------------------------------
// Gönderme, düzenleme, silme
// ---------------------------------------------------------------
function patchMessage(channelId: string, id: string, patch: Partial<Message>) {
  setState((current) => ({
    messages: {
      ...current.messages,
      [channelId]: (current.messages[channelId] ?? []).map((message) => (message.id === id ? { ...message, ...patch } : message)),
    },
  }));
}

/** Mesajı hemen "gönderiliyor" olarak gösterir; hata metni döner (başarıda null). */
export async function sendMessage(channelId: string, body: string, file: File | null): Promise<string | null> {
  if (!supabase) return "Bağlantı hazır değil, sayfayı yenileyin.";
  const text = body.trim().slice(0, 4000);
  if (!text && !file) return null;
  if (file && file.size > MAX_FILE_BYTES) return "Dosya en fazla 10 MB olabilir.";
  const message: Message = {
    id: crypto.randomUUID(),
    channel_id: channelId,
    sender_id: state.userId,
    body: text || null,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    attachment_path: null,
    attachment_name: file?.name ?? null,
    attachment_mime: file?.type || null,
    attachment_size: file?.size ?? null,
    pending: true,
  };
  if (file) localFiles.set(message.id, file);
  setState((current) => ({
    messages: { ...current.messages, [channelId]: upsertMessage(current.messages[channelId] ?? [], message) },
  }));
  // upsertMessage pending'i sıfırlar; yeniden işaretle
  patchMessage(channelId, message.id, { pending: true });
  bumpChannel(message);
  return deliver(message);
}

async function deliver(message: Message): Promise<string | null> {
  const client = supabase;
  if (!client) return "Bağlantı hazır değil.";
  const { organizationId, userId } = state;
  const file = localFiles.get(message.id) ?? null;
  let attachmentPath = message.attachment_path;
  if (file && !attachmentPath) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "dosya";
    attachmentPath = `${organizationId}/${message.channel_id}/${message.id}-${safeName}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(attachmentPath, file, { cacheControl: "3600", upsert: false });
    if (uploadError) {
      patchMessage(message.channel_id, message.id, { pending: false, failed: true });
      return "Dosya yüklenemedi: " + uploadError.message;
    }
    // Görsel yüklenir yüklenmez yerel kopyasıyla görünsün
    if (file.type.startsWith("image/")) {
      const localUrl = URL.createObjectURL(file);
      setState((current) => ({ attachmentUrls: { ...current.attachmentUrls, [attachmentPath!]: localUrl } }));
    }
    patchMessage(message.channel_id, message.id, { attachment_path: attachmentPath });
  }
  const { error } = await client.from("internal_messages").insert({
    id: message.id,
    organization_id: organizationId,
    channel_id: message.channel_id,
    sender_id: userId,
    body: message.body,
    attachment_path: attachmentPath,
    attachment_name: message.attachment_name,
    attachment_mime: message.attachment_mime,
    attachment_size: message.attachment_size,
  });
  if (error) {
    if (attachmentPath && file) {
      void client.storage.from(BUCKET).remove([attachmentPath]);
      patchMessage(message.channel_id, message.id, { attachment_path: null });
    }
    patchMessage(message.channel_id, message.id, { pending: false, failed: true });
    return "Mesaj gönderilemedi: " + error.message;
  }
  localFiles.delete(message.id);
  patchMessage(message.channel_id, message.id, { pending: false, failed: false });
  return null;
}

export async function retryMessage(channelId: string, id: string) {
  const message = state.messages[channelId]?.find((item) => item.id === id);
  if (!message) return null;
  patchMessage(channelId, id, { pending: true, failed: false });
  return deliver({ ...message, attachment_path: null });
}

export function discardMessage(channelId: string, id: string) {
  localFiles.delete(id);
  setState((current) => ({
    messages: { ...current.messages, [channelId]: (current.messages[channelId] ?? []).filter((message) => message.id !== id) },
  }));
}

export async function editMessage(message: Message, body: string): Promise<string | null> {
  const client = supabase;
  const text = body.trim().slice(0, 4000);
  if (!client) return "Bağlantı hazır değil.";
  if (!text && !message.attachment_path) return "Mesaj boş bırakılamaz.";
  if (text === (message.body ?? "")) return null;
  const previous = { body: message.body, edited_at: message.edited_at };
  patchMessage(message.channel_id, message.id, { body: text || null, edited_at: new Date().toISOString() });
  const { error } = await client.from("internal_messages").update({ body: text || null }).eq("id", message.id);
  if (error) {
    patchMessage(message.channel_id, message.id, previous);
    return "Mesaj düzenlenemedi: " + error.message;
  }
  return null;
}

export async function deleteMessage(message: Message): Promise<string | null> {
  const client = supabase;
  if (!client) return "Bağlantı hazır değil.";
  const previous = { ...message };
  patchMessage(message.channel_id, message.id, {
    body: null,
    deleted_at: new Date().toISOString(),
    attachment_path: null,
    attachment_name: null,
  });
  const { error } = await client.from("internal_messages").update({ deleted_at: new Date().toISOString() }).eq("id", message.id);
  if (error) {
    patchMessage(message.channel_id, message.id, previous);
    return "Mesaj silinemedi: " + error.message;
  }
  if (previous.attachment_path) void client.storage.from(BUCKET).remove([previous.attachment_path]);
  return null;
}

// ---------------------------------------------------------------
// Sohbet ve grup işlemleri
// ---------------------------------------------------------------
type Result = { id?: string; error?: string };

export async function startDirectChat(targetUserId: string): Promise<Result> {
  const client = supabase;
  if (!client) return { error: "Bağlantı hazır değil." };
  const { data, error } = await client.rpc("create_direct_message_channel", {
    target_user_id: targetUserId,
    target_organization_id: state.organizationId,
  });
  if (error || !data) return { error: error?.message ?? "Sohbet başlatılamadı." };
  const id = String(data);
  await refreshChannel(id);
  return { id };
}

export async function createGroup(name: string, memberIds: string[]): Promise<Result> {
  const client = supabase;
  if (!client) return { error: "Bağlantı hazır değil." };
  const { data, error } = await client.rpc("create_group_message_channel", {
    p_organization_id: state.organizationId,
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error || !data) return { error: error?.message ?? "Grup oluşturulamadı." };
  const id = String(data);
  await refreshChannel(id);
  return { id };
}

export async function updateGroup(channelId: string, name: string, memberIds: string[]): Promise<Result> {
  const client = supabase;
  if (!client) return { error: "Bağlantı hazır değil." };
  const { error } = await client.rpc("update_group_message_channel", {
    p_channel_id: channelId,
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error) return { error: error.message };
  await refreshChannel(channelId);
  const { data } = await client.from("message_channel_members").select("user_id").eq("channel_id", channelId);
  setState((current) => ({ members: { ...current.members, [channelId]: ((data ?? []) as { user_id: string }[]).map((row) => row.user_id) } }));
  return { id: channelId };
}

export async function leaveGroup(channelId: string): Promise<Result> {
  const client = supabase;
  if (!client) return { error: "Bağlantı hazır değil." };
  const { error } = await client.rpc("leave_message_channel", { p_channel_id: channelId });
  if (error) return { error: error.message };
  removeChannel(channelId);
  return {};
}

export async function deleteGroup(channelId: string): Promise<Result> {
  const client = supabase;
  if (!client) return { error: "Bağlantı hazır değil." };
  const { error } = await client.rpc("delete_group_message_channel", { p_channel_id: channelId });
  if (error) return { error: error.message };
  removeChannel(channelId);
  return {};
}

export async function searchMessages(query: string): Promise<Message[]> {
  const client = supabase;
  const text = query.trim();
  if (!client || text.length < 2) return [];
  const pattern = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { data } = await client
    .from("internal_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", state.organizationId)
    .is("deleted_at", null)
    .ilike("body", pattern)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data ?? []) as Message[];
}

// ---------------------------------------------------------------
// Yazıyor göstergesi (Realtime broadcast; veritabanına yazılmaz)
// ---------------------------------------------------------------
export function watchTyping(channelId: string) {
  const client = supabase;
  if (!client) return () => undefined;
  const entry = typingChannels.get(channelId);
  if (entry) entry.refs += 1;
  else {
    const channel = client
      .channel(`typing-${channelId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typingUser = (payload as { userId?: string })?.userId;
        if (!typingUser || typingUser === state.userId) return;
        setState((current) => ({
          typing: { ...current.typing, [channelId]: { ...(current.typing[channelId] ?? {}), [typingUser]: Date.now() + 4000 } },
        }));
        ensureTypingSweep();
      })
      .subscribe();
    typingChannels.set(channelId, { channel, refs: 1 });
  }
  return () => {
    const current = typingChannels.get(channelId);
    if (!current) return;
    current.refs -= 1;
    if (current.refs <= 0) {
      void client.removeChannel(current.channel);
      typingChannels.delete(channelId);
    }
  };
}

export function notifyTyping(channelId: string) {
  const entry = typingChannels.get(channelId);
  if (!entry || Date.now() - lastTypingSentAt < 2500) return;
  lastTypingSentAt = Date.now();
  void entry.channel.send({ type: "broadcast", event: "typing", payload: { userId: state.userId } });
}

function ensureTypingSweep() {
  if (typingSweep) return;
  typingSweep = window.setInterval(() => {
    const now = Date.now();
    let changed = false;
    const typing: MessagesState["typing"] = {};
    for (const [channelId, users] of Object.entries(state.typing)) {
      const active = Object.fromEntries(Object.entries(users).filter(([, expires]) => expires > now));
      if (Object.keys(active).length !== Object.keys(users).length) changed = true;
      if (Object.keys(active).length) typing[channelId] = active;
    }
    if (changed) setState({ typing });
    if (!Object.keys(typing).length && typingSweep) {
      window.clearInterval(typingSweep);
      typingSweep = null;
    }
  }, 1000);
}
