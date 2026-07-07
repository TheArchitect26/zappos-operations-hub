import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Driver = Database["public"]["Tables"]["drivers"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type JobStatus = Database["public"]["Enums"]["job_status"];
type JobPriority = Database["public"]["Enums"]["job_priority"];
export type JobFormData = Omit<JobInsert, "id" | "company_id" | "created_at" | "updated_at">;

interface JobFormProps {
  initialData?: Job | null;
  onSubmit: (data: JobFormData) => Promise<void>;
  loading: boolean;
  customers: Customer[];
  drivers: Driver[];
  vehicles: Vehicle[];
}

export function JobForm({
  initialData,
  onSubmit,
  loading,
  customers,
  drivers,
  vehicles,
}: JobFormProps) {
  const [data, setData] = useState({
    customer_id: initialData?.customer_id || null,
    pickup_location: initialData?.pickup_location || "",
    dropoff_location: initialData?.dropoff_location || "",
    driver_id: initialData?.driver_id || null,
    vehicle_id: initialData?.vehicle_id || null,
    scheduled_at: initialData?.scheduled_at
      ? new Date(initialData.scheduled_at).toISOString().slice(0, 16)
      : "",
    description: initialData?.description || "",
    notes: initialData?.notes || "",
    priority: (initialData?.priority || "normal") as JobPriority,
    status: (initialData?.status || "unassigned") as JobStatus,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...data,
      scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null,
    };
    await onSubmit(submitData);
  };

  const selectedDriver = drivers.find((d) => d.id === data.driver_id);
  const selectedVehicle = vehicles.find((v) => v.id === data.vehicle_id);

  const warnings: string[] = [];
  if (selectedDriver?.status === "suspended") {
    warnings.push("⚠️ Driver is suspended");
  }
  if (selectedDriver?.status === "off_duty") {
    warnings.push("⚠️ Driver is off duty");
  }
  if (selectedDriver?.licence_expiry && new Date(selectedDriver.licence_expiry) < new Date()) {
    warnings.push("⚠️ Driver licence is expired");
  }
  if (selectedVehicle?.status === "maintenance") {
    warnings.push("⚠️ Vehicle is in maintenance");
  }
  if (selectedVehicle?.status === "out_of_service") {
    warnings.push("⚠️ Vehicle is out of service");
  }
  if (selectedVehicle?.licence_expiry && new Date(selectedVehicle.licence_expiry) < new Date()) {
    warnings.push("⚠️ Vehicle licence is expired");
  }
  if (
    selectedVehicle?.insurance_expiry &&
    new Date(selectedVehicle.insurance_expiry) < new Date()
  ) {
    warnings.push("⚠️ Vehicle insurance is expired");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {warnings.length > 0 && (
        <Alert className="border-status-warning/30 bg-status-warning/10">
          <AlertDescription className="text-xs">{warnings.join(" ")}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customer_id">Customer</Label>
          <Select
            value={data.customer_id || ""}
            onValueChange={(v) => setData({ ...data, customer_id: v })}
          >
            <SelectTrigger id="customer_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={data.priority}
            onValueChange={(v) => setData({ ...data, priority: v as JobPriority })}
          >
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pickup_location">Pickup location *</Label>
          <Input
            id="pickup_location"
            value={data.pickup_location}
            onChange={(e) => setData({ ...data, pickup_location: e.target.value })}
            placeholder="Pickup address"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dropoff_location">Dropoff/Destination *</Label>
          <Input
            id="dropoff_location"
            value={data.dropoff_location}
            onChange={(e) => setData({ ...data, dropoff_location: e.target.value })}
            placeholder="Delivery address"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="driver_id">Assigned driver</Label>
          <Select
            value={data.driver_id || ""}
            onValueChange={(v) => setData({ ...data, driver_id: v })}
          >
            <SelectTrigger id="driver_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vehicle_id">Assigned vehicle</Label>
          <Select
            value={data.vehicle_id || ""}
            onValueChange={(v) => setData({ ...data, vehicle_id: v })}
          >
            <SelectTrigger id="vehicle_id">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.registration} ({v.make} {v.model})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="scheduled_at">Scheduled date/time</Label>
          <Input
            id="scheduled_at"
            type="datetime-local"
            value={data.scheduled_at}
            onChange={(e) => setData({ ...data, scheduled_at: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={data.status}
            onValueChange={(v) => setData({ ...data, status: v as JobStatus })}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="arrived">Arrived</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => setData({ ...data, description: e.target.value })}
          placeholder="What needs to be done…"
          className="min-h-20"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
          placeholder="Additional information…"
          className="min-h-20"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
