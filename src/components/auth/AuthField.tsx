import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";

export interface AuthFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Required: ties the label, hint and error to the input. */
  id: string;
  label: string;
  /** Shown under the field while there is no error. */
  hint?: React.ReactNode;
  /** Field error; sets aria-invalid and is read out with the field. */
  error?: React.ReactNode;
  /** A link on the label row, e.g. "Forgot password?". */
  labelAction?: React.ReactNode;
  /** For type="password": add the Show/Hide toggle. Default true. */
  passwordToggle?: boolean;
  containerClassName?: string;
}

/**
 * A labelled input for auth and account forms. 48px tall, 16px text on phones
 * (no iOS zoom), small-caps label, error and hint wired with
 * aria-describedby. Pass autoComplete and inputMode for the field's purpose:
 *
 *   <AuthField id="login-email" label="Email" type="email" autoComplete="email" inputMode="email" />
 *   <AuthField id="login-password" label="Password" type="password" autoComplete="current-password" />
 */
export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  (
    { id, label, hint, error, labelAction, passwordToggle = true, type = "text", className, containerClassName, ...props },
    ref,
  ) => {
    const [visible, setVisible] = React.useState(false);
    const isPassword = type === "password";
    const showToggle = isPassword && passwordToggle;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId ?? hintId, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;

    return (
      <div className={cn("flex flex-col gap-2", containerClassName)}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </label>
          {labelAction}
        </div>
        <div className="relative">
          <input
            {...props}
            ref={ref}
            id={id}
            type={showToggle && visible ? "text" : type}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={describedBy}
            className={cn(
              "flex h-12 w-full rounded-control border border-input bg-background px-3.5 text-base text-foreground transition-[border-color,box-shadow] duration-hover ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm",
              showToggle && "pr-12",
              className,
            )}
          />
          {showToggle && (
            <IconButton
              label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              aria-controls={id}
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </IconButton>
          )}
        </div>
        {error ? (
          <p id={errorId} className="text-xs leading-snug text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
AuthField.displayName = "AuthField";

export default AuthField;
