import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  variant?: "default" | "small";
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  // Vehicle statuses
  available: { bg: "bg-status-available/15", text: "text-status-available", label: "Available" },
  in_use: { bg: "bg-status-in-use/15", text: "text-status-in-use", label: "In Use" },
  maintenance: { bg: "bg-status-neutral/15", text: "text-status-neutral", label: "Maintenance" },
  out_of_service: {
    bg: "bg-status-warning/15",
    text: "text-status-warning",
    label: "Out of Service",
  },

  // Driver statuses
  on_trip: { bg: "bg-status-in-use/15", text: "text-status-in-use", label: "On Trip" },
  off_duty: { bg: "bg-status-neutral/15", text: "text-status-neutral", label: "Off Duty" },
  suspended: { bg: "bg-status-error/15", text: "text-status-error", label: "Suspended" },

  // Job statuses
  unassigned: { bg: "bg-status-warning/15", text: "text-status-warning", label: "Unassigned" },
  assigned: { bg: "bg-status-info/15", text: "text-status-info", label: "Assigned" },
  accepted: { bg: "bg-status-info/15", text: "text-status-info", label: "Accepted" },
  in_progress: { bg: "bg-status-in-use/15", text: "text-status-in-use", label: "In Progress" },
  arrived: { bg: "bg-status-in-use/15", text: "text-status-in-use", label: "Arrived" },
  completed: { bg: "bg-status-success/15", text: "text-status-success", label: "Completed" },
  failed: { bg: "bg-status-error/15", text: "text-status-error", label: "Failed" },
  cancelled: { bg: "bg-status-neutral/15", text: "text-status-neutral", label: "Cancelled" },

  // Job priorities
  low: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", label: "Low" },
  normal: { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400", label: "Normal" },
  high: { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", label: "High" },
  critical: { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400", label: "Critical" },

  // Document statuses
  valid: { bg: "bg-status-success/15", text: "text-status-success", label: "Valid" },
  expiring_soon: {
    bg: "bg-status-warning/15",
    text: "text-status-warning",
    label: "Expiring Soon",
  },
  expired: { bg: "bg-status-error/15", text: "text-status-error", label: "Expired" },

  // Maintenance statuses
  reported: { bg: "bg-status-warning/15", text: "text-status-warning", label: "Reported" },
  scheduled: { bg: "bg-status-info/15", text: "text-status-info", label: "Scheduled" },

  // Incident statuses
  open: { bg: "bg-status-error/15", text: "text-status-error", label: "Open" },
  investigating: {
    bg: "bg-status-warning/15",
    text: "text-status-warning",
    label: "Investigating",
  },
  resolved: { bg: "bg-status-success/15", text: "text-status-success", label: "Resolved" },
};

export function StatusBadge({ status, variant = "default" }: StatusBadgeProps) {
  const config = statusColors[status] || {
    bg: "bg-muted/50",
    text: "text-muted-foreground",
    label: status.replace(/_/g, " "),
  };

  if (variant === "small") {
    return (
      <span
        className={cn(
          "inline-block rounded px-1.5 py-0.5 text-xs font-medium",
          config.bg,
          config.text,
        )}
      >
        {config.label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium",
        config.bg,
        config.text,
      )}
    >
      <div className={cn("h-1.5 w-1.5 rounded-full", config.text.replace("text-", "bg-"))} />
      {config.label}
    </div>
  );
}
