// @ts-expect-error Cloudflare bu sanal modülü Workers çalışma zamanında sağlar.
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 bağlaması `DB` yok. Bu dosya vinext şablonundan kalma ve ArvoOS'ta kullanılmıyor (bütün veri Supabase'de); D1'i açacaksanız bağlamayı vite.config.ts'teki Cloudflare yapılandırmasına ekleyin."
    );
  }

  return drizzle(env.DB, { schema });
}
