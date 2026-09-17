"use client";

// Mesajlaşmanın küçük sunum parçaları: simge seti ve avatar.

import { type ReactNode } from "react";
import { initialsOf, otherUserId } from "./message-format";
import { isOnline, type Channel, type Person } from "./messages-shared";

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
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  sound: <><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  mute: <><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>,
};
export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg className="msg-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}


export function Avatar({ channel, userId, people, presence, size = "md" }: { channel: Channel; userId: string; people: Map<string, Person>; presence: Record<string, string | null>; size?: "sm" | "md" | "lg" }) {
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

