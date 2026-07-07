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
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
type VehicleType = Database["public"]["Enums"]["vehicle_type"];
type VehicleStatus = Database["public"]["Enums"]["vehicle_status"];
export type VehicleFormData = Omit<
  VehicleInsert,
  "id" | "company_id" | "created_at" | "updated_at"
>;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  onSubmit: (data: VehicleFormData) => Promise<void>;
  loading: boolean;
}

export function VehicleForm({ initialData, onSubmit, loading }: VehicleFormProps) {
  const [data, setData] = useState({
    registration: initialData?.registration || "",
    vehicle_type: (initialData?.vehicle_type || "truck") as VehicleType,
    make: initialData?.make || "",
    model: initialData?.model || "",
    year: initialData?.year || new Date().getFullYear(),
    vin: initialData?.vin || "",
    odometer: initialData?.odometer || 0,
    status: (initialData?.status || "available") as VehicleStatus,
    licence_expiry: initialData?.licence_expiry || "",
    insurance_expiry: initialData?.insurance_expiry || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="registration">Registration number *</Label>
        <Input
          id="registration"
          value={data.registration}
          onChange={(e) => setData({ ...data, registration: e.target.value })}
          placeholder="e.g., ABC 123"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="make">Make</Label>
          <Input
            id="make"
            value={data.make}
            onChange={(e) => setData({ ...data, make: e.target.value })}
            placeholder="e.g., Volvo"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={data.model}
            onChange={(e) => setData({ ...data, model: e.target.value })}
            placeholder="e.g., FH16"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            type="number"
            value={data.year}
            onChange={(e) => setData({ ...data, year: parseInt(e.target.value) })}
            min="1990"
            max={new Date().getFullYear()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vehicle_type">Type</Label>
          <Select
            value={data.vehicle_type}
            onValueChange={(v) => setData({ ...data, vehicle_type: v as VehicleType })}
          >
            <SelectTrigger id="vehicle_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="truck">Truck</SelectItem>
              <SelectItem value="van">Van</SelectItem>
              <SelectItem value="car">Car</SelectItem>
              <SelectItem value="motorcycle">Motorcycle</SelectItem>
              <SelectItem value="bus">Bus</SelectItem>
              <SelectItem value="tanker">Tanker</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vin">VIN (Vehicle Identification Number)</Label>
        <Input
          id="vin"
          value={data.vin}
          onChange={(e) => setData({ ...data, vin: e.target.value })}
          placeholder="17-character VIN"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="odometer">Current odometer (km)</Label>
        <Input
          id="odometer"
          type="number"
          value={data.odometer}
          onChange={(e) => setData({ ...data, odometer: parseInt(e.target.value) })}
          min="0"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="licence_expiry">Licence expiry</Label>
          <Input
            id="licence_expiry"
            type="date"
            value={data.licence_expiry}
            onChange={(e) => setData({ ...data, licence_expiry: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="insurance_expiry">Insurance expiry</Label>
          <Input
            id="insurance_expiry"
            type="date"
            value={data.insurance_expiry}
            onChange={(e) => setData({ ...data, insurance_expiry: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          value={data.status}
          onValueChange={(v) => setData({ ...data, status: v as VehicleStatus })}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="in_use">In Use</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="out_of_service">Out of Service</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
          placeholder="Additional vehicle information…"
          className="min-h-24"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Save vehicle"}
      </Button>
    </form>
  );
}
