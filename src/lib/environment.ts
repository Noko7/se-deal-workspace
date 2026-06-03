export const ENV_COOKIE = "app-env";

export type EnvironmentId = "foundation" | "dev";

export type EnvironmentConfig = {
  id: EnvironmentId;
  label: string;
};

// Environments selectable from the global switcher. Add new ones here.
export const ENVIRONMENTS: EnvironmentConfig[] = [
  { id: "foundation", label: "Foundation" },
  { id: "dev", label: "Dev" },
];

export const DEFAULT_ENVIRONMENT: EnvironmentId = "foundation";

export function isEnvironmentId(value: string | undefined | null): value is EnvironmentId {
  return ENVIRONMENTS.some((env) => env.id === value);
}

export function resolveEnvironmentId(value: string | undefined | null): EnvironmentId {
  return isEnvironmentId(value) ? value : DEFAULT_ENVIRONMENT;
}
