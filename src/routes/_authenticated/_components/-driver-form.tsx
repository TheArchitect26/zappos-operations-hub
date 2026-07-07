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

type Driver = Database["public"]["Tables"]["drivers"]["Row"];
type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"];
type DriverStatus = Database["public"]["Enums"]["driver_status"];
export type DriverFormData = Omit<DriverInsert, "id" | "company_id" | "created_at" | "updated_at">;

interface DriverFormProps {
  initialData?: Driver | null;
  onSubmit: (data: DriverFormData) => Promise<void>;
  loading: boolean;
}

export function DriverForm({ initialData, onSubmit, loading }: DriverFormProps) {
  const [data, setData] = useState({
    full_name: initialData?.full_name || "",
    phone: initialData?.phone || "",
    employee_ref: initialData?.employee_ref || "",
    licence_number: initialData?.licence_number || "",
    licence_class: initialData?.licence_class || "",
    licence_expiry: initialData?.licence_expiry || "",
    status: (initialData?.status || "available") as DriverStatus,
    emergency_contact_name: initialData?.emergency_contact_name || "",
    emergency_contact_phone: initialData?.emergency_contact_phone || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">Full name *</Label>
        <Input
          id="full_name"
          value={data.full_name}
          onChange={(e) => setData({ ...data, full_name: e.target.value })}
          placeholder="e.g., John Smith"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            placeholder="Contact number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="employee_ref">Employee/Reference #</Label>
          <Input
            id="employee_ref"
            value={data.employee_ref}
            onChange={(e) => setData({ ...data, employee_ref: e.target.value })}
            placeholder="e.g., EMP-001"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="licence_number">Licence number</Label>
          <Input
            id="licence_number"
            value={data.licence_number}
            onChange={(e) => setData({ ...data, licence_number: e.target.value })}
            placeholder="Driver licence number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="licence_class">Licence class</Label>
          <Input
            id="licence_class"
            value={data.licence_class}
            onChange={(e) => setData({ ...data, licence_class: e.target.value })}
            placeholder="e.g., HGV, PCV"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="licence_expiry">Licence expiry date</Label>
        <Input
          id="licence_expiry"
          type="date"
          value={data.licence_expiry}
          onChange={(e) => setData({ ...data, licence_expiry: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          value={data.status}
          onValueChange={(v) => setData({ ...data, status: v as DriverStatus })}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="on_trip">On Trip</SelectItem>
            <SelectItem value="off_duty">Off Duty</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Emergency contact</Label>
        <Input
          placeholder="Contact name"
          value={data.emergency_contact_name}
          onChange={(e) => setData({ ...data, emergency_contact_name: e.target.value })}
          className="text-sm"
        />
        <Input
          placeholder="Contact phone"
          type="tel"
          value={data.emergency_contact_phone}
          onChange={(e) => setData({ ...data, emergency_contact_phone: e.target.value })}
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={data.notes}
          onChange={(e) => setData({ ...data, notes: e.target.value })}
          placeholder="Additional driver information…"
          className="min-h-20"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Save driver"}
      </Button>
    </form>
  );
}
