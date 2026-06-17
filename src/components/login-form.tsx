"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AUTH_BLUE, AUTH_INPUT_CLASS, AUTH_INPUT_STYLE, AuthShell } from "@/components/auth-shell";

type Step = "email" | "password";

function PrimaryButton({
  children,
  disabled,
  loading,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
      style={{ backgroundColor: AUTH_BLUE }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  // Account-AI is the workspace home: always land there after login, regardless
  // of which page bounced the user to the sign-in screen.
  const nextParam = () => "/";

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNoAccount(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; exists?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Enter a valid email address.");
      }
      if (data.exists) {
        setStep("password");
      } else {
        setNoAccount(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Incorrect email or password.");
      }
      // Full navigation so server components re-render with the new session.
      window.location.assign(nextParam());
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {step === "email" ? (
        <form onSubmit={submitEmail} className="space-y-5" noValidate>
          <h1 className="text-xl font-semibold" style={{ color: "#131318" }}>
            Log in with your Email
          </h1>

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={AUTH_INPUT_CLASS}
              style={AUTH_INPUT_STYLE}
            />
          </div>

          {error ? <p className="text-sm text-[#c0392b]">{error}</p> : null}
          {noAccount ? (
            <p className="rounded-md px-3 py-2 text-sm" style={{ background: "#fff4e5", color: "#8a5a00" }}>
              We couldn&apos;t find an account for that email.{" "}
              <Link href={`/signup?email=${encodeURIComponent(email)}`} className="font-semibold underline" style={{ color: AUTH_BLUE }}>
                Create one now
              </Link>
              .
            </p>
          ) : null}

          <PrimaryButton loading={loading}>Continue</PrimaryButton>

          <p className="text-center text-sm" style={{ color: "#5b6270" }}>
            Don&apos;t have an SE Deal Workspace account?{" "}
            <Link href="/signup" className="font-semibold underline" style={{ color: AUTH_BLUE }}>
              Sign up now
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={submitPassword} className="space-y-5" noValidate>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setPassword("");
              setError(null);
            }}
            className="flex items-center gap-1.5 bg-transparent p-0 text-sm font-medium normal-case tracking-normal"
            style={{ color: AUTH_BLUE }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
          </button>

          <div>
            <h1 className="text-xl font-semibold" style={{ color: "#131318" }}>
              Enter your password
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#5b6270" }}>
              {email}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={AUTH_INPUT_CLASS}
              style={AUTH_INPUT_STYLE}
            />
          </div>

          {error ? <p className="text-sm text-[#c0392b]">{error}</p> : null}

          <PrimaryButton loading={loading} disabled={password.length === 0}>
            Log in
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
