import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Minimal, hand-rolled Card primitives.
 *
 * The shadcn `base-nova` generator emitted Card/Badge/Separator that depend on
 * `@base-ui/react` runtime and a full neutral token palette (primary/secondary/
 * destructive/ring/rounded-4xl). For this single-surface, server-rendered view
 * we keep things dependency-light: pure server components styled with the Vouch
 * tokens and the `cn` helper. See the agent report for the rationale.
 */

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-4 pt-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold leading-snug", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4 pb-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 pb-4", className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
