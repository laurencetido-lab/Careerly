"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Careerly? <Link className="text-primary hover:underline" href="/signup">Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="privacy" className="mt-0.5" required />
        <span>
          I have read the <Link href="/privacy" className="text-primary hover:underline" target="_blank">privacy notice</Link>. My data stays private to my account; AI processing of my CV only happens if I enable it.
        </span>
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link className="text-primary hover:underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}
