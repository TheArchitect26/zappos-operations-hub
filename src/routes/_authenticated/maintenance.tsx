import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { useMaintenance } from "@/hooks/use-maintenance";
import { useVehicles } from "@/hooks/use-vehicles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge-detailed";
import { EmptyState, ErrorState, LoadingState } from "@/components/operational-state";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MaintenanceType = Database["public"]["Enums"]["maintenance_type"];
type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — ZappOS" }] }),
  component: MaintenancePage,
});

const maintenanceTypes: MaintenanceType[] = [
  "service",
  "repair",
  "inspection",
  "tyres",
  "brakes",
  "engine",
  "electrical",
  "other",
];
const statuses: MaintenanceStatus[] = ["reported", "scheduled", "in_progress", "completed"];

function label(value: string) {
  return value.replace(/_/g, " ");
}

function isOverdue(date: string | null, status: MaintenanceStatus) {
  if (!date || status === "completed") return false;
  return date < new Date().toISOString().split("T")[0];
}

function MaintenancePage() {
  const { hasAnyRole, hasRole } = useCompany();
  const {
    maintenance,
    loading,
    error,
    fetch,
    create,
    update,
    delete: deleteMaintenance,
  } = useMaintenance();
  const { vehicles } = useVehicles();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<File | null>(null);
  const [form, setForm] = useState({
    vehicle_id: "",
    title: "",
    maintenance_type: "service" as MaintenanceType,
    status: "reported" as MaintenanceStatus,
    scheduled_date: "",
    due_odometer: "",
    cost: "",
    description: "",
    notes: "",
  });

  const canManage = hasAnyRole(["admin", "fleet_manager"]);
  const canDelete = hasRole("admin");

  const counts = useMemo(
    () => ({
      active: maintenance.filter((item) => item.status !== "completed").length,
      overdue: maintenance.filter((item) => isOverdue(item.scheduled_date, item.status)).length,
      inProgress: maintenance.filter((item) => item.status === "in_progress").length,
    }),
    [maintenance],
  );

  const resetForm = () => {
    setForm({
      vehicle_id: "",
      title: "",
      maintenance_type: "service",
      status: "reported",
      scheduled_date: "",
      due_odometer: "",
      cost: "",
      description: "",
      notes: "",
    });
    setInvoice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await create(
        {
          vehicle_id: form.vehicle_id,
          title: form.title,
          maintenance_type: form.maintenance_type,
          status: form.status,
          scheduled_date: form.scheduled_date || null,
          due_odometer: form.due_odometer ? Number(form.due_odometer) : null,
          cost: form.cost ? Number(form.cost) : null,
          description: form.description || null,
          notes: form.notes || null,
          invoice_url: null,
          started_at: form.status === "in_progress" ? new Date().toISOString() : null,
          completed_at: form.status === "completed" ? new Date().toISOString() : null,
        },
        invoice,
      );
      toast.success("Maintenance task created");
      resetForm();
      setCreating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create maintenance task");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <LoadingState label="Loading maintenance" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <ErrorState title="Could not load maintenance" description={error} onAction={fetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Fleet readiness
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Maintenance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Report faults, schedule work, track cost and keep vehicles out of dispatch while active.
          </p>
        </div>
        {canManage ? (
          <Button className="gap-2" onClick={() => setCreating((value) => !value)}>
            <Plus className="h-4 w-4" />
            New task
          </Button>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Active</p>
          <p className="mt-2 text-3xl font-semibold">{counts.active}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-status-error">{counts.overdue}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">In progress</p>
          <p className="mt-2 text-3xl font-semibold">{counts.inProgress}</p>
        </Card>
      </div>

      {creating ? (
        <Card className="mb-6 p-4">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vehicle">Vehicle</Label>
                <select
                  id="vehicle"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.vehicle_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, vehicle_id: event.target.value }))
                  }
                  required
                >
                  <option value="">Select vehicle</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.maintenance_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maintenance_type: event.target.value as MaintenanceType,
                    }))
                  }
                >
                  {maintenanceTypes.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as MaintenanceStatus,
                    }))
                  }
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled">Date trigger</Label>
                <Input
                  id="scheduled"
                  type="date"
                  value={form.scheduled_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scheduled_date: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odometer">Odometer trigger</Label>
                <Input
                  id="odometer"
                  type="number"
                  min="0"
                  value={form.due_odometer}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, due_odometer: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cost">Cost</Label>
                <Input
                  id="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, cost: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice">Invoice upload</Label>
                <Input
                  id="invoice"
                  type="file"
                  onChange={(event) => setInvoice(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4" />
                )}
                Create task
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {maintenance.length === 0 ? (
        <EmptyState
          title="No maintenance tasks"
          description="Vehicle faults, service work and inspections will appear here."
          icon={Wrench}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {maintenance.map((item) => {
            const vehicle = vehicles.find((candidate) => candidate.id === item.vehicle_id);
            const overdue = isOverdue(item.scheduled_date, item.status);
            return (
              <Card key={item.id} className={overdue ? "border-status-error/40 p-4" : "p-4"}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={item.status} variant="small" />
                      {overdue ? <StatusBadge status="critical" variant="small" /> : null}
                    </div>
                    <h2 className="mt-2 truncate text-sm font-semibold">{item.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {vehicle?.registration || "Unknown vehicle"} · {label(item.maintenance_type)}
                    </p>
                  </div>
                  {item.cost ? (
                    <p className="text-sm font-semibold tabular-nums">
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: "USD",
                      }).format(item.cost)}
                    </p>
                  ) : null}
                </div>
                {item.description ? <p className="text-sm">{item.description}</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Date: {item.scheduled_date || "-"}</p>
                  <p>Odometer: {item.due_odometer ?? "-"}</p>
                  <p>Created: {new Date(item.created_at).toLocaleDateString()}</p>
                  <p>Invoice: {item.invoice_url ? "Uploaded" : "-"}</p>
                </div>
                {canManage ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        value={item.status}
                        onChange={(event) => {
                          const status = event.target.value as MaintenanceStatus;
                          void update(item.id, {
                            status,
                            started_at:
                              status === "in_progress"
                                ? (item.started_at ?? new Date().toISOString())
                                : item.started_at,
                            completed_at:
                              status === "completed" ? new Date().toISOString() : item.completed_at,
                          });
                        }}
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {label(status)}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.cost ?? ""}
                        onBlur={(event) =>
                          void update(item.id, {
                            cost: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </div>
                    <Textarea
                      placeholder="Notes"
                      defaultValue={item.notes || ""}
                      onBlur={(event) =>
                        void update(item.id, { notes: event.target.value || null })
                      }
                      rows={2}
                    />
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive hover:bg-destructive/10"
                        onClick={() => void deleteMaintenance(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
