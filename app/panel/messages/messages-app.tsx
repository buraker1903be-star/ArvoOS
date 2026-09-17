"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  clearView,
  createGroup,
  createInitialState,
  initMessages,
  loadMessages,
  searchMessages,
  setViewChannel,
  startDirectChat,
  useMessagesState,
  watchTyping,
} from "./messages-store";
import { isOnline, type Channel, type Message, type MessagesInit, type Person } from "./messages-shared";
import {
  notificationPermission,
  requestNotificationPermission,
  setSoundEnabled,
  soundEnabled,
  subscribeAlertSettings,
} from "./message-alerts";

// iMessage tarzı kurum içi mesajlaşma. Aynı bileşen çekmecede (variant
// "drawer") ve /panel/messages sayfasında (variant "page") çalışır; veri
// messages-store.ts'teki ortak depodan gelir.
//
// Sohbet gövdesi message-thread.tsx'te, yeni sohbet ve grup panelleri
// message-sheets.tsx'te, saf biçimlendirme message-format.ts'te.
import { Icon, Avatar } from "./message-chrome";
import {
  channelTitle,
  initialsOf,
  lastSeenLabel,
  listTime,
  lower,
  otherUserId,
} from "./message-format";
import { Thread } from "./message-thread";
import { NewChatSheet, GroupSheet } from "./message-sheets";

import "./messages.css";
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
  const sound = useSyncExternalStore(subscribeAlertSettings, soundEnabled, () => true);
  const permission = useSyncExternalStore(subscribeAlertSettings, notificationPermission, () => "unsupported" as const);

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
            <button
              type="button"
              className="msg-icon-btn"
              onClick={() => setSoundEnabled(!sound)}
              aria-pressed={sound}
              aria-label={sound ? "Mesaj sesini kapat" : "Mesaj sesini aç"}
              title={sound ? "Mesaj sesi açık" : "Mesaj sesi kapalı"}
            >
              <Icon name={sound ? "sound" : "mute"} size={17} />
            </button>
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
        {permission === "default" ? (
          <button type="button" className="msg-notify-hint" onClick={() => void requestNotificationPermission()}>
            <Icon name="bell" size={16} />
            <span>
              <b>Bildirimleri aç</b>
              <small>Panel arka plandayken yeni mesajları kaçırmayın</small>
            </span>
          </button>
        ) : null}
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

