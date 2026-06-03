type Props = {
  // "block" reserves the full map area (used while the map code loads);
  // "overlay" floats above an existing map container (used while the basemap loads).
  variant?: "block" | "overlay";
  label?: string;
  sublabel?: string;
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

function Text({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold text-iris-700">{label}</p>
      {sublabel ? <p className="mt-0.5 text-xs text-charcoal-500">{sublabel}</p> : null}
    </div>
  );
}

export function MapLoading({
  variant = "block",
  label = "Loading map…",
  sublabel = "Loading lots of deal data",
}: Props) {
  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/75 backdrop-blur-sm">
        <Spinner />
        <Text label={label} sublabel={sublabel} />
      </div>
    );
  }

  return (
    <div className="flex h-[600px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-charcoal-200 bg-charcoal-50">
      <Spinner />
      <Text label={label} sublabel={sublabel} />
    </div>
  );
}
