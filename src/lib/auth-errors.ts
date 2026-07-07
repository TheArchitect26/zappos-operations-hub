type AuthLikeError = {
  message?: string;
  code?: string | number;
  status?: number;
};

function normalize(value: string | number | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeAuthError(error: unknown, fallback = "Something went wrong") {
  const authError = (error ?? {}) as AuthLikeError;
  const message = normalize(authError.message);
  const code = normalize(authError.code);
  const status = normalize(authError.status);
  const haystack = `${code} ${status} ${message}`;

  if (
    haystack.includes("email not confirmed") ||
    haystack.includes("email_not_confirmed") ||
    haystack.includes("email not verified") ||
    haystack.includes("email_not_verified")
  ) {
    return "Check your email to confirm your account before signing in.";
  }

  if (
    haystack.includes("user already registered") ||
    haystack.includes("already registered") ||
    haystack.includes("user already exists") ||
    haystack.includes("email already exists")
  ) {
    return "An account with that email already exists. Sign in or reset your password.";
  }

  if (
    haystack.includes("signup disabled") ||
    haystack.includes("signups not allowed") ||
    haystack.includes("registration disabled") ||
    haystack.includes("sign up not allowed")
  ) {
    return "Account signups are disabled for this workspace.";
  }

  if (
    haystack.includes("invalid login credentials") ||
    haystack.includes("invalid credentials") ||
    haystack.includes("wrong credentials")
  ) {
    return "Invalid email or password. If you recently signed up, confirm your email first.";
  }

  if (
    haystack.includes("rate limit") ||
    haystack.includes("too many requests") ||
    haystack.includes("for security purposes")
  ) {
    return "Too many attempts. Wait a moment and try again.";
  }

  if (
    haystack.includes("failed to fetch") ||
    haystack.includes("network") ||
    haystack.includes("fetch failed") ||
    haystack.includes("timeout")
  ) {
    return "Network or server error. Check your connection and try again.";
  }

  return authError.message || fallback;
}

export function isEmailConfirmationPending(result: {
  session: unknown;
  user: { email_confirmed_at?: string | null; identities?: unknown[] | null } | null;
}) {
  return Boolean(result.user && !result.session && !result.user.email_confirmed_at);
}
