import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPaytrCredentials, verifyPaytrCallback } from "@/lib/paytr";

export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role ayarları eksik.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const paymentAmount = String(form.get("payment_amount") ?? "");
  const hash = String(form.get("hash") ?? "");
  const paymentType = String(form.get("payment_type") ?? "");
  const failedReasonCode = String(form.get("failed_reason_code") ?? "");
  const failedReasonMsg = String(form.get("failed_reason_msg") ?? "");

  if (!merchantOid || !status || !totalAmount || !hash) {
    return new NextResponse("PAYTR notification failed: missing fields", { status: 400 });
  }

  const credentials = getPaytrCredentials();
  if (!verifyPaytrCallback({ merchantOid, status, totalAmount, hash, merchantKey: credentials.merchantKey, merchantSalt: credentials.merchantSalt })) {
    return new NextResponse("PAYTR notification failed: bad hash", { status: 400 });
  }

  const supabase = adminClient();
  const { data: order } = await supabase
    .from("paytr_payment_orders")
    .select("id,organization_id,invoice_id,amount,status")
    .eq("merchant_oid", merchantOid)
    .maybeSingle();
  if (!order) return new NextResponse("OK");

  const eventId = `${merchantOid}:${status}:${totalAmount}`;
  const { error: eventError } = await supabase.from("billing_events").insert({
    organization_id: order.organization_id,
    provider: "paytr",
    provider_event_id: eventId,
    event_type: `payment.${status}`,
    payload: Object.fromEntries(form.entries()),
    processed_at: new Date().toISOString(),
  });
  if (eventError?.code === "23505") return new NextResponse("OK");
  if (eventError) return new NextResponse("PAYTR notification failed: event", { status: 500 });

  if (status === "success") {
    const paidAmount = Number(paymentAmount || order.amount);
    if (!Number.isFinite(paidAmount) || paidAmount !== order.amount) {
      await supabase.from("billing_events").update({ error_message: "payment_amount mismatch" }).eq("provider", "paytr").eq("provider_event_id", eventId);
      return new NextResponse("PAYTR notification failed: amount", { status: 400 });
    }

    if (order.status !== "success") {
      const now = new Date().toISOString();
      await supabase.from("paytr_payment_orders").update({
        status: "success",
        payment_type: paymentType || null,
        total_amount: Number(totalAmount),
        callback_hash: hash,
        callback_received_at: now,
        updated_at: now,
      }).eq("id", order.id).neq("status", "success");

      await supabase.from("billing_invoices").update({
        provider: "paytr",
        provider_invoice_id: merchantOid,
        status: "paid",
        paid_at: now,
      }).eq("id", order.invoice_id).eq("organization_id", order.organization_id).neq("status", "paid");

      const { data: bankAccount } = await supabase
        .from("organization_bank_accounts")
        .select("id")
        .eq("organization_id", order.organization_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (bankAccount) {
        const { data: existingMovement } = await supabase
          .from("bank_transactions")
          .select("id")
          .eq("organization_id", order.organization_id)
          .eq("reference_no", merchantOid)
          .maybeSingle();
        if (!existingMovement) {
          await supabase.from("bank_transactions").insert({
            organization_id: order.organization_id,
            bank_account_id: bankAccount.id,
            direction: "inflow",
            amount: order.amount,
            currency: "TRY",
            transaction_date: new Date().toISOString().slice(0, 10),
            description: "PayTR online tahsilat",
            reference_no: merchantOid,
            reconciliation_status: "matched",
            matched_invoice_id: order.invoice_id,
            created_by: (await supabase.from("organization_memberships").select("user_id").eq("organization_id", order.organization_id).eq("is_active", true).in("role", ["owner", "admin"]).limit(1).maybeSingle()).data?.user_id,
          });
        }
      }

      await supabase.from("notifications").insert({
        organization_id: order.organization_id,
        audience: "organization",
        category: "payment_approved",
        title: "PayTR ödemeniz alındı",
        message: "Online ödemeniz doğrulandı ve faturanız ödendi olarak güncellendi.",
        action_url: "/panel/billing",
        metadata: { merchant_oid: merchantOid, invoice_id: order.invoice_id },
      });
    }
  } else {
    await supabase.from("paytr_payment_orders").update({
      status: "failed",
      payment_type: paymentType || null,
      total_amount: Number(totalAmount) || null,
      failed_reason_code: failedReasonCode || null,
      failed_reason_msg: failedReasonMsg || null,
      callback_hash: hash,
      callback_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", order.id).eq("status", "pending");
  }

  return new NextResponse("OK");
}
