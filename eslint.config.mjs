import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ArvoOS'taki görsellerin neredeyse tamamı next/image'in
      // optimize edemeyeceği türden:
      //
      //  - Kurum logoları ve imza kaşeleri (organizations.logo_url,
      //    signature_stamp_url) kiracının kendi verdiği adreslerdir. Çok
      //    kiracılı olduğumuz için bunların hostu önceden bilinemez;
      //    next/image remotePatterns ister. Hepsini açmak (**) görsel
      //    optimize ucunu herkese açık bir vekile çevirir ve her dönüşüm
      //    ücretlendirilir.
      //  - Müşteri imzaları canvas.toDataURL("image/png") çıktısıdır;
      //    next/image data: adresleriyle çalışmaz.
      //  - Teklif ve sözleşme belgeleri yazdırılıp PDF'e dönüyor; orada
      //    duyarlı görsel üretmenin bir karşılığı yok.
      //
      // Kalanlar (ör. /arvoos-logo.png) küçük logolar; tek başlarına
      // dönüşümü hak etmiyor ve yanlarındaki kurum logosuyla tutarsız
      // görünmeleri okunabilirliği düşürür. Karar bilinçli: düz <img>
      // kullanılır, boyut ve loading/decoding elle verilir.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
