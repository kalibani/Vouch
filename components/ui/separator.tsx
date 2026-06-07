import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Minimal, hand-rolled Separator. Server component (the shadcn `base-nova`
 * version was a `"use client"` wrapper over `@base-ui/react`, unnecessary for a
 * static divider). Decorative by default, so it carries `role="none"`.
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      role="none"
      className={cn(
        "shrink-0 bg-border",
        orientation === "vertical" ? "h-full w-px self-stretch" : "h-px w-full",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
