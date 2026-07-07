import { supabase } from "@/integrations/supabase/client";

export interface ConflictWarning {
  type: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export async function detectJobAssignmentConflicts(
  companyId: string,
  driverId: string | null,
  vehicleId: string | null,
  excludeJobId?: string,
): Promise<ConflictWarning[]> {
  const { data, error } = await supabase.rpc("job_assignment_conflicts", {
    _company_id: companyId,
    _job_id: excludeJobId ?? "00000000-0000-0000-0000-000000000000",
    _driver_id: driverId,
    _vehicle_id: vehicleId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConflictWarning[]) : [];
}

export function hasBlockingConflict(conflicts: ConflictWarning[]): boolean {
  return conflicts.some((c) => c.severity === "error");
}
