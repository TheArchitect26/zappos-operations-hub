import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
export const Route = createFileRoute("/_authenticated/drivers")({ component: Page });
function Page() { return <ComingSoon title="Drivers" description="Driver register, licences, assignments and mobile experience." />; }
