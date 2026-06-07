import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Minimal, hand-rolled Badge. Server component, no `@base-ui/react` runtime.
 * Triage/state/flag colors are passed in by the caller via className so the
 * Vouch token palette stays the single source of truth (color is always paired
 * with an icon + text label at the call site — never color alone).
 */
function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap [&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
