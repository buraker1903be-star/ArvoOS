"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;
const contractUrl = (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  return `/soz