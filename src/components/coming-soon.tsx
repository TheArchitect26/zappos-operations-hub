import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Card className="grid place-items-center py-16">
        <div className="grid h-12 w-12 place-items-center rounded-md bg-muted text-muted-foreground">
          <Construction className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium">Coming next</p>
        <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
          The ZappOS foundation is live. This module ships in the next build phase.
        </p>
      </Card>
    </div>
  );
}
