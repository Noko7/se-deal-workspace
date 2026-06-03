"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENV_COOKIE, ENVIRONMENTS, type EnvironmentId } from "@/lib/environment";

export function EnvironmentSwitcher({ initialEnv }: { initialEnv: EnvironmentId }) {
  const router = useRouter();
  const [env, setEnv] = useState<EnvironmentId>(initialEnv);

  const handleChange = (next: EnvironmentId) => {
    setEnv(next);
    document.cookie = `${ENV_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <label className="flex items-center gap-1.5 rounded-full bg-iris-500 px-2.5 py-1 text-xs font-medium text-white">
      <span className="text-white/80">Env</span>
      <select
        aria-label="Environment"
        value={env}
        onChange={(event) => handleChange(event.target.value as EnvironmentId)}
        className="cursor-pointer border-0 bg-transparent p-0 pr-4 text-xs font-semibold text-white focus:outline-none focus:ring-0 [&>option]:text-charcoal-900"
      >
        {ENVIRONMENTS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
