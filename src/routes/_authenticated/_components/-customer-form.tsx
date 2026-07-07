import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerFormData = Omit<
  CustomerInsert,
  "id" | "company_id" | "created_at" | "updated_at"
>;

interface CustomerFormProps {
  initialData?: Customer | null;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  loading: boolean;
}

export function CustomerForm({ initialData, onSubmit, loading }: CustomerFormProps) {
  const [data, setData] = useState({
    name: initialData?.name || "",
    contact_person: initialData?.contact_person || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    address: initialData?.address || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Company name *</Label>
        <Input
          id="name"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          placeholder="e.g., ABC Logistics Ltd"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact_person">Contact person</Label>
        <Input
          id="contact_person"
          value={data.contact_person}
          onChange={(e) => setData({ ...data, contact_person: e.target.value })}
          placeholder="Name of main contact"
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            placeholder="Email address"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={data.address}
          onChange={(e) => setData({ ...data, address: e.target.value })}
          placeholder="Full address"
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
        {loading ? "Saving…" : "Save customer"}
      </Button>
    </form>
  );
}
