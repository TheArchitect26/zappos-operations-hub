import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/notifications")({ component: Page });
function Page() { return <ComingSoon title="Notifications" description="In-app alerts for assignments, delays, incidents and expirations." />; }
