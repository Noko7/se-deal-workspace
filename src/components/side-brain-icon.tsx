type SideBrainIconProps = {
  className?: string;
};

/**
 * Side-profile brain (like the 🧠 emoji, viewed from the side) drawn as a
 * single-color line icon so it matches the lucide icon set used elsewhere.
 */
export function SideBrainIcon({ className }: SideBrainIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Bumpy outer silhouette */}
      <path d="M6 6.2C4.8 5 6.6 3.4 8.2 4.1 9 3.1 10.8 3.1 11.6 4.2 12.6 3.2 15 3.4 15.4 5 17.6 5 19 6.6 18.6 8.7 19.8 9.6 19.8 11.6 18.6 12.6 19.4 14.2 18.2 16 16.2 16 15.8 17.8 14 18.9 12.4 18.1 11.4 19.4 9 19.4 8 17.9 6 17.9 4.6 16.3 5.1 14.4 3.6 13.5 3.6 11 5.1 10 4.1 8.9 4.6 7.1 6 6.2Z" />
      {/* Brain stem */}
      <path d="M11.2 18.1V21" />
      {/* Internal folds (sulci) */}
      <path d="M8.6 7.4C9.6 8.4 11 8.4 12 7.5" />
      <path d="M6.8 11C8.3 12 10.3 12 11.8 11" />
      <path d="M8.8 14.4C9.8 15.2 11.2 15.2 12.2 14.4" />
      <path d="M14 8C14.9 9.6 14.9 13.4 14 15" />
    </svg>
  );
}
