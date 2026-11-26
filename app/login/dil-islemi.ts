"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DIL_CEREZI, dilMi } from "@/lib/konsol-giris/dil";

/*
  Giriş ekranının arayüz dilini değiştirir. Oturum gerektirmez — dil
  seçimi giriş YAPMADAN önce yapılıyor. Tercih çerezde: sunucu onu ilk
  boyamada okuyor, böylece yenilemede dil korunur ve sayfa bir an yanlış
  dilde görünmez.

  Yalnızca bu çerezi yazar: oturum, yetki ya da müşteri verisine
  dokunmaz.
*/
export async function dilSec(dil: string): Promise<{ error?: string; success?: boolean }> {
  if (!dilMi(dil)) return { error: "Unsupported language." };
  (await cookies()).set(DIL_CEREZI, dil, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/login");
  return { success: true };
}
