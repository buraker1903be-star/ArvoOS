// İletişim sayfası — tip + Türkçe (İngilizce: contact-en.ts).
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { QA } from "../_components/ui";
import type { Hero, Meta } from "./types";

export type ContactContent = {
  meta: Meta; hero: Hero;
  formTitle: string; formLead: string;
  emailLabel: string; addressLabel: string; appsLabel: string; privacyLabel: string; privacyText: string;
  faq: { eyebrow: string; title: string; items: QA[] };
};

export const CONTACT_TR: ContactContent = {
  meta: { title: "İletişim ve Demo Talebi", description: `ArvoOS, ArvoLab ve Arc demo talepleri, ürün erişimi ve proje görüşmeleri için Arvo ile iletişime geçin: ${COMPANY.email}.` },
  hero: {
    eyebrow: "İletişim", title: "Yeni fikriniz için", subtitle: "buradayız.",
    lead: "Ürün demosu, panel erişimi veya kurumunuza özel bir dijital proje için formu doldurun ya da doğrudan yazın; talebiniz ilgili ürün veya proje ekibine iletilir.",
    actions: [],
  },
  formTitle: "Demo ve iletişim formu",
  formLead: "Birkaç bilgi yeterli. İlgilendiğiniz ürünü seçin, ihtiyacınızı kısaca anlatın.",
  emailLabel: "E-posta", addressLabel: "Adres", appsLabel: "Panel girişleri", privacyLabel: "Kişisel veriler",
  privacyText: "Form bilgileriniz yalnızca talebinizi yanıtlamak için işlenir.",
  faq: {
    eyebrow: "Sık sorulan sorular", title: "İletişim hakkında",
    items: [
      { q: "Nasıl demo talep edebilirim?", a: "Bu sayfadaki formda ilgilendiğiniz ürünü seçip ihtiyacınızı yazmanız yeterli; ekibimiz sizinle iletişime geçer." },
      { q: "Form dışında nasıl ulaşabilirim?", a: `${COMPANY.email} adresine e-posta gönderebilirsiniz.` },
      { q: "Paneli kullanan bir kurumum, nereden giriş yaparım?", a: "ArvoOS app.arvo-os.com, ArvoLab lab.arvo-os.com, Arc arc.arvo-os.com adresinde çalışır; kurumunuzun özel alan adı varsa oradan da giriş yapabilirsiniz." },
      { q: "Form verilerim nasıl kullanılır?", a: `Yalnızca talebinizi yanıtlamak için işlenir. Ayrıntılar Gizlilik ve KVKK Aydınlatma Metni’nde (${ROUTES.privacy.tr}).` },
    ],
  },
};
