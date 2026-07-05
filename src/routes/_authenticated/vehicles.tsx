import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/vehicles")({ component: Page });
function Page() { return <ComingSoon title="Vehicles" description="Universal vehicle register with status, licences and full history." />; }
