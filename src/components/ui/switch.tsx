import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,border-color] duration-hover ease-out data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=unchecked]:border-foreground/25 data-[state=unchecked]:bg-foreground/20 disabled:cursor-not-allowed disabled:opacity-60",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-5 rounded-full bg-background shadow-md ring-0 transition-transform duration-dropdown ease-out data-[state=checked]:translate-x-[21px] data-[state=unchecked]:translate-x-px",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
