import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Camera, Loader2, Plus, ShieldAlert } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { useIncidents } from "@/hooks/use-incidents";
import { useJobs } from "@/hooks/use-jobs";
import { useDrivers } from "@/hooks/use-drivers";
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

type IncidentType = Database["public"]["Enums"]["incident_type"];
type IncidentSeverity = Database["public"]["Enums"]["incident_severity"];
type IncidentStatus = Database["public"]["Enums"]["incident_status"];

export const Route = createFileRoute("/_authenticated/incidents")({
  head: () => ({ meta: [{ title: "Incidents — ZappOS" }] }),
  component: IncidentsPage,
});

const incidentTypes: IncidentType[] = [
  "accident",
  "breakdown",
  "vehicle_damage",
  "delivery_issue",
  "driver_issue",
  "customer_issue",
  "safety_issue",
  "other",
];
const severities: IncidentSeverity[] = ["low", "medium", "high", "critical"];
const statuses: IncidentStatus[] = ["open", "investigating", "resolved"];

function label(value: string) {
  return value.replace(/_/g, " ");
}

function IncidentsPage() {
  const { hasAnyRole, hasRole } = useCompany();
  const {
    incidents,
    loading,
    error,
    fetch,
    create,
    update,
    delete: deleteIncident,
  } = useIncidents();
  const { jobs } = useJobs();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    incident_type: "delivery_issue" as IncidentType,
    severity: "medium" as IncidentSeverity,
    status: "open" as IncidentStatus,
    description: "",
    location: "",
    job_id: "",
    driver_id: "",
    vehicle_id: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);

  const canManage = hasAnyRole(["admin", "fleet_manager", "dispatcher"]);
  const canCreate = canManage || hasRole("driver");
  const canDelete = hasRole("admin");

  const counts = useMemo(
    () => ({
      open: incidents.filter((incident) => incident.status === "open").length,
      critical: incidents.filter(
        (incident) => incident.status !== "resolved" && incident.severity === "critical",
      ).length,
      unresolved: incidents.filter((incident) => incident.status !== "resolved").length,
    }),
    [incidents],
  );

  const resetForm = () => {
    setForm({
      incident_type: "delivery_issue",
      severity: "medium",
      status: "open",
      description: "",
      location: "",
      job_id: "",
      driver_id: "",
      vehicle_id: "",
    });
    setPhotos([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await create(
        {
          incident_type: form.incident_type,
          severity: form.severity,
          status: form.status,
          description: form.description,
          location: form.location || null,
          job_id: form.job_id || null,
          driver_id: form.driver_id || null,
          vehicle_id: form.vehicle_id || null,
          occurred_at: new Date().toISOString(),
          photo_urls: null,
          resolution_notes: null,
          resolved_at: null,
        },
        photos,
      );
      toast.success("Incident reported");
      resetForm();
      setCreating(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to report incident");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <LoadingState label="Loading incidents" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <ErrorState title="Could not load incidents" description={error} onAction={fetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Safety and exceptions
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Report, investigate and resolve operational incidents.
          </p>
        </div>
        {canCreate ? (
          <Button className="gap-2" onClick={() => setCreating((value) => !value)}>
            <Plus className="h-4 w-4" />
            Report incident
          </Button>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Open</p>
          <p className="mt-2 text-3xl font-semibold">{counts.open}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Critical</p>
          <p className="mt-2 text-3xl font-semibold text-status-error">{counts.critical}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Unresolved</p>
          <p className="mt-2 text-3xl font-semibold">{counts.unresolved}</p>
        </Card>
      </div>

      {creating ? (
        <Card className="mb-6 p-4">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.incident_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      incident_type: event.target.value as IncidentType,
                    }))
                  }
                >
                  {incidentTypes.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.severity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      severity: event.target.value as IncidentSeverity,
                    }))
                  }
                >
                  {severities.map((severity) => (
                    <option key={severity} value={severity}>
                      {severity}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Related job</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.job_id}
                  onChange={(event) => {
                    const job = jobs.find((candidate) => candidate.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      job_id: event.target.value,
                      driver_id: job?.driver_id || current.driver_id,
                      vehicle_id: job?.vehicle_id || current.vehicle_id,
                    }));
                  }}
                >
                  <option value="">No job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.reference}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.driver_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, driver_id: event.target.value }))
                  }
                >
                  <option value="">None</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.vehicle_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, vehicle_id: event.target.value }))
                  }
                >
                  <option value="">None</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="incident-location">Location</Label>
              <Input
                id="incident-location"
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="incident-description">Description</Label>
              <Textarea
                id="incident-description"
                required
                rows={4}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="incident-photos">Photos</Label>
              <Input
                id="incident-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setPhotos(Array.from(event.target.files ?? []))}
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
                  <Camera className="h-4 w-4" />
                )}
                Submit
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents reported"
          description="Incident reports will appear here for review and resolution."
          icon={ShieldAlert}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {incidents.map((incident) => {
            const job = jobs.find((candidate) => candidate.id === incident.job_id);
            const driver = drivers.find((candidate) => candidate.id === incident.driver_id);
            const vehicle = vehicles.find((candidate) => candidate.id === incident.vehicle_id);
            return (
              <Card key={incident.id} className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={incident.status} variant="small" />
                      <StatusBadge status={incident.severity} variant="small" />
                    </div>
                    <h2 className="mt-2 text-sm font-semibold capitalize">
                      {label(incident.incident_type)}
                    </h2>
                  </div>
                  {incident.severity === "critical" && incident.status !== "resolved" ? (
                    <AlertTriangle className="h-5 w-5 text-status-error" />
                  ) : null}
                </div>
                <p className="text-sm">{incident.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>Job: {job?.reference || "-"}</p>
                  <p>Vehicle: {vehicle?.registration || "-"}</p>
                  <p>Driver: {driver?.full_name || "-"}</p>
                  <p>{new Date(incident.occurred_at).toLocaleString()}</p>
                </div>
                {incident.location ? (
                  <p className="mt-2 text-xs text-muted-foreground">{incident.location}</p>
                ) : null}
                {canManage ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        value={incident.status}
                        onChange={(event) =>
                          void update(incident.id, {
                            status: event.target.value as IncidentStatus,
                            resolved_at:
                              event.target.value === "resolved" ? new Date().toISOString() : null,
                          })
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        value={incident.severity}
                        onChange={(event) =>
                          void update(incident.id, {
                            severity: event.target.value as IncidentSeverity,
                          })
                        }
                      >
                        {severities.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Textarea
                      placeholder="Resolution notes"
                      defaultValue={incident.resolution_notes || ""}
                      onBlur={(event) =>
                        void update(incident.id, { resolution_notes: event.target.value || null })
                      }
                      rows={2}
                    />
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => void deleteIncident(incident.id)}
                      >
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
