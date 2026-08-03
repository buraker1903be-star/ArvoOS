import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const firstIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      documentType?: string;
      documentId?: string;
      accessType?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.documentId || !["proposal", "contract"].includes(body.documentType || "")) {
      return NextResponse.json({ error: "invalid_document" }, { status: 400 });
    }

    if (!["pdf_print", "share_link"].includes(body.accessType || "")) {
      return NextResponse.json({ error: "invalid_access_type" }, { status: 400 });
    }

    const supabase = await createClient();
    const headers = request.headers;
    const accessIp = firstIp(headers.get("x-forwarded-for"))
      || headers.get("x-real-ip")
      || headers.get("cf-connecting-ip")
      || null;

    const { error } = await supabase.rpc("log_document_access", {
      target_document_type: body.documentType,
      target_document_id: body.documentId,
      target_access_type: body.accessType,
      target_ip: accessIp,
      target_user_agent: headers.get("user-agent")?.slice(0, 1000) || null,
      target_referrer: headers.get("referer")?.slice(0, 1000) || null,
      target_metadata: body.metadata || {},
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
}
