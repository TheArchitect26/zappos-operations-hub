import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wordmark } from "@/components/brand/wordmark";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { isEmailConfirmationPending, normalizeAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — ZappOS" }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const callbackError =
      params.get("error_description") ||
      hashParams.get("error_description") ||
      params.get("error") ||
      hashParams.get("error");

    if (!callbackError) return;
    const message = normalizeAuthError(new Error(callbackError), "Could not complete sign in");
    setAuthMessage(message);
    toast.error(message);
  }, []);

  const showAuthError = (err: unknown, fallback = "Something went wrong") => {
    const message = normalizeAuthError(err, fallback);
    setAuthMessage(message);
    toast.error(message);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setAuthMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;
        console.info("[Auth] signup response", {
          hasSession: Boolean(data.session),
          hasUser: Boolean(data.user),
          identities: data.user?.identities?.length ?? null,
          emailConfirmed: Boolean(data.user?.email_confirmed_at),
        });

        if (isEmailConfirmationPending({ session: data.session, user: data.user })) {
          setConfirmationEmail(normalizedEmail);
          setMode("confirm");
          setPassword("");
          setAuthMessage("Check your email to confirm your account before signing in.");
          return;
        }

        toast.success("Account created. Redirecting…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        toast.success("Signed in");
      }
    } catch (err) {
      console.warn("[Auth] request failed", {
        mode,
        message: err instanceof Error ? err.message : "unknown",
      });
      showAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Wordmark size="lg" showTagline />
        </div>
        <Card className="border-border/70 bg-card/60 backdrop-blur">
          <CardHeader className="pb-4">
            {mode === "confirm" ? (
              <>
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  {confirmationEmail
                    ? `We sent a confirmation link to ${confirmationEmail}.`
                    : "We sent a confirmation link to your email address."}
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle>{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
                <CardDescription>
                  {mode === "signup"
                    ? "You'll set up your company workspace next."
                    : "Sign in to your operations workspace."}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {mode === "confirm" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Finish confirming {confirmationEmail || "your account"} before signing in. If the
                  message does not arrive, check spam or sign up again with the same email address.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEmail(confirmationEmail);
                    setMode("signin");
                    setAuthMessage("");
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <Tabs
                value={mode}
                onValueChange={(v) => {
                  setMode(v as "signin" | "signup");
                  setAuthMessage("");
                }}
              >
                <TabsList className="mb-5 grid grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
                <TabsContent value={mode} forceMount>
                  <form className="space-y-4" onSubmit={submit}>
                    {mode === "signup" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="fullName">Full name</Label>
                        <Input
                          id="fullName"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          autoComplete="name"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === "signin" ? (
                          <Link
                            to="/forgot-password"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Forgot?
                          </Link>
                        ) : null}
                      </div>
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {mode === "signup" ? "Create account" : "Sign in"}
                    </Button>
                    {authMessage ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        {authMessage}
                      </p>
                    ) : null}
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to operate ZappOS responsibly for your fleet.
        </p>
      </div>
    </div>
  );
}
