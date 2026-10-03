import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  const isRange = Array.isArray(props.value) || Array.isArray(props.defaultValue);
  
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="relative block size-[18px] rounded-full border-2 border-primary bg-card shadow-sm transition-transform duration-press ease-out after:absolute after:-inset-[13px] after:content-[''] active:scale-110 disabled:pointer-events-none disabled:opacity-60" />
      {isRange && (
        <SliderPrimitive.Thumb className="relative block size-[18px] rounded-full border-2 border-primary bg-card shadow-sm transition-transform duration-press ease-out after:absolute after:-inset-[13px] after:content-[''] active:scale-110 disabled:pointer-events-none disabled:opacity-60" />
      )}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
