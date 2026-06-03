"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ENV_COOKIE, ENVIRONMENTS, type EnvironmentId } from "@/lib/environment";

export function EnvironmentSwitcher({ initialEnv }: { initialEnv: EnvironmentId }) {
  const router = useRouter();
  const [env, setEnv] = useState<EnvironmentId>(initialEnv);
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: EnvironmentId) => {
    setEnv(next);
    document.cookie = `${ENV_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Re-fetch the server data for the new environment; isPending reflects the
    // in-flight refresh so we can show feedback while large sources load.
    startTransition(() => router.refresh());
  };

  return (
    <label className="flex items-center gap-1.5 rounded-full bg-iris-500 px-2.5 py-1 text-xs font-medium text-white">
      <span className="text-white/80">Env</span>
      <select
        aria-label="Environment"
        value={env}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value as EnvironmentId)}
        className="cursor-pointer border-0 bg-transparent p-0 pr-1 text-xs font-semibold text-white focus:outline-none focus:ring-0 disabled:cursor-wait [&>option]:text-charcoal-900"
      >
        {ENVIRONMENTS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {isPending ? <Loader2 className="h-3 w-3 animate-spin text-white/90" aria-label="Switching" /> : null}
    </label>
  );
}
