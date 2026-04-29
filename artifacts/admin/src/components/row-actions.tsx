import { type ComponentType, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Renders red and is grouped under a separator. Use for Delete / Archive. */
  danger?: boolean;
  /** Disable + show muted. */
  disabled?: boolean;
  /** Hide from the menu entirely (useful for permission gating). */
  hidden?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
  /** aria-label for the trigger button. Defaults to "Actions". */
  triggerLabel?: string;
  /** Extra slot above the actions (e.g., a heading or status). */
  header?: ReactNode;
  /** Override the side the menu opens to. Default: "end" (right-aligned). */
  align?: "start" | "center" | "end";
}

/**
 * Standard row-level overflow menu. One trigger ("..."), action items inside.
 * Destructive actions (`danger: true`) are visually separated and red.
 */
export function RowActions({ actions, triggerLabel = "Actions", header, align = "end" }: RowActionsProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const safe = visible.filter((a) => !a.danger);
  const dangerous = visible.filter((a) => a.danger);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 data-[state=open]:bg-accent"
          aria-label={triggerLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {header}
        {safe.map((action) => (
          <ActionItem key={action.label} action={action} />
        ))}
        {safe.length > 0 && dangerous.length > 0 && <DropdownMenuSeparator />}
        {dangerous.map((action) => (
          <ActionItem key={action.label} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionItem({ action }: { action: RowAction }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem
      onSelect={() => {
        if (!action.disabled) action.onClick();
      }}
      disabled={action.disabled}
      className={cn(
        "gap-2 cursor-pointer",
        action.danger && "text-destructive focus:text-destructive focus:bg-destructive/10",
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {action.label}
    </DropdownMenuItem>
  );
}
