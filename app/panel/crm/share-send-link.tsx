"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markDocumentShared } from "./sales-actions";

// Paylaşım bağlantısı belge oluşturulurken kaydediliyor ve personel onu
// doğrudan WhatsApp/e-posta ile gönderiyordu; durum ise yalnızca
// "Müşteriye Gönder"/"İmzaya Gönder"de değiştiği için belge müşteriye
// ulaştığı halde "Taslak"ta kalıyordu. Gönderim düğmesine basıldığı anda
// belge "Gönderildi"ye geçer; bağlantı normal şekilde açılmaya devam eder.
export function ShareSendLink({
  kind,
  token,
  href,
  className,
  newTab = false,
  children,
}: {
  kind: "proposal" | "contract";
  token: string;
  href: string;
  className: string;
  newTab?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <a
      className={className}
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      onClick={() => {
        startTransition(async () => {
          await markDocumentShared(kind, token);
          router.refresh();
        });
      }}
    >
      {children}
    </a>
  );
}
