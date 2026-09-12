// Mesajlaşmada sunucu ve istemcinin ortak kullandığı tipler ve yardımcılar.
// "use client" DEĞİL: sunucu bileşenleri bir client modülünden sabit
// içe aktarırsa değer yerine istemci referansı alır.

export type Person = { userId: string; name: string; jobTitle: string | null; lastSeenAt: string | null };
export type Channel = {
  id: string;
  name: string;
  channelType: string;
  directKey: string | null;
  isPrivate: boolean;
  createdBy: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
};
export type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  /** Yalnızca istemcide: gönderiliyor / gönderilemedi */
  pending?: boolean;
  failed?: boolean;
};
export type MessagesInit = {
  organizationId: string;
  userId: string;
  people: Person[];
  channels: Channel[];
  unread: Record<string, number>;
};

export const CHANNEL_COLUMNS =
  "id,name,channel_type,direct_key,is_private,created_by,last_message_at,last_message_preview,last_message_sender";
export const MESSAGE_COLUMNS =
  "id,channel_id,sender_id,body,created_at,edited_at,deleted_at,attachment_path,attachment_name,attachment_mime,attachment_size";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ChannelRow = {
  id: string;
  name: string;
  channel_type: string | null;
  direct_key: string | null;
  is_private: boolean | null;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
};

export const toChannel = (row: ChannelRow): Channel => ({
  id: row.id,
  name: row.name,
  channelType: row.channel_type ?? "group",
  directKey: row.direct_key,
  isPrivate: Boolean(row.is_private),
  createdBy: row.created_by,
  lastMessageAt: row.last_message_at,
  lastMessagePreview: row.last_message_preview,
  lastMessageSender: row.last_message_sender,
});

export const timeOf = (value: string | null | undefined) => (value ? Date.parse(value) || 0 : 0);

export const isOnline = (lastSeen: string | null | undefined) =>
  Boolean(lastSeen && Date.now() - timeOf(lastSeen) < 2 * 60 * 1000);

export function sortChannels(channels: Channel[]) {
  return [...channels].sort(
    (a, b) => timeOf(b.lastMessageAt) - timeOf(a.lastMessageAt) || a.name.localeCompare(b.name, "tr"),
  );
}
