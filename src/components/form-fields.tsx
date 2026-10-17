"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GST_STATES } from "@/lib/states";
import { cn } from "@/lib/utils";

export type FieldErrors = Record<string, string[]> | undefined;

type BaseProps = {
  name: string;
  label: string;
  errors?: FieldErrors;
  description?: React.ReactNode;
  className?: string;
  required?: boolean;
};

function FieldShell({
  name,
  label,
  errors,
  description,
  className,
  required,
  children,
}: BaseProps & { children: React.ReactNode }) {
  const error = errors?.[name]?.[0];
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={name}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export function TextField({
  name,
  label,
  errors,
  description,
  className,
  required,
  ...props
}: BaseProps & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <FieldShell {...{ name, label, errors, description, className, required }}>
      <Input id={name} name={name} required={required} aria-invalid={!!errors?.[name]} {...props} />
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  label,
  errors,
  description,
  className,
  required,
  ...props
}: BaseProps & Omit<React.ComponentProps<typeof Textarea>, "name">) {
  return (
    <FieldShell {...{ name, label, errors, description, className, required }}>
      <Textarea id={name} name={name} required={required} aria-invalid={!!errors?.[name]} {...props} />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  errors,
  description,
  className,
  required,
  options,
  defaultValue,
  placeholder,
  onValueChange,
}: BaseProps & {
  options: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <FieldShell {...{ name, label, errors, description, className, required }}>
      <Select name={name} defaultValue={defaultValue ?? undefined} onValueChange={onValueChange}>
        <SelectTrigger id={name} className="w-full" aria-invalid={!!errors?.[name]}>
          <SelectValue placeholder={placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

const STATE_OPTIONS = GST_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));

export function StateField(props: Omit<React.ComponentProps<typeof SelectField>, "options">) {
  return <SelectField placeholder="Select state" {...props} options={STATE_OPTIONS} />;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
