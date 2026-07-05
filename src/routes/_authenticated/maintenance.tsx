import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/maintenance")({ component: Page });
function Page() { return <ComingSoon title="Maintenance" description="Report, schedule and complete service, repairs and inspections." />; }
