type Props = {
  // "block" reserves the full map area (used while the map code loads);
  // "overlay" floats above an existing map container (used while the basemap loads).
  variant?: "block" | "overlay";
  label?: string;
};

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="h-9 w-9 animate-spin rounded-full border-[3px] border-iris-200 border-t-iris-600"
    />
  );
}

export function MapLoading({ variant = "block", label = "Loading map…" }: Props) {
  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/75 backdrop-blur-sm">
        <Spinner />
        <p className="text-sm font-semibold text-iris-700">{label}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-charcoal-200 bg-charcoal-50">
      <Spinner />
      <p className="text-sm font-semibold text-iris-700">{label}</p>
    </div>
  );
}
