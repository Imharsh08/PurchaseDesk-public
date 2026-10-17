"use client";

import { useActionState } from "react";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { login } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next ?? ""} />
      <FieldGroup>
        {state?.error && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={state?.email}
            required
            autoFocus
            className="h-10"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </Field>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}
