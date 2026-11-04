import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Free to start. No card required.</p>
      <SignupForm />
    </>
  );
}
