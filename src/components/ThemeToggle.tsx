import { useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

const ThemeToggle = ({ className = "" }: { className?: string }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  // Focus returns to the trigger when the menu closes; that focus should not
  // pop the tooltip open over the page the visitor just re-themed.
  const justClosed = useRef(false);

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];

  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) setTipOpen(false);
        else {
          justClosed.current = true;
          window.setTimeout(() => {
            justClosed.current = false;
          }, 250);
        }
      }}
    >
      <Tooltip
        open={tipOpen && !menuOpen}
        onOpenChange={(open) => {
          if (open && justClosed.current) {
            justClosed.current = false;
            return;
          }
          setTipOpen(open);
        }}
      >
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              label={`Theme: ${current.label}`}
              className={cn("hover:text-primary aria-expanded:bg-muted aria-expanded:text-primary", className)}
            >
              {resolvedTheme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </IconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Theme</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" sideOffset={8} className="tx-sheet w-44 p-1.5">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeValue)}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuPrimitive.RadioItem
              key={value}
              value={value}
              className="relative flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-control pl-2.5 pr-8 text-sm text-foreground outline-none transition-colors duration-hover data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-medium"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {label}
              <DropdownMenuPrimitive.ItemIndicator className="absolute right-2.5 grid place-items-center text-primary">
                <Check className="size-4 [stroke-width:2]" aria-hidden="true" />
              </DropdownMenuPrimitive.ItemIndicator>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
