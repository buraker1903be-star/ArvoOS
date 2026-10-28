// Arapça: about-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].ar;

export const ABOUT_AR: SubContent = {
  id: "about",
  meta: { title: "من نحن", description: `Arvo هي العلامة البرمجية لشركة ${COMPANY.legalName}. تطوّر ArvoOS وArvoLab وArvoBook، وتقدّم خدمات تصميم المواقع الإلكترونية ومتاجر التجارة الإلكترونية والبرمجيات المخصّصة.` },
  hero: {
    eyebrow: "من نحن", title: "نجعل العمل المعقّد", subtitle: "بسيطًا.",
    lead: `Arvo هي العلامة البرمجية لشركة ${COMPANY.legalName}، ومقرّها إسطنبول. تصمّم أساليب عمل رقمية قوية وهادئة في آنٍ واحد للمؤسسات والباحثين والصالونات.`,
    actions: [{ label: "تعرّف إلينا", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "رؤية واحدة ومنظومة تنمو", title: "ما نؤمن به.",
    lead: "مع ArvoOS نغيّر طريقة عمل الشركات، ومع ArvoLab طريقة إنجاز البحث العلمي، ومع ArvoBook طريقة إدارة الصالونات لدفتر مواعيدها — كل ذلك بلغة علامة واحدة ومعيار جودة واحد.",
    items: [
      { title: "تقنية محورها الإنسان", text: "تجارب تجعل اتخاذ القرار والإبداع أسهل، دون أن تنقل التعقيد إلى المستخدم." },
      { title: "دقّة لا تقبل المساومة", text: "أنظمة موثوقة ومفهومة وطويلة العمر — من الواجهة حتى البنية التحتية." },
      { title: "منتجات تنمو معًا", text: "منظومة قابلة للتوسّع تندمج فيها المنتجات والخدمات الجديدة بشكل طبيعي." },
    ],
  },
  steps: {
    eyebrow: "كيف نعمل", title: "نعيد تصميم طريقة إنجاز العمل.",
    lead: "لا نرى البرمجيات مجرد أداة، بل نظامًا يعزّز ثقافة الفريق وإيقاعه وجودة خدمته.",
    items: [
      { title: "نفهم العملية أولًا", text: "يبدأ كل مشروع بالتعرّف على الطريقة التي يجري بها العمل فعليًا." },
      { title: "نصمّم الصورة كاملة", text: "نتعامل مع العلامة والتجربة والتقنية بوصفها كلًّا واحدًا." },
      { title: "نعمل بشفافية وعلى المدى الطويل", text: "قرارات واضحة للجميع، ونطاق محدّد، وتعاون مستدام." },
    ],
  },
  band: {
    eyebrow: "بيانات الشركة", title: "الشركة التي تقف وراء Arvo.",
    items: [COMPANY.legalName, COMPANY.address.displayIntl, COMPANY.email],
  },
  faq: { eyebrow: "الأسئلة الشائعة", title: "عن Arvo", items: [
    { q: "ما الشركة التي تقف وراء Arvo؟", a: `Arvo علامة تجارية تابعة لشركة ${COMPANY.legalName}.` },
    { q: "أين يقع مقرّ Arvo؟", a: `${COMPANY.address.displayIntl}.` },
    { q: "ما الفرق بين Arvo وArvoOS؟", a: "Arvo هي العلامة التجارية (وموقعها arvo-os.com)؛ أما ArvoOS فهو أحد منتجاتها. والمنتجان الآخران هما ArvoLab وArvoBook." },
    { q: "كيف أتواصل مع Arvo؟", a: `استخدم النموذج في صفحة التواصل أو راسلنا على ${COMPANY.email}.` },
  ] },
  cta: { title: "لنبنِ معًا نظامًا أفضل.", actions: [{ label: "تواصل معنا", href: R("contact"), variant: "gold" }, { label: "المنتجات", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
