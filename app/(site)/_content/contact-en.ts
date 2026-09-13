// Contact — English.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { ContactContent } from "./contact";

export const CONTACT_EN: ContactContent = {
  meta: { title: "Contact & Demo Requests", description: `Contact Arvo for ArvoOS, ArvoLab and Arc demos, product access and project conversations: ${COMPANY.email}.` },
  hero: {
    eyebrow: "Contact", title: "Here for", subtitle: "your next idea.",
    lead: "For a product demo, panel access or a custom digital project, fill in the form or write to us directly — your request goes to the relevant product or project team.",
    actions: [],
  },
  formTitle: "Demo & contact form",
  formLead: "A few details are enough. Pick the product you’re interested in and tell us briefly what you need.",
  emailLabel: "Email", addressLabel: "Address", appsLabel: "Sign in", privacyLabel: "Personal data",
  privacyText: "Your form details are processed only to respond to your request.",
  faq: {
    eyebrow: "FAQ", title: "About contacting us",
    items: [
      { q: "How do I request a demo?", a: "Pick the product you’re interested in on this page’s form and describe your needs; our team will get back to you." },
      { q: "How else can I reach you?", a: `Send an email to ${COMPANY.email}.` },
      { q: "My organization already uses a panel — where do I sign in?", a: "ArvoOS runs at app.arvo-os.com, ArvoLab at lab.arvo-os.com and Arc at arc.arvo-os.com; if your organization has its own domain, you can sign in there too." },
      { q: "How is my form data used?", a: `Only to respond to your request. Details are in the Privacy Notice (${ROUTES.privacy.en}).` },
    ],
  },
};
