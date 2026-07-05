import { createFileRoute } from "@tanstack/react-router";
import { useCompany } from "@/lib/company-context";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — ZappOS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { activeCompany, roles } = useCompany();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage your workspace and preferences.</p>

      <Card className="mt-5 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Company</div>
            <div className="mt-0.5 text-sm font-medium">{activeCompany?.name}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Business type</div>
            <div className="mt-0.5 text-sm font-medium capitalize">{activeCompany?.business_type?.replace("_", " ")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Country</div>
            <div className="mt-0.5 text-sm font-medium">{activeCompany?.country ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fleet size</div>
            <div className="mt-0.5 text-sm font-medium">{activeCompany?.fleet_size ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Terminology</div>
            <div className="mt-0.5 text-sm font-medium capitalize">{activeCompany?.terminology}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Your roles</div>
            <div className="mt-0.5 text-sm font-medium capitalize">{roles.join(", ").replace(/_/g, " ") || "—"}</div>
          </div>
        </div>
      </Card>

      <Card className="mt-5 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming soon</div>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li>· Team members &amp; roles</li>
          <li>· Document expiry threshold</li>
          <li>· Notification preferences</li>
          <li>· Demo data loader</li>
        </ul>
      </Card>
    </div>
  );
}
