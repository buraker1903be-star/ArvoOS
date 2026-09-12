"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  clearView,
  createGroup,
  createInitialState,
  deleteGroup,
  deleteMessage,
  discardMessage,
  editMessage,
  initMessages,
  leaveGroup,
  loadMessages,
  loadOlder,
  notifyTyping,
  retryMessage,
  searchMessages,
  sendMessage,
  setViewChannel,
  startDirectChat,
  updateGroup,
  useMessagesState,
  watchTyping,
  type MessagesState,
} from "./messages-store";
import { isOnline, MAX_FILE_BYTES, timeOf, type Channel, type Message, type MessagesInit, type Person } from "./messages-shared";
import "./messages.css";

// iMessage tarzı kurum içi mesajlaşma. Aynı bileşen çekmecede (variant
// "drawer") ve /panel/messages sayfasında (variant "page") çalışır; veri
// messages-store.ts'teki ortak depodan gelir.

const TZ = "Europe/Istanbul";
const DAY = 24 * 60 * 60 * 1000;
const GROUP_GAP = 5 * 60 * 1000;

const dayKey = (value: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const clock = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function dayLabel(value: string) {
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return "Bugün";
  if (key === dayKey(Date.now() - DAY)) return "Dün";
  const sameYear = key.slice(0, 4) === dayKey(Date.now()).slice(0, 4);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(value));
}

function listTime(value: string | null) {
  if (!value) return "";
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return clock(value);
  if (key === dayKey(Date.now() - DAY)) return "Dün";
  if (Date.now() - timeOf(value) < 6 * DAY) return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short" }).format(new Date(value));
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}

function lastSeenLabel(value: string | null | undefined) {
  if (!value) return "Çevrimdışı";
  if (isOnline(value)) return "Çevrimiçi";
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return `Son görülme ${clock(value)}`;
  if (key === dayKey(Date.now() - DAY)) return `Son görülme dün ${clock(value)}`;
  return `Son görülme ${listTime(value)}`;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") || "?";
const fileSize = (size: number | null) =>
  size ? (size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`) : "";
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

// ---------------------------------------------------------------
// Simgeler (tek çizgi kalınlığı, SF Symbols hissi)
// ---------------------------------------------------------------
const paths: Record<string, ReactNode> = {
  compose: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  send: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  back: <path d="m15 18-6-6 6-6" />,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  expand: <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  group: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.6.2 4.4 1.8 5 4.8" /></>,
  bubble: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12Z" />,
};
function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg className="msg-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ---------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------
function otherUserId(channel: Channel, userId: string) {
  return channel.directKey?.split(":").find((id) => id !== userId) ?? null;
}

function channelTitle(channel: Channel, userId: string, people: Map<string, Person>) {
  if (channel.channelType === "direct") {
    const other = otherUserId(channel, userId);
    return (other && people.get(other)?.name) || "Ekip üyesi";
  }
  return channel.name;
}

function Avatar({ channel, userId, people, presence, size = "md" }: { channel: Channel; userId: string; people: Map<string, Person>; presence: Record<string, string | null>; size?: "sm" | "md" | "lg" }) {
  if (channel.channelType === "direct") {
    const other = otherUserId(channel, userId);
    const name = (other && people.get(other)?.name) || "?";
    return (
      <span className={`msg-avatar msg-avatar--${size}`} aria-hidden="true">
        {initialsOf(name)}
        {other && isOnline(presence[other]) ? <i className="msg-online" /> : null}
      </span>
    );
  }
  return (
    <span className={`msg-avatar msg-avatar--${size} ${channel.isPrivate ? "is-group" : "is-channel"}`} aria-hidden="true">
      {channel.isPrivate ? <Icon name="group" size={size === "sm" ? 15 : 19} /> : "#"}
    </span>
  );
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; first: boolean; last: boolean };

function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let previous: Message | null = null;
  let previousDay = "";
  messages.forEach((message, index) => {
    const currentDay = dayKey(message.created_at);
    if (currentDay !== previousDay) {
      rows.push({ kind: "day", key: `day-${currentDay}`, label: dayLabel(message.created_at) });
      previousDay = currentDay;
      previous = null;
    }
    const next = messages[index + 1];
    const continues = (a: Message | null, b: Message | undefined) =>
      Boolean(a && b && a.sender_id === b.sender_id && dayKey(a.created_at) === dayKey(b.created_at) && timeOf(b.created_at) - timeOf(a.created_at) < GROUP_GAP);
    rows.push({
      kind: "message",
      key: message.id,
      message,
      first: !continues(previous, message),
      last: !continues(message, next),
    });
    previous = message;
  });
  return rows;
}

// ---------------------------------------------------------------
// Ana bileşen
// ---------------------------------------------------------------
export function MessagesApp({
  init,
  variant,
  active = true,
  onClose,
  initialChannelId = null,
}: {
  init: MessagesInit;
  variant: "page" | "drawer";
  active?: boolean;
  onClose?: () => void;
  initialChannelId?: string | null;
}) {
  const fallback = useMemo(() => createInitialState(init), [init]);
  const s = useMessagesState(fallback);
  const [selectedId, setSelectedId] = useState<string | null>(initialChannelId);
  const [mobileView, setMobileView] = useState<"list" | "thread">(initialChannelId ? "thread" : "list");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [sheet, setSheet] = useState<null | "new" | "info">(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    initMessages(init);
  }, [init]);

  const people = useMemo(() => new Map(s.people.map((person) => [person.userId, person])), [s.people]);

  // İki panel sığıyorsa (kapsayıcı genişliği) ve seçim yoksa en son sohbet
  // açık gelir (Mesajlar uygulaması gibi). Seçili sohbet silinir ya da grup
  // dışında kalınırsa seçim kendiliğinden düşer.
  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) > 720));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const selected: Channel | null =
    s.channels.find((channel) => channel.id === selectedId) ?? (wide && !selectedId ? (s.channels[0] ?? null) : null);
  const currentId: string | null = selected?.id ?? null;

  useEffect(() => {
    if (!active || !currentId || !s.ready) {
      setViewChannel(variant, null);
      return;
    }
    void loadMessages(currentId);
    setViewChannel(variant, currentId);
    const unwatch = watchTyping(currentId);
    return () => {
      unwatch();
      setViewChannel(variant, null);
    };
  }, [active, currentId, s.ready, variant]);

  useEffect(() => () => clearView(variant), [variant]);

  // Arama: kişiler ve sohbetler anında, mesajlar sunucudan
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const timer = window.setTimeout(() => void searchMessages(text).then(setResults), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const open = useCallback((channelId: string) => {
    setSelectedId(channelId);
    setMobileView("thread");
    setQuery("");
  }, []);

  const startDirect = async (person: Person) => {
    const existing = s.channels.find((channel) => channel.channelType === "direct" && otherUserId(channel, s.userId) === person.userId);
    if (existing) return open(existing.id);
    const result = await startDirectChat(person.userId);
    if (result.id) open(result.id);
    return result.error;
  };

  const text = lower(query.trim());
  const shownResults = query.trim().length >= 2 ? results : [];
  const matchingPeople = text ? s.people.filter((person) => person.userId !== s.userId && lower(person.name).includes(text)) : [];
  const matchingChannels = text ? s.channels.filter((channel) => lower(channelTitle(channel, s.userId, people)).includes(text)) : s.channels;

  return (
    <div ref={rootRef} className={`msg-app msg-app--${variant}`} data-view={selected ? mobileView : "list"}>
      <aside className="msg-sidebar">
        <header className="msg-sidebar-head">
          <h2>Mesajlar</h2>
          <div className="msg-head-actions">
            <button type="button" className="msg-icon-btn" onClick={() => setSheet("new")} aria-label="Yeni sohbet" title="Yeni sohbet">
              <Icon name="compose" />
            </button>
            {variant === "drawer" ? (
              <>
                <Link className="msg-icon-btn" href={currentId ? `/panel/messages?sohbet=${currentId}` : "/panel/messages"} onClick={onClose} aria-label="Tam ekranda aç" title="Tam ekranda aç">
                  <Icon name="expand" size={16} />
                </Link>
                <button type="button" className="msg-icon-btn" onClick={onClose} aria-label="Mesajları kapat" title="Kapat">
                  <Icon name="close" />
                </button>
              </>
            ) : null}
          </div>
        </header>
        <label className="msg-search">
          <Icon name="search" size={16} />
          <span className="sr-only">Sohbet, kişi veya mesaj ara</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ara" />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle">
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>
        <div className="msg-list" role="list">
          {text && matchingPeople.length ? <p className="msg-list-label">Kişiler</p> : null}
          {matchingPeople.map((person) => (
            <button type="button" role="listitem" className="msg-row" key={`p-${person.userId}`} onClick={() => void startDirect(person)}>
              <span className="msg-avatar msg-avatar--md" aria-hidden="true">
                {initialsOf(person.name)}
                {isOnline(s.presence[person.userId]) ? <i className="msg-online" /> : null}
              </span>
              <span className="msg-row-body">
                <span className="msg-row-top"><b>{person.name}</b></span>
                <span className="msg-row-preview" suppressHydrationWarning>{person.jobTitle || lastSeenLabel(s.presence[person.userId])}</span>
              </span>
            </button>
          ))}
          {text && matchingChannels.length ? <p className="msg-list-label">Sohbetler</p> : null}
          {matchingChannels.map((channel) => {
            const unread = s.unread[channel.id] ?? 0;
            const title = channelTitle(channel, s.userId, people);
            const mine = channel.lastMessageSender === s.userId;
            return (
              <button
                type="button"
                role="listitem"
                key={channel.id}
                className={`msg-row${channel.id === currentId ? " is-active" : ""}${unread ? " is-unread" : ""}`}
                onClick={() => open(channel.id)}
                aria-current={channel.id === currentId ? "true" : undefined}
              >
                <Avatar channel={channel} userId={s.userId} people={people} presence={s.presence} />
                <span className="msg-row-body">
                  <span className="msg-row-top">
                    <b>{title}</b>
                    <time suppressHydrationWarning>{listTime(channel.lastMessageAt)}</time>
                  </span>
                  <span className="msg-row-bottom">
                    <span className="msg-row-preview">
                      {channel.lastMessagePreview
                        ? `${mine ? "Sen: " : channel.channelType !== "direct" && channel.lastMessageSender ? `${people.get(channel.lastMessageSender)?.name.split(" ")[0] ?? "Biri"}: ` : ""}${channel.lastMessagePreview}`
                        : channel.channelType === "direct"
                          ? "Sohbeti başlatın"
                          : "Henüz mesaj yok"}
                    </span>
                    {unread ? <em className="msg-badge">{unread > 99 ? "99+" : unread}</em> : null}
                  </span>
                </span>
              </button>
            );
          })}
          {text && shownResults.length ? <p className="msg-list-label">Mesajlar</p> : null}
          {text
            ? shownResults.map((message) => {
                const channel = s.channels.find((item) => item.id === message.channel_id);
                if (!channel) return null;
                return (
                  <button type="button" role="listitem" className="msg-row msg-row--result" key={`r-${message.id}`} onClick={() => open(channel.id)}>
                    <Avatar channel={channel} userId={s.userId} people={people} presence={s.presence} size="sm" />
                    <span className="msg-row-body">
                      <span className="msg-row-top">
                        <b>{channelTitle(channel, s.userId, people)}</b>
                        <time suppressHydrationWarning>{listTime(message.created_at)}</time>
                      </span>
                      <span className="msg-row-preview">{message.body}</span>
                    </span>
                  </button>
                );
              })
            : null}
          {!text && !s.channels.length ? (
            <div className="msg-list-empty">
              <Icon name="bubble" size={28} />
              <p>Henüz sohbet yok.</p>
              <button type="button" className="panel-primary" onClick={() => setSheet("new")}>Yeni sohbet</button>
            </div>
          ) : null}
          {text && !matchingPeople.length && !matchingChannels.length && !shownResults.length ? <p className="msg-list-note">Sonuç bulunamadı.</p> : null}
        </div>
      </aside>

      {selected ? (
        <Thread
          key={selected.id}
          channel={selected}
          s={s}
          people={people}
          onBack={() => setMobileView("list")}
          onInfo={() => setSheet("info")}
          onImage={setLightbox}
        />
      ) : (
        <section className="msg-thread msg-thread--empty">
          <div>
            <Icon name="bubble" size={34} />
            <h3>Bir sohbet seçin</h3>
            <p>Ekip arkadaşlarınızla birebir ya da grup halinde yazışın.</p>
            <button type="button" className="panel-secondary" onClick={() => setSheet("new")}>Yeni sohbet</button>
          </div>
        </section>
      )}

      {sheet === "new" ? (
        <NewChatSheet
          people={s.people.filter((person) => person.userId !== s.userId)}
          presence={s.presence}
          onClose={() => setSheet(null)}
          onDirect={async (person) => {
            const error = await startDirect(person);
            if (!error) setSheet(null);
            return error ?? null;
          }}
          onGroup={async (name, ids) => {
            const result = await createGroup(name, ids);
            if (result.id) {
              setSheet(null);
              open(result.id);
            }
            return result.error ?? null;
          }}
        />
      ) : null}
      {sheet === "info" && selected ? (
        <GroupSheet channel={selected} s={s} people={people} onClose={() => setSheet(null)} />
      ) : null}
      {lightbox ? (
        <button type="button" className="msg-lightbox" onClick={() => setLightbox(null)} aria-label="Görseli kapat">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------
// Sohbet ekranı
// ---------------------------------------------------------------
function Thread({
  channel,
  s,
  people,
  onBack,
  onInfo,
  onImage,
}: {
  channel: Channel;
  s: MessagesState;
  people: Map<string, Person>;
  onBack: () => void;
  onInfo: () => void;
  onImage: (url: string) => void;
}) {
  const messages = useMemo(() => s.messages[channel.id] ?? [], [s.messages, channel.id]);
  const rows = useMemo(() => buildRows(messages), [messages]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  // Dokunmatik ekranda "…" yalnızca dokunulan mesajda görünür (messages.css)
  const [tappedId, setTappedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const title = channelTitle(channel, s.userId, people);
  const other = channel.channelType === "direct" ? otherUserId(channel, s.userId) : null;
  // Süresi dolan kayıtları depo her saniye temizler; 0 = mesajı geldi
  const typingUsers = Object.entries(s.typing[channel.id] ?? {})
    .filter(([, expires]) => expires > 0)
    .map(([id]) => people.get(id)?.name.split(" ")[0] ?? "Biri");
  const memberCount = s.members[channel.id]?.length ?? 0;
  const subtitle = typingUsers.length
    ? `${typingUsers.join(", ")} yazıyor…`
    : other
      ? lastSeenLabel(s.presence[other])
      : channel.isPrivate
        ? `${memberCount || "—"} üye`
        : "Kurum kanalı · tüm ekip";

  // Kaydırma: altta duruyorsa yeni mesajla birlikte kalsın; eski mesaj
  // yüklenince okuduğu yer kaymasın.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (previousHeight.current !== null) {
      node.scrollTop += node.scrollHeight - previousHeight.current;
      previousHeight.current = null;
      return;
    }
    if (stickToBottom.current) node.scrollTop = node.scrollHeight;
    else window.requestAnimationFrame(() => setShowJump(true));
  }, [rows.length, typingUsers.length]);

  useEffect(() => {
    const node = topRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && s.hasMore[channel.id] && !s.loading[channel.id]) {
          previousHeight.current = root.scrollHeight;
          void loadOlder(channel.id);
        }
      },
      { root, rootMargin: "120px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [channel.id, s.hasMore, s.loading]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    stickToBottom.current = atBottom;
    if (atBottom) setShowJump(false);
  };

  const jump = () => {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottom.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  const autosize = () => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
    // Kaydırma çubuğu yalnızca en fazla yüksekliğe ulaşınca görünsün
    node.style.overflowY = node.scrollHeight > 160 ? "auto" : "hidden";
  };

  useEffect(autosize, [draft]);

  const pickFile = (next: File | null) => {
    if (next && next.size > MAX_FILE_BYTES) {
      setError("Dosya en fazla 10 MB olabilir.");
      return;
    }
    setError("");
    setFile(next);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    if (editing) {
      const failure = await editMessage(editing, draft);
      if (failure) setError(failure);
      else {
        setEditing(null);
        setDraft("");
      }
      return;
    }
    const body = draft;
    const attached = file;
    if (!body.trim() && !attached) return;
    setDraft("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    stickToBottom.current = true;
    const failure = await sendMessage(channel.id, body, attached);
    if (failure) setError(failure);
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && editing) {
      setEditing(null);
      setDraft("");
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files)[0];
    if (pasted && !editing) {
      event.preventDefault();
      pickFile(pasted);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped && !editing) pickFile(dropped);
  };

  // "Görüldü": son mesaj benimse, diğer üyelerin okundu zamanına bak
  const lastMessage = [...messages].reverse().find((message) => !message.deleted_at);
  let receipt = "";
  if (lastMessage && lastMessage.sender_id === s.userId && !lastMessage.pending && !lastMessage.failed && channel.isPrivate) {
    const reads = s.readStates[channel.id] ?? {};
    const others = other ? [other] : (s.members[channel.id] ?? []).filter((id) => id !== s.userId);
    const seen = others.filter((id) => timeOf(reads[id]) >= timeOf(lastMessage.created_at));
    receipt = other
      ? seen.length
        ? `Görüldü ${clock(reads[other])}`
        : "İletildi"
      : seen.length
        ? seen.length === others.length
          ? "Herkes gördü"
          : `${seen.length} kişi gördü`
        : "İletildi";
  }

  const copy = (message: Message) => {
    if (message.body) void navigator.clipboard?.writeText(message.body);
    setMenuId(null);
  };

  return (
    <section
      className={`msg-thread${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={onDrop}
      onClick={() => menuId && setMenuId(null)}
    >
      <header className="msg-thread-head">
        <button type="button" className="msg-icon-btn msg-back" onClick={onBack} aria-label="Sohbet listesine dön">
          <Icon name="back" size={20} />
        </button>
        <Avatar channel={channel} userId={s.userId} people={people} presence={s.presence} size="sm" />
        <div className="msg-thread-title">
          <b>{title}</b>
          <small className={typingUsers.length ? "is-typing" : other && isOnline(s.presence[other]) ? "is-online" : ""} suppressHydrationWarning>
            {subtitle}
          </small>
        </div>
        {channel.isPrivate && channel.channelType === "group" ? (
          <button type="button" className="msg-icon-btn" onClick={onInfo} aria-label="Grup bilgisi" title="Grup bilgisi">
            <Icon name="info" />
          </button>
        ) : null}
      </header>

      <div className="msg-scroll" ref={scrollRef} onScroll={onScroll}>
        <div ref={topRef} className="msg-top-sentinel" />
        {s.loading[channel.id] && messages.length ? <p className="msg-older">Eski mesajlar yükleniyor…</p> : null}
        {!s.hasMore[channel.id] && messages.length ? (
          <div className="msg-thread-start">
            <Avatar channel={channel} userId={s.userId} people={people} presence={s.presence} size="lg" />
            <b>{title}</b>
            <small>{channel.channelType === "direct" ? "Birebir sohbetin başlangıcı" : channel.isPrivate ? "Grup sohbetinin başlangıcı" : "Kurum kanalının başlangıcı"}</small>
          </div>
        ) : null}
        {!s.loaded[channel.id] && !messages.length ? (
          <div className="msg-skeleton" aria-hidden="true">
            <span /><span className="is-mine" /><span /><span className="is-mine is-short" />
          </div>
        ) : null}
        {s.loaded[channel.id] && !messages.length ? (
          <div className="msg-thread-start">
            <Avatar channel={channel} userId={s.userId} people={people} presence={s.presence} size="lg" />
            <b>{title}</b>
            <small>Henüz mesaj yok. İlk mesajı siz yazın.</small>
          </div>
        ) : null}
        {rows.map((row) => {
          if (row.kind === "day") {
            return <p className="msg-day" key={row.key} suppressHydrationWarning>{row.label}</p>;
          }
          const { message, first, last } = row;
          const mine = message.sender_id === s.userId;
          const sender = people.get(message.sender_id)?.name ?? "Ekip üyesi";
          const url = message.attachment_path ? s.attachmentUrls[message.attachment_path] : undefined;
          const isImage = Boolean(message.attachment_mime?.startsWith("image/"));
          const showName = !mine && first && channel.channelType !== "direct";
          const showAvatar = !mine && last && channel.channelType !== "direct";
          return (
            <div
              key={row.key}
              className={`msg-line${mine ? " is-mine" : ""}${first ? " is-first" : ""}${last ? " is-last" : ""}${message.pending ? " is-pending" : ""}${message.failed ? " is-failed" : ""}${tappedId === message.id ? " is-tapped" : ""}`}
              onClick={() => setTappedId(tappedId === message.id ? null : message.id)}
            >
              {channel.channelType !== "direct" && !mine ? (
                <span className="msg-line-avatar" aria-hidden="true">{showAvatar ? initialsOf(sender) : null}</span>
              ) : null}
              <div className="msg-stack">
                {showName ? <span className="msg-sender">{sender}</span> : null}
                <div className="msg-bubble-wrap">
                  {message.deleted_at ? (
                    <div className="msg-bubble is-deleted">Bu mesaj silindi</div>
                  ) : (
                    <div className={`msg-bubble${message.body ? "" : " is-attachment-only"}`} title={clock(message.created_at)}>
                      {message.attachment_name ? (
                        isImage && url ? (
                          <button type="button" className="msg-image" onClick={(event) => { event.stopPropagation(); onImage(url); }} aria-label={`${message.attachment_name} görselini büyüt`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={message.attachment_name} loading="lazy" />
                          </button>
                        ) : (
                          <a className="msg-file" href={url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!url}>
                            <span className="msg-file-icon"><Icon name="file" size={18} /></span>
                            <span><b>{message.attachment_name}</b><small>{fileSize(message.attachment_size)}{!url && message.pending ? " · yükleniyor" : ""}</small></span>
                          </a>
                        )
                      ) : null}
                      {message.body ? <p>{message.body}</p> : null}
                    </div>
                  )}
                  {!message.deleted_at && !message.pending && !message.failed ? (
                    <button
                      type="button"
                      className="msg-more"
                      aria-label="Mesaj seçenekleri"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmDelete(null);
                        setMenuId(menuId === message.id ? null : message.id);
                      }}
                    >
                      <Icon name="more" size={16} />
                    </button>
                  ) : null}
                  {menuId === message.id ? (
                    <div className="msg-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                      {confirmDelete === message.id ? (
                        <>
                          <span className="msg-menu-note">Mesaj herkes için silinsin mi?</span>
                          <button type="button" role="menuitem" className="is-danger" onClick={async () => { setMenuId(null); const failure = await deleteMessage(message); if (failure) setError(failure); }}>Sil</button>
                          <button type="button" role="menuitem" onClick={() => setConfirmDelete(null)}>Vazgeç</button>
                        </>
                      ) : (
                        <>
                          {message.body ? <button type="button" role="menuitem" onClick={() => copy(message)}>Kopyala</button> : null}
                          {mine && message.body ? (
                            <button type="button" role="menuitem" onClick={() => { setMenuId(null); setEditing(message); setDraft(message.body ?? ""); window.setTimeout(() => textareaRef.current?.focus(), 0); }}>Düzenle</button>
                          ) : null}
                          {mine ? <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirmDelete(message.id)}>Sil</button> : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
                {last || message.failed || message.pending ? (
                  <span className="msg-meta" suppressHydrationWarning>
                    {message.failed ? (
                      <>
                        <span className="msg-failed">Gönderilemedi</span>
                        <button type="button" onClick={async () => { const failure = await retryMessage(channel.id, message.id); if (failure) setError(failure); }}>Tekrar dene</button>
                        <button type="button" onClick={() => discardMessage(channel.id, message.id)}>Kaldır</button>
                      </>
                    ) : message.pending ? (
                      "Gönderiliyor…"
                    ) : (
                      <>
                        {clock(message.created_at)}
                        {message.edited_at && !message.deleted_at ? " · düzenlendi" : ""}
                        {mine && message.id === lastMessage?.id && receipt ? ` · ${receipt}` : ""}
                      </>
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        {typingUsers.length ? (
          <div className="msg-line msg-typing" aria-live="polite">
            <div className="msg-bubble"><i /><i /><i /></div>
          </div>
        ) : null}
      </div>

      {showJump ? (
        <button type="button" className="msg-jump" onClick={jump} aria-label="En son mesajlara in">
          <Icon name="down" size={18} />
        </button>
      ) : null}

      {dragging ? <div className="msg-drop">Dosyayı buraya bırakın</div> : null}

      <form className="msg-composer" onSubmit={submit}>
        {error ? <p className="msg-error" role="alert">{error}</p> : null}
        {editing ? (
          <div className="msg-composer-note">
            <span>Mesajı düzenliyorsun</span>
            <button type="button" onClick={() => { setEditing(null); setDraft(""); }}>Vazgeç</button>
          </div>
        ) : null}
        {file ? (
          <div className="msg-composer-note is-file">
            <span className="msg-file-icon"><Icon name="file" size={16} /></span>
            <span className="msg-composer-file">{file.name} · {fileSize(file.size)}</span>
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Eki kaldır">
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}
        <div className="msg-composer-row">
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            tabIndex={-1}
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" className="msg-attach" onClick={() => fileRef.current?.click()} disabled={Boolean(editing)} aria-label="Fotoğraf veya dosya ekle" title="Fotoğraf veya dosya ekle">
            <Icon name="plus" size={20} />
          </button>
          <div className="msg-input">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={4000}
              value={draft}
              placeholder={editing ? "Mesajı düzenle" : file ? "Bir not ekleyin" : "Mesaj"}
              onChange={(event) => {
                setDraft(event.target.value);
                if (!editing) notifyTyping(channel.id);
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              aria-label="Mesaj"
            />
          </div>
          <button type="submit" className="msg-send" disabled={!draft.trim() && !file} aria-label={editing ? "Kaydet" : "Gönder"}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------
// Yeni sohbet / grup
// ---------------------------------------------------------------
function NewChatSheet({
  people,
  presence,
  onClose,
  onDirect,
  onGroup,
}: {
  people: Person[];
  presence: Record<string, string | null>;
  onClose: () => void;
  onDirect: (person: Person) => Promise<string | null>;
  onGroup: (name: string, ids: string[]) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = people.filter((person) => lower(person.name).includes(lower(filter.trim())));

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setError("");
    const failure = await task();
    if (failure) setError(failure);
    setBusy(false);
  };

  return (
    <div className="msg-sheet-backdrop" onClick={onClose}>
      <div className="msg-sheet" role="dialog" aria-modal="true" aria-label="Yeni sohbet" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Yeni sohbet</h3>
          <button type="button" className="msg-icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button>
        </header>
        <div className="msg-segment" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "direct"} className={mode === "direct" ? "is-active" : ""} onClick={() => setMode("direct")}>Kişi</button>
          <button type="button" role="tab" aria-selected={mode === "group"} className={mode === "group" ? "is-active" : ""} onClick={() => setMode("group")}>Grup</button>
        </div>
        {mode === "group" ? (
          <label className="msg-field">
            <span>Grup adı</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Örn. Tez Ekibi" autoFocus />
          </label>
        ) : null}
        <label className="msg-search msg-search--sheet">
          <Icon name="search" size={16} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Kişi ara" autoFocus={mode === "direct"} />
        </label>
        <div className="msg-people">
          {list.map((person) => {
            const checked = picked.includes(person.userId);
            return (
              <button
                type="button"
                key={person.userId}
                className={`msg-person${checked ? " is-checked" : ""}`}
                disabled={busy}
                onClick={() =>
                  mode === "direct"
                    ? void run(() => onDirect(person))
                    : setPicked((current) => (checked ? current.filter((id) => id !== person.userId) : [...current, person.userId]))
                }
              >
                <span className="msg-avatar msg-avatar--sm" aria-hidden="true">
                  {initialsOf(person.name)}
                  {isOnline(presence[person.userId]) ? <i className="msg-online" /> : null}
                </span>
                <span className="msg-person-body"><b>{person.name}</b><small>{person.jobTitle || "Ekip üyesi"}</small></span>
                {mode === "group" ? <span className="msg-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
          {!list.length ? <p className="msg-list-note">Kişi bulunamadı.</p> : null}
        </div>
        {error ? <p className="msg-error" role="alert">{error}</p> : null}
        {mode === "group" ? (
          <footer>
            <button type="button" className="panel-primary" disabled={busy || name.trim().length < 2 || !picked.length} onClick={() => void run(() => onGroup(name, picked))}>
              {busy ? "Oluşturuluyor…" : `Grubu oluştur${picked.length ? ` (${picked.length + 1} kişi)` : ""}`}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function GroupSheet({ channel, s, people, onClose }: { channel: Channel; s: MessagesState; people: Map<string, Person>; onClose: () => void }) {
  const canManage = channel.createdBy === s.userId;
  const [name, setName] = useState(channel.name);
  const [picked, setPicked] = useState<string[]>(() => (s.members[channel.id] ?? []).filter((id) => id !== s.userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<null | "leave" | "delete">(null);
  const everyone = s.people.filter((person) => person.userId !== s.userId);

  const run = async (task: () => Promise<{ error?: string }>, close = false) => {
    setBusy(true);
    setError("");
    const result = await task();
    setBusy(false);
    if (result.error) setError(result.error);
    else if (close) onClose();
  };

  return (
    <div className="msg-sheet-backdrop" onClick={onClose}>
      <div className="msg-sheet" role="dialog" aria-modal="true" aria-label="Grup bilgisi" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Grup bilgisi</h3>
          <button type="button" className="msg-icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button>
        </header>
        {canManage ? (
          <label className="msg-field">
            <span>Grup adı</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </label>
        ) : (
          <p className="msg-sheet-title">{channel.name}</p>
        )}
        <p className="msg-list-label">Üyeler</p>
        <div className="msg-people">
          {(canManage ? everyone : (s.members[channel.id] ?? []).map((id) => people.get(id)).filter((person): person is Person => Boolean(person))).map((person) => {
            const checked = person.userId === s.userId || picked.includes(person.userId);
            return (
              <button
                type="button"
                key={person.userId}
                className={`msg-person${checked ? " is-checked" : ""}`}
                disabled={!canManage || busy}
                onClick={() => setPicked((current) => (current.includes(person.userId) ? current.filter((id) => id !== person.userId) : [...current, person.userId]))}
              >
                <span className="msg-avatar msg-avatar--sm" aria-hidden="true">{initialsOf(person.name)}</span>
                <span className="msg-person-body"><b>{person.name}{person.userId === s.userId ? " (sen)" : ""}</b><small>{person.jobTitle || "Ekip üyesi"}</small></span>
                {canManage ? <span className="msg-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        {error ? <p className="msg-error" role="alert">{error}</p> : null}
        <footer className="msg-sheet-actions">
          {confirm ? (
            <>
              <span className="msg-menu-note">{confirm === "delete" ? "Grup ve tüm mesajları herkes için silinsin mi?" : "Gruptan ayrılmak istiyor musun?"}</span>
              <button type="button" className="panel-danger" disabled={busy} onClick={() => void run(() => (confirm === "delete" ? deleteGroup(channel.id) : leaveGroup(channel.id)), true)}>
                {confirm === "delete" ? "Grubu sil" : "Ayrıl"}
              </button>
              <button type="button" className="panel-secondary" onClick={() => setConfirm(null)}>Vazgeç</button>
            </>
          ) : (
            <>
              {canManage ? (
                <button type="button" className="panel-primary" disabled={busy || name.trim().length < 2} onClick={() => void run(() => updateGroup(channel.id, name, picked), true)}>
                  {busy ? "Kaydediliyor…" : "Kaydet"}
                </button>
              ) : null}
              <button type="button" className="panel-secondary" onClick={() => setConfirm("leave")}>Gruptan ayrıl</button>
              {canManage ? <button type="button" className="panel-danger" onClick={() => setConfirm("delete")}>Grubu sil</button> : null}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
