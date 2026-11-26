/*
  Yönetim girişinin dilinin sunucu tarafı (karar lib/konsol-giris/dil.ts'te).

  Bilerek "use server" DEĞİL (AGENTS.md): "use server" dosyasındaki her
  export dışarıdan çağrılabilir bir uç noktaya dönüşür; yardımcılar ve
  tipler böyle dosyalarda durmaz.
*/
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { ceviriciKur, DIL_CEREZI, dilMi, tarayicidanDil, type Cevirici, type Dil } from "./dil";

/** İstek başına bir kez: çerez, yoksa tarayıcının dili. */
export const aktifDil = cache(async (): Promise<Dil> => {
  const cerez = (await cookies()).get(DIL_CEREZI)?.value;
  if (dilMi(cerez)) return cerez;
  return tarayicidanDil((await headers()).get("accept-language"));
});

/** Sunucuda çevirici: const t = await ceviri(); t({ tr: "…", en: "…" }) */
export async function ceviri(): Promise<Cevirici> {
  return ceviriciKur(await aktifDil());
}
