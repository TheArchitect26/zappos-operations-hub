import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
type VehicleStatus = Database["public"]["Enums"]["vehicle_status"];

interface VehicleFilters {
  status?: VehicleStatus;
  searchTerm?: string;
}

export function useVehicles(filters?: VehicleFilters) {
  const { activeCompany } = useCompany();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!activeCompany) {
      setVehicles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("vehicles")
        .select("*")
        .eq("company_id", activeCompany.id)
        .order("registration");

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      let result = data || [];
      if (filters?.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        result = result.filter(
          (v) =>
            v.registration.toLowerCase().includes(term) ||
            v.make?.toLowerCase().includes(term) ||
            v.model?.toLowerCase().includes(term),
        );
      }

      setVehicles(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicles");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [activeCompany?.id, filters?.status]);

  const create = async (
    data: Omit<VehicleInsert, "id" | "company_id" | "created_at" | "updated_at">,
  ) => {
    if (!activeCompany) throw new Error("No active company");
    const { data: vehicle, error: err } = await supabase
      .from("vehicles")
      .insert([{ ...data, company_id: activeCompany.id }])
      .select()
      .single();
    if (err) throw err;
    await fetch();
    return vehicle;
  };

  const update = async (id: string, updates: Partial<Vehicle>) => {
    const { error: err } = await supabase.from("vehicles").update(updates).eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const delete_ = async (id: string) => {
    const { error: err } = await supabase.from("vehicles").delete().eq("id", id);
    if (err) throw err;
    await fetch();
  };

  return { vehicles, loading, error, fetch, create, update, delete: delete_ };
}
