import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/incidents")({ component: Page });
function Page() { return <ComingSoon title="Incidents" description="Report and resolve incidents from any device." />; }
