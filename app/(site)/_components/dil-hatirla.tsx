"use client";
import { useEffect } from "react";
import { SITE_DIL_COOKIE } from "@/lib/site/dil-secimi";
import type { Locale } from "@/lib/site/routes";

/*
  Ziyaretçinin en son gördüğü dil çereze yazılır; kök adres (/) tarayıcı
  dilinden önce buna bakar (lib/site/dil-secimi.ts). Yalnızca dil
  değiştiriciye basıldığında yazılsaydı, İngilizce bir iç sayfaya
  aramadan gelen Türk ziyaretçi logoya bastığında Türkçe ana sayfaya
  atılırdı — baktığı dilden habersiz bir sıçrama.
*/
export function DilHatirla({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.cookie = `${SITE_DIL_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [locale]);
  return null;
}
