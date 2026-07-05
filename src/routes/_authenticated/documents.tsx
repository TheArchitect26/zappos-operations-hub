import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/documents")({ component: Page });
function Page() { return <ComingSoon title="Documents" description="Company, vehicle and driver documents with expiry tracking." />; }
