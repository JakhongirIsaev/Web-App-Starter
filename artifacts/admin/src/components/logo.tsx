interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textColor?: string;
}

// Kapitalbank mark — four diagonal stripes. Inline SVG so it stays crisp
// at any size and inherits the brand yellow regardless of theme.
export function MinervaIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 196.97 196.97"
      className={className}
      aria-hidden
    >
      <polygon fill="#FFD531" points="148.59,0 67.18,196.97 114.9,196.97 196.31,0 " />
      <polygon fill="#FFD531" points="82.07,0 0.65,196.97 48.37,196.97 129.78,0 " />
      <polygon fill="#FFD531" points="63.24,0 0,0 0,153.02 " />
      <polygon fill="#FFD531" points="133.71,196.97 196.97,196.97 196.97,43.94 " />
    </svg>
  );
}

export default function Logo({ size = 32, className = "", showText = true, textColor = "text-current" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <MinervaIcon size={size} />
      {showText && (
        <span className={`font-bold tracking-tight ${textColor}`} style={{ fontSize: size * 0.55 }}>
          Minerva
        </span>
      )}
    </div>
  );
}
