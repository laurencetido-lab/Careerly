import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[hsl(243_45%_12%)] p-10 text-white lg:flex">
        <Logo className="text-white" />
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Discover. Connect. Grow.</p>
          <p className="mt-4 text-white/70">
            Describe the career you want. Careerly researches employers with real, cited sources, finds the people worth talking to, and keeps everything up to date.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-white/80">
            <li>• Every researched value links to its source and evidence</li>
            <li>• Nothing invented: unknown stays unknown</li>
            <li>• Your data stays private to your workspace</li>
          </ul>
        </div>
        <p className="text-xs text-white/40">© {new Date().getFullYear()} Careerly</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
