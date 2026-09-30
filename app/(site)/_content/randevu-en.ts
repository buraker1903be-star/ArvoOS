/*
  Arvo Randevu product page — English. Mirrors randevu.ts; the same
  rule applies: only shipped features. No automatic reminders (Meta
  template approval pending), no multi-branch, reports, deposits or
  loyalty — those are on the roadmap, not in the product.
*/
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const RANDEVU_EN: ProductContent = {
  id: "randevu",
  name: "Arvo Randevu",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.randevu.url,
  featureList: [
    "Online booking page",
    "Per-staff calendar",
    "Services and staff",
    "Working hours and time off",
    "Customer records",
    "WhatsApp reminders",
  ],
  meta: {
    title: "Arvo Randevu — Salon Appointment Management",
    description:
      "Online booking for hair and beauty salons: customers pick the service, the stylist and the time themselves; per-staff calendar, working hours and time off, WhatsApp reminders.",
  },
  hero: {
    eyebrow: "Arvo Randevu · Salon appointment management",
    title: "Let the booking page",
    subtitle: "answer the phone.",
    lead:
      "Customers book themselves and it lands on your calendar at once. Slots open according to who performs which service, and a clashing appointment never enters the system.",
    actions: [
      { label: "See pricing", href: R("pricing"), variant: "gold" },
      { label: "Open the panel", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Capabilities",
    title: "The salon's day on one screen.",
    lead:
      "An appointment taken by phone goes into a paper book, the book is misread, the hour clashes. Arvo Randevu rebuilds that chain from the start.",
    items: [
      {
        title: "Online booking page",
        text: "The customer picks the service, the stylist — or “no preference” — and the time. No sign-up; they are identified by phone number and receive a cancellation link.",
      },
      {
        title: "Per-staff calendar",
        text: "Add, move and cancel appointments. The calendar opens staff by staff, so who is free and when is visible at a glance.",
      },
      {
        title: "Services and staff",
        text: "A service's duration, the turnaround gap after it and who performs it are defined in one place.",
      },
      {
        title: "Working hours and time off",
        text: "Weekly hours are entered in the salon's own local time. Time off can be set for one person or for the whole salon; no slots open in that window.",
      },
      {
        title: "Clashes are blocked by the database",
        text: "A clashing appointment for the same stylist — counting the service's gap — is rejected at database level. “Check first, then write” is not considered enough.",
      },
      {
        title: "WhatsApp reminders",
        text: "The day's reminder list is ready in the panel and sent from WhatsApp in one tap. If the salon has connected its own number, the message comes from the salon rather than from Arvo.",
      },
    ],
  },
  flow: {
    eyebrow: "Getting started",
    title: "Setup takes one sitting.",
    lead: "Your booking address works the moment your services and staff are defined.",
    steps: [
      { title: "Describe the salon", text: "The setup wizard asks for services, staff and working hours in order." },
      { title: "Share your address", text: "Put your booking page on your Instagram profile, your WhatsApp status or your card." },
      { title: "Watch the calendar", text: "Bookings land on the calendar; the reminder list is ready at the start of the day." },
    ],
  },
  audience: {
    eyebrow: "Who it is for",
    title: "Any salon that runs on appointments.",
    items: [
      { title: "Hairdressers and barbers", text: "A full day per chair, for salons that would rather put the phone down and get back to work." },
      { title: "Beauty centres", text: "Teams running services of different lengths and gaps on the same calendar." },
      { title: "Care and aftercare", text: "Businesses opening slots by staff expertise, where time off changes often." },
    ],
  },
  faq: {
    eyebrow: "Frequently asked questions",
    title: "About Arvo Randevu",
    items: [
      { q: "Do customers have to register?", a: "No. The customer picks a service, a stylist and a time and enters a phone number; they are identified by that number and receive a cancellation link." },
      { q: "Can two appointments land on the same slot?", a: "No. A clashing appointment for the same stylist — counting the service's gap — is rejected at database level, not by an interface check." },
      { q: "How are working hours and time off defined?", a: "Weekly hours are entered in the salon's own local time. Time off can be set for a single staff member or the whole salon; no slots open in that window." },
      { q: "Who does the reminder come from?", a: "The day's reminder list is prepared in the panel and sent from WhatsApp in one tap. If the salon has connected its own WhatsApp number it comes from the salon; otherwise from Arvo's shared number." },
      { q: "How much does it cost?", a: `Monthly and annual list prices are published at ${R("pricing")}.` },
    ],
  },
  cta: {
    title: "Ready to put the paper book away?",
    lead: "We set it up with you; once your services and staff are defined, your booking page opens the same day.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=randevu`, variant: "gold" },
      { label: "Pricing", href: R("pricing"), variant: "ghost" },
    ],
  },
};
