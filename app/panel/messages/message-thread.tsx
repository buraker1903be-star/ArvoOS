"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  deleteMessage,
  discardMessage,
  editMessage,
  loadOlder,
  notifyTyping,
  retryMessage,
  sendMessage,
  type MessagesState,
} from "./messages-store";
import { isOnline, MAX_FILE_BYTES, timeOf, type Channel, type Message, type Person } from "./messages-shared";
import "./messages.css";

// Açık sohbetin gövdesi: balonlar, gün ayraçları, yazıyor göstergesi,
// dosya ekleme ve mesaj girişi. Veri messages-store.ts'ten gelir.
import { Icon, Avatar } from "./message-chrome";
import {
  buildRows,
  channelTitle,
  clock,
  fileSize,
  initialsOf,
  lastSeenLabel,
  otherUserId,
} from "./message-format";

// ---------------------------------------------------------------
// Sohbet ekranı
// ---------------------------------------------------------------
export function Thread({
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

