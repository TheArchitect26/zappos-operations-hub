import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [session, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
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
          setConfirmationEmail(email);
          setMode("confirm");
          setPassword("");
          return;
        }

        toast.success("Account created. Redirecting…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
    } catch (err) {
      console.warn("[Auth] request failed", {
        mode,
        message: err instanceof Error ? err.message : "unknown",
      });
      toast.error(normalizeAuthError(err, "Something went wrong"));
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
                  Finish confirming the account before signing in. If the message does not arrive,
                  check spam or request another signup with the same email.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setMode("signin")}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
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
