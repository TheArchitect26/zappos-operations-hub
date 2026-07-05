import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
import { useCompany } from "@/lib/company-context";
export const Route = createFileRoute("/_authenticated/operations")({ component: Page });
function Page() { const { terminology: t } = useCompany(); return <ComingSoon title={t.Plural} description={`Create, assign and track ${t.plural} with an activity timeline for each one.`} />; }
