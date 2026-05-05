import { type ComponentType, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ToolbarOverflowAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Renders red and is grouped under a separator. Use for destructive ops. */
  danger?: boolean;
  /** Disable + show muted. */
  disabled?: boolean;
  /** Hide from the menu entirely (useful for permission gating). */
  hidden?: boolean;
}

interface ToolbarOverflowProps {
  actions: ToolbarOverflowAction[];
  /** aria-label for the trigger. Defaults to "More actions". */
  triggerLabel?: string;
  /** Slot rendered above actions (e.g., section heading). */
  header?: ReactNode;
  /** Override side the menu opens to. Default: "end" (right-aligned). */
  align?: "start" | "center" | "end";
  /** Optional className for the trigger button. */
  className?: string;
}

/**
 * Page-toolbar overflow menu. Three-dot vertical icon trigger that opens a
 * dropdown of secondary actions (Import, Export, Templates, etc.). Pair with a
 * single primary action button. Auto-renders nothing if all actions are hidden.
 */
export function ToolbarOverflow({
  actions,
  triggerLabel = "More actions",
  header,
  align = "end",
  className,
}: ToolbarOverflowProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const safe = visible.filter((a) => !a.danger);
  const dangerous = visible.filter((a) => a.danger);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("h-9 w-9 data-[state=open]:bg-accent", className)}
          aria-label={triggerLabel}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {header}
        {safe.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              onSelect={() => {
                if (!action.disabled) action.onClick();
              }}
              disabled={action.disabled}
              className="gap-2 cursor-pointer"
            >
              {Icon && <Icon className="h-4 w-4" />}
              {action.label}
            </DropdownMenuItem>
          );
        })}
        {safe.length > 0 && dangerous.length > 0 && <DropdownMenuSeparator />}
        {dangerous.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              onSelect={() => {
                if (!action.disabled) action.onClick();
              }}
              disabled={action.disabled}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              {Icon && <Icon className="h-4 w-4" />}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
