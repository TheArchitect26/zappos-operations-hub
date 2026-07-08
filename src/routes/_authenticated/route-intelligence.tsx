import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock, Database, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/operational-state";
import { StatusBadge } from "@/components/ui/status-badge-detailed";
import type { Database as SupabaseDatabase } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/route-intelligence")({
  head: () => ({ meta: [{ title: "Route Intelligence — ZappOS" }] }),
  component: RouteIntelligencePage,
});

type Customer = SupabaseDatabase["public"]["Tables"]["customers"]["Row"];

interface RouteBaselineRow {
  id: string;
  company_id: string;
  route_key: string;
  customer_id: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  completed_trip_count: number;
  average_observed_duration_seconds: number | null;
  average_observed_distance_meters: number | null;
  average_delay_minutes: number | null;
  average_stop_count: number | null;
  delayed_trip_count: number;
  failed_trip_count: number;
  poor_quality_trip_count: number;
  data_quality_score: number;
  confidence: string;
  updated_at: string;
}

interface RoutePerformanceRecordRow {
  id: string;
  company_id: string;
  job_id: string;
  route_baseline_id: string | null;
  customer_id: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  status: string;
  actual_completed_at: string | null;
  delay_minutes: number | null;
  estimated_stop_count: number;
  delay_events: string[];
  observed_duration_seconds: number | null;
  observed_distance_meters: number;
  data_quality_score: number;
  confidence: string;
}

type UntypedSupabase = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        order: (
          column: string,
          options?: { ascending?: boolean; nullsFirst?: boolean },
        ) => {
          limit: (count: number) => PromiseLike<{ data: unknown[] | null; error: Error | null }>;
        };
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: Error | null }>;
};

function routeIntelligenceFrom() {
  return supabase as unknown as UntypedSupabase;
}

function formatMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 60) return `${rounded} min`;
  const hours = Math.floor(Math.abs(rounded) / 60);
  const minutes = Math.abs(rounded) % 60;
  return `${rounded < 0 ? "-" : ""}${hours}h ${minutes}m`;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "-";
  return formatMinutes(seconds / 60);
}

function formatDistance(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters)) return "-";
  return `${(meters / 1000).toFixed(1)} km`;
}

function routeLabel(route: Pick<RouteBaselineRow, "pickup_location" | "dropoff_location">) {
  return `${route.pickup_location || "Unknown pickup"} -> ${route.dropoff_location || "Unknown destination"}`;
}

function eventLabel(value: string) {
  return value.replaceAll("_", " ");
}

function RouteIntelligencePage() {
  const { activeCompany, hasAnyRole } = useCompany();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<RouteBaselineRow[]>([]);
  const [records, setRecords] = useState<RoutePerformanceRecordRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const activeCompanyId = activeCompany?.id;
  const canRead = hasAnyRole(["admin", "fleet_manager", "dispatcher", "viewer"]);
  const canRefresh = hasAnyRole(["admin", "fleet_manager", "dispatcher"]);

  const load = useCallback(async () => {
    if (!activeCompanyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [baselineResult, recordResult, customerResult] = await Promise.all([
        routeIntelligenceFrom()
          .from("route_segment_baselines")
          .select("*")
          .eq("company_id", activeCompanyId)
          .order("average_delay_minutes", { ascending: false, nullsFirst: false })
          .limit(20),
        routeIntelligenceFrom()
          .from("route_performance_records")
          .select("*")
          .eq("company_id", activeCompanyId)
          .order("actual_completed_at", { ascending: false, nullsFirst: false })
          .limit(50),
        supabase.from("customers").select("*").eq("company_id", activeCompanyId),
      ]);
      if (baselineResult.error) throw baselineResult.error;
      if (recordResult.error) throw recordResult.error;
      if (customerResult.error) throw customerResult.error;
      setBaselines((baselineResult.data ?? []) as RouteBaselineRow[]);
      setRecords((recordResult.data ?? []) as RoutePerformanceRecordRow[]);
      setCustomers(customerResult.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load route intelligence");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const customerLookup = useMemo(
    () => new globalThis.Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  const metrics = useMemo(() => {
    const repeatedDelayedRoutes = baselines.filter(
      (baseline) => baseline.completed_trip_count >= 2 && baseline.delayed_trip_count > 0,
    ).length;
    const delayedRecords = records.filter(
      (record) => (record.delay_minutes ?? 0) > 5 || record.delay_events.length > 0,
    );
    const averageDelay =
      records.length > 0
        ? records.reduce((sum, record) => sum + (record.delay_minutes ?? 0), 0) / records.length
        : null;
    const averageStops =
      records.length > 0
        ? records.reduce((sum, record) => sum + record.estimated_stop_count, 0) / records.length
        : null;
    return {
      repeatedDelayedRoutes,
      delayedRecordCount: delayedRecords.length,
      averageDelay,
      averageStops,
    };
  }, [baselines, records]);

  const refresh = async () => {
    if (!activeCompanyId || !canRefresh) return;
    setRefreshing(true);
    setError(null);
    try {
      const { error: refreshError } = await routeIntelligenceFrom().rpc(
        "refresh_route_intelligence_for_company",
        { _company_id: activeCompanyId },
      );
      if (refreshError) throw refreshError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh route intelligence");
    } finally {
      setRefreshing(false);
    }
  };

  if (!canRead) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <ErrorState
          title="Route intelligence is restricted"
          description="Your current role cannot view fleet route performance."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <LoadingState label="Loading route intelligence" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Historical route intelligence
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Route Intelligence v1</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Deterministic baselines from completed tracking sessions. Observed average delay,
            observed duration, stops, and data quality only. No predictions.
          </p>
        </div>
        {canRefresh ? (
          <Button onClick={refresh} disabled={refreshing} className="gap-2">
            <Database className="h-4 w-4" />
            {refreshing ? "Refreshing" : "Refresh baselines"}
          </Button>
        ) : null}
      </div>

      {error ? <ErrorState title="Route intelligence unavailable" description={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={RouteIcon}
          label="Repeated delayed routes"
          value={metrics.repeatedDelayedRoutes}
        />
        <Metric icon={AlertTriangle} label="Delayed records" value={metrics.delayedRecordCount} />
        <Metric
          icon={Clock}
          label="Observed average delay"
          value={formatMinutes(metrics.averageDelay)}
        />
        <Metric
          icon={Activity}
          label="Observed average stops"
          value={metrics.averageStops == null ? "-" : metrics.averageStops.toFixed(1)}
        />
      </div>

      {baselines.length === 0 && records.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            title="No route baselines yet"
            description="Refresh after completed or failed tracked jobs exist to store historical route intelligence records."
            icon={RouteIcon}
          />
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Repeated route baselines</h2>
        <div className="grid gap-3">
          {baselines.map((baseline) => {
            const customer = baseline.customer_id ? customerLookup.get(baseline.customer_id) : null;
            return (
              <Card key={baseline.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{customer?.name ?? "No customer"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{routeLabel(baseline)}</p>
                  </div>
                  <StatusBadge status={baseline.confidence} variant="small" />
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Completed trips" value={String(baseline.completed_trip_count)} />
                  <Field
                    label="Observed duration"
                    value={formatDuration(baseline.average_observed_duration_seconds)}
                  />
                  <Field
                    label="Observed distance"
                    value={formatDistance(baseline.average_observed_distance_meters)}
                  />
                  <Field
                    label="Observed average delay"
                    value={formatMinutes(baseline.average_delay_minutes)}
                  />
                  <Field
                    label="Average stop count"
                    value={
                      baseline.average_stop_count == null
                        ? "-"
                        : baseline.average_stop_count.toFixed(1)
                    }
                  />
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <Field label="Delayed trips" value={String(baseline.delayed_trip_count)} />
                  <Field label="Failed trips" value={String(baseline.failed_trip_count)} />
                  <Field
                    label="Data quality"
                    value={`${Math.round(baseline.data_quality_score)}%`}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent route performance records</h2>
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {records.map((record) => {
              const customer = record.customer_id ? customerLookup.get(record.customer_id) : null;
              return (
                <div
                  key={record.id}
                  className="grid gap-3 p-4 text-sm lg:grid-cols-[minmax(0,1.4fr)_120px_120px_120px_minmax(0,1fr)]"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{customer?.name ?? "No customer"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {routeLabel(record)}
                    </p>
                  </div>
                  <Field label="Observed delay" value={formatMinutes(record.delay_minutes)} />
                  <Field
                    label="Duration"
                    value={formatDuration(record.observed_duration_seconds)}
                  />
                  <Field label="Stops" value={String(record.estimated_stop_count)} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Delay events</p>
                    <p className="mt-0.5 truncate">
                      {record.delay_events.length
                        ? record.delay_events.map(eventLabel).join(", ")
                        : "-"}
                    </p>
                  </div>
                </div>
              );
            })}
            {records.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No route performance records are stored yet.
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate">{value}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </Card>
  );
}
