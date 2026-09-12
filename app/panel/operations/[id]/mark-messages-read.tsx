"use client";

import { useEffect } from "react";
import { markCustomerMessagesRead } from "../actions";

// İş detayı ekranda açıldığında müşterinin okunmamış mesajlarını okundu
// sayar (işler listesindeki kırmızı belirteç söner). Mesajlar bu çizimde
// "Yeni" etiketiyle görünmeye devam eder.
export function MarkCustomerMessagesRead({ workflowId, unread }: { workflowId: string; unread: number }) {
  useEffect(() => {
    if (unread > 0) void markCustomerMessagesRead(workflowId).catch(() => undefined);
  }, [workflowId, unread]);
  return null;
}
