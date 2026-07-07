import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useSession } from "@/lib/session";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
type JobStatus = Database["public"]["Enums"]["job_status"];
type JobPriority = Database["public"]["Enums"]["job_priority"];
type JobEvent = Database["public"]["Tables"]["job_events"]["Row"];

export interface AssignmentConflict {
  type: string;
  severity: "info" | "warning" | "error";
  message: string;
  references?: string[];
}

interface AssignmentResult {
  ok: boolean;
  conflicts: AssignmentConflict[];
  override_allowed?: boolean;
  override_used?: boolean;
}

interface JobFilters {
  status?: JobStatus;
  priority?: JobPriority;
  searchTerm?: string;
}

export function useJobs(filters?: JobFilters) {
  const { activeCompany } = useCompany();
  const { user } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!activeCompany) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("jobs")
        .select("*")
        .eq("company_id", activeCompany.id)
        .order("created_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.priority) {
        query = query.eq("priority", filters.priority);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      let result = data || [];
      if (filters?.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        result = result.filter(
          (j) =>
            j.reference.toLowerCase().includes(term) ||
            j.pickup_location?.toLowerCase().includes(term) ||
            j.dropoff_location?.toLowerCase().includes(term),
        );
      }

      setJobs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [activeCompany?.id, filters?.status, filters?.priority]);

  const create = async (
    data: Omit<JobInsert, "id" | "company_id" | "created_at" | "updated_at">,
  ) => {
    if (!activeCompany) throw new Error("No active company");
    const insertData: JobInsert = {
      ...data,
      company_id: activeCompany.id,
      created_by: data.created_by ?? user?.id ?? null,
      scheduled_at: data.scheduled_at || null,
    };
    const { data: job, error: err } = await supabase
      .from("jobs")
      .insert([insertData])
      .select()
      .single();
    if (err) throw err;
    await fetch();
    return job;
  };

  const update = async (id: string, updates: Partial<Job>) => {
    const { error: err } = await supabase.from("jobs").update(updates).eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const delete_ = async (id: string) => {
    const { error: err } = await supabase.from("jobs").delete().eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const assign = async (
    jobId: string,
    driverId: string,
    vehicleId: string,
    adminOverride = false,
  ): Promise<AssignmentResult> => {
    const { data, error: err } = await supabase.rpc("assign_job_with_conflict_check", {
      _job_id: jobId,
      _driver_id: driverId,
      _vehicle_id: vehicleId,
      _admin_override: adminOverride,
    });
    if (err) throw err;
    await fetch();
    const result = data as unknown as AssignmentResult;
    return {
      ok: Boolean(result?.ok),
      conflicts: Array.isArray(result?.conflicts) ? result.conflicts : [],
      override_allowed: Boolean(result?.override_allowed),
      override_used: Boolean(result?.override_used),
    };
  };

  const fetchEvents = async (jobId: string): Promise<JobEvent[]> => {
    const { data, error: err } = await supabase
      .from("job_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (err) throw err;
    return data || [];
  };

  return { jobs, loading, error, fetch, create, update, delete: delete_, assign, fetchEvents };
}
