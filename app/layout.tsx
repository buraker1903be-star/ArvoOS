import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./hero-fix.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://arvo-os.com"),
  title: {
    default: "ArvoOS | Kurumsal İşletim Sistemi",
    template: "%s | ArvoOS",
  },
  description:
    "ArvoOS; satış, finans, operasyon, ekip ve müşteri süreçlerini tek merkezde birleştiren kurumsal işletim sistemidir.",
  applicationName: "ArvoOS",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          // Sets data-theme before paint to avoid a light/dark flash on the panel.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('arvoos.theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
        {children}
      </body>
    </html>
  );
}
