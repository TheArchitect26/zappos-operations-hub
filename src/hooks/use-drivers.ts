import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import type { Database } from "@/integrations/supabase/types";

type Driver = Database["public"]["Tables"]["drivers"]["Row"];
type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"];
type DriverStatus = Database["public"]["Enums"]["driver_status"];

interface DriverFilters {
  status?: DriverStatus;
  searchTerm?: string;
}

export function useDrivers(filters?: DriverFilters) {
  const { activeCompany } = useCompany();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!activeCompany) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("drivers")
        .select("*")
        .eq("company_id", activeCompany.id)
        .order("full_name");

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      let result = data || [];
      if (filters?.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        result = result.filter(
          (d) =>
            d.full_name.toLowerCase().includes(term) ||
            d.phone?.toLowerCase().includes(term) ||
            d.licence_number?.toLowerCase().includes(term),
        );
      }

      setDrivers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drivers");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [activeCompany?.id, filters?.status]);

  const create = async (
    data: Omit<DriverInsert, "id" | "company_id" | "created_at" | "updated_at">,
  ) => {
    if (!activeCompany) throw new Error("No active company");
    const { data: driver, error: err } = await supabase
      .from("drivers")
      .insert([{ ...data, company_id: activeCompany.id }])
      .select()
      .single();
    if (err) throw err;
    await fetch();
    return driver;
  };

  const update = async (id: string, updates: Partial<Driver>) => {
    const { error: err } = await supabase.from("drivers").update(updates).eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const delete_ = async (id: string) => {
    const { error: err } = await supabase.from("drivers").delete().eq("id", id);
    if (err) throw err;
    await fetch();
  };

  return { drivers, loading, error, fetch, create, update, delete: delete_ };
}
