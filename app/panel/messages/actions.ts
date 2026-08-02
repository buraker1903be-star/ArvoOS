"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

function value(formData: FormData, key: string, max = 4000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function createChannel(formData: FormData) {
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "messages")) throw new Error("Mesajlaşma modülüne erişiminiz yok.");
  if (!["owner","admin"].includes(membership.role)) throw new Error("Kanal oluşturma yetkiniz yok.");
  const name = value(formData,"name",80);
  const description = value(formData,"description",300);
  if (name.length < 2) throw new Error("Kanal adı en az 2 karakter olmalıdır.");
  const { error } = await supabase.from("message_channels").insert({ organization_id: membership.organization_id, name, description: description || null, created_by: userId });
  if (error) throw new Error("Kanal oluşturulamadı: " + error.message);
  revalidatePath("/panel/messages");
}

export async function sendMessage(formData: FormData) {
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "messages")) throw new Error("Mesajlaşma modülüne erişiminiz yok.");
  const channelId = value(formData,"channel_id",80);
  const body = value(formData,"body",4000);
  if (!channelId || !body) throw new Error("Mesaj alanı boş bırakılamaz.");
  const { error } = await supabase.from("internal_messages").insert({ organization_id: membership.organization_id, channel_id: channelId, sender_id: userId, body });
  if (error) throw new Error("Mesaj gönderilemedi: " + error.message);
  revalidatePath("/panel/messages");
}