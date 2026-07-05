import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/dispatch")({ component: Page });
function Page() { return <ComingSoon title="Dispatch" description="Assign drivers and vehicles fast, with live conflict detection." />; }
