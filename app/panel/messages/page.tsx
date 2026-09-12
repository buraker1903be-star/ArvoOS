import type { Metadata } from "next";
import { getPanelContext } from "@/lib/panel-context";
import { loadMessagesInit } from "./load-messages";
import { MessagesApp } from "./messages-app";

export const metadata: Metadata = { title: "Mesajlar | ArvoOS" };

// Tam sayfa mesajlaşma (eskiden bu adres ana sayfaya yönleniyordu).
// ?sohbet=<id> ile belirli bir sohbet açılır (çekmecedeki "tam ekran").
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ sohbet?: string }> }) {
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages")) {
    throw new Error("Mesajlaşma modülüne erişiminiz yok.");
  }
  const { sohbet } = await searchParams;
  const init = await loadMessagesInit(supabase, membership.organization_id, userId);
  const initialChannelId = sohbet && init.channels.some((channel) => channel.id === sohbet) ? sohbet : null;
  return (
    <div className="msg-page">
      <MessagesApp init={init} variant="page" initialChannelId={initialChannelId} />
    </div>
  );
}
