import "./lib/error-capture";

import { createClient } from "@supabase/supabase-js";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import type { Database } from "./integrations/supabase/types";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function getEnvValue(env: unknown, key: string) {
  if (env && typeof env === "object" && key in env) {
    const value = (env as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

function isUuid(value: string | null) {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}

function parseCoordinate(value: string | null, min: number, max: number) {
  if (value === null || value.trim() === "") return null;
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Object.is(parsed, -0) ? 0 : parsed;
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      (supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

async function authorizeTomTomProxy(request: Request, env: unknown, companyId: string) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) return false;

  const supabaseUrl = getEnvValue(env, "SUPABASE_URL");
  const supabaseKey =
    getEnvValue(env, "SUPABASE_PUBLISHABLE_KEY") ??
    getEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabaseKey) return false;

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      fetch: createSupabaseFetch(supabaseKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("company_id", companyId)
    .in("role", ["admin", "fleet_manager", "dispatcher", "viewer"])
    .limit(1);

  return !error && Boolean(data?.length);
}

async function handleTomTomFlowProxy(request: Request, env: unknown) {
  if (request.method !== "GET") {
    return Response.json({ unavailableReason: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const latitude = parseCoordinate(url.searchParams.get("lat"), -90, 90);
  const longitude = parseCoordinate(url.searchParams.get("lng"), -180, 180);
  const companyId = url.searchParams.get("company_id");
  if (latitude === null || longitude === null) {
    return Response.json({ unavailableReason: "Invalid coordinates" }, { status: 400 });
  }
  if (!isUuid(companyId)) {
    return Response.json({ unavailableReason: "Invalid company context" }, { status: 400 });
  }

  if (!(await authorizeTomTomProxy(request, env, companyId as string))) {
    return Response.json({ unavailableReason: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getEnvValue(env, "TOMTOM_API_KEY");
  if (!apiKey) {
    return Response.json({
      unavailableReason: "Traffic provider is not configured",
      retrievedAt: new Date().toISOString(),
    });
  }

  const providerUrl = new URL(
    "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
  );
  providerUrl.searchParams.set("point", `${latitude},${longitude}`);
  providerUrl.searchParams.set("unit", "KMPH");
  providerUrl.searchParams.set("key", apiKey);

  try {
    const response = await fetch(providerUrl);
    if (!response.ok) {
      return Response.json(
        {
          unavailableReason: "Traffic provider unavailable",
          retrievedAt: new Date().toISOString(),
        },
        { status: 502 },
      );
    }
    const payload = await response.json();
    return Response.json({ ...payload, retrievedAt: new Date().toISOString() });
  } catch {
    return Response.json(
      { unavailableReason: "Traffic provider unavailable", retrievedAt: new Date().toISOString() },
      { status: 502 },
    );
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/providers/tomtom-flow") {
        return await handleTomTomFlowProxy(request, env);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
