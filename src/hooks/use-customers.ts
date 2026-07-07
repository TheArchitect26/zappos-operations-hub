import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import type { Database } from "@/integrations/supabase/types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];

interface CustomerFilters {
  searchTerm?: string;
}

export function useCustomers(filters?: CustomerFilters) {
  const { activeCompany } = useCompany();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!activeCompany) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", activeCompany.id)
        .order("name");

      if (err) throw err;

      let result = data || [];
      if (filters?.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        result = result.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.contact_person?.toLowerCase().includes(term) ||
            c.phone?.toLowerCase().includes(term) ||
            c.email?.toLowerCase().includes(term),
        );
      }

      setCustomers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [activeCompany?.id]);

  const create = async (
    data: Omit<CustomerInsert, "id" | "company_id" | "created_at" | "updated_at">,
  ) => {
    if (!activeCompany) throw new Error("No active company");
    const { data: customer, error: err } = await supabase
      .from("customers")
      .insert([{ ...data, company_id: activeCompany.id }])
      .select()
      .single();
    if (err) throw err;
    await fetch();
    return customer;
  };

  const update = async (id: string, updates: Partial<Customer>) => {
    const { error: err } = await supabase.from("customers").update(updates).eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const delete_ = async (id: string) => {
    const { error: err } = await supabase.from("customers").delete().eq("id", id);
    if (err) throw err;
    await fetch();
  };

  return { customers, loading, error, fetch, create, update, delete: delete_ };
}
