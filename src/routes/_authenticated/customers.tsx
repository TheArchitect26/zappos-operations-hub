import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/customers")({ component: Page });
function Page() { return <ComingSoon title="Customers" description="Lightweight customer directory linked to your operational work." />; }
