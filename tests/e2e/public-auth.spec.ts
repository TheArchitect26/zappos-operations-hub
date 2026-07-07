import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(hasOverflow).toBe(false);
}

async function switchToSignUp(page: import("@playwright/test").Page) {
  const signUpTab = page.getByRole("tab", { name: /sign up/i });
  await expect(async () => {
    await signUpTab.click();
    await expect(signUpTab).toHaveAttribute("data-state", "active", { timeout: 1_000 });
  }).toPass();
}

const supabaseCorsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

test("public root redirects unauthenticated users to auth", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("auth page exposes sign in and sign up forms", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await switchToSignUp(page);
  await expect(page.getByText("Create your account")).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("signup requiring email confirmation shows a clear confirmation state", async ({ page }) => {
  const email = "new-user@example.com";

  await page.route("**/auth/v1/signup**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: supabaseCorsHeaders });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: supabaseCorsHeaders,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email,
        email_confirmed_at: null,
        confirmation_sent_at: new Date().toISOString(),
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "New User" },
        identities: [{ id: "identity-1", provider: "email", identity_data: { email } }],
      }),
    });
  });

  await page.goto("/auth");
  await switchToSignUp(page);
  await page.getByLabel("Full name").fill("New User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("ValidPassword!123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText(`We sent a confirmation link to ${email}.`)).toBeVisible();
  await expect(page.getByText(`Finish confirming ${email} before signing in.`)).toBeVisible();
  await page.getByRole("button", { name: /back to sign in/i }).click();
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expectNoHorizontalOverflow(page);
});

test("email confirmation callback errors do not look like wrong credentials", async ({ page }) => {
  await page.goto("/auth#error_description=Email%20not%20confirmed");
  await expect(
    page.getByText("Check your email to confirm your account before signing in.").first(),
  ).toBeVisible();
  await expect(page.getByText(/wrong credentials/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("forgot password page renders without authenticated state", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByText("Reset your password")).toBeVisible();
  await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
