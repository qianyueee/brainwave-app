import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;

if (url && key) {
  supabase = createClient(url, key, {
    auth: {
      flowType: "implicit",
    },
  });
} else {
  console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — Supabase disabled");
}

/** 接続先（未設定なら null）。デスクトップの Google ログインが PKCE の交換を
 *  直接呼ぶのに使う（lib/mind/desktop-google-auth.ts）。 */
export const SUPABASE_URL = url ?? null;
export const SUPABASE_ANON_KEY = key ?? null;

export { supabase };
