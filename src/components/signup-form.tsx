"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AUTH_BLUE, AUTH_INPUT_CLASS, AUTH_INPUT_STYLE, AuthShell } from "@/components/auth-shell";

type FieldErrors = Record<string, string>;

export function SignupForm() {
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  // Prefill the email if we arrived from the login screen's "create one now".
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clientValidate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!name.trim()) errs.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (confirm !== password) errs.confirm = "Passwords don't match.";
    return errs;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const local = clientValidate();
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; fieldErrors?: FieldErrors };
      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        if (data.error) setError(data.error);
        if (!data.fieldErrors && !data.error) setError("Couldn't create your account.");
        setLoading(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Couldn't create your account.");
      setLoading(false);
    }
  };

  const field = (key: string) =>
    fieldErrors[key] ? (
      <p className="text-xs text-[#c0392b]">{fieldErrors[key]}</p>
    ) : null;

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-xl font-semibold" style={{ color: "#131318" }}>
          Create your account
        </h1>

        <div className="space-y-1.5">
          <label htmlFor="signup-name" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
            Full name
          </label>
          <input
            id="signup-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
          {field("name")}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="signup-email" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
          {field("email")}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="signup-password" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
          {field("password") ?? (
            <p className="text-xs" style={{ color: "#8a909c" }}>
              At least 8 characters.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="signup-confirm" className="block text-sm font-normal normal-case tracking-normal" style={{ color: "#5b6270" }}>
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
          {field("confirm")}
        </div>

        {error ? <p className="text-sm text-[#c0392b]">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
          style={{ backgroundColor: AUTH_BLUE }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create account
        </button>

        <p className="text-center text-sm" style={{ color: "#5b6270" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold underline" style={{ color: AUTH_BLUE }}>
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
