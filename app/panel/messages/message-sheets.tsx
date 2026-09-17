"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  deleteGroup,
  leaveGroup,
  updateGroup,
  type MessagesState,
} from "./messages-store";
import { isOnline, type Channel, type Person } from "./messages-shared";
import "./messages.css";

// Yeni sohbet ve grup yönetimi panelleri (messages-app.tsx'ten açılır).
import { Icon } from "./message-chrome";
import {
  initialsOf,
  lower,
} from "./message-format";

// ---------------------------------------------------------------
// Yeni sohbet / grup
// ---------------------------------------------------------------
export function NewChatSheet({
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

export function GroupSheet({ channel, s, people, onClose }: { channel: Channel; s: MessagesState; people: Map<string, Person>; onClose: () => void }) {
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

