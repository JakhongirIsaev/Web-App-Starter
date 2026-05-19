interface MinervaIconProps {
  size?: number;
  className?: string;
}

// Kapitalbank mark — four diagonal stripes inline SVG.
export function MinervaIcon({ size = 32, className = "" }: MinervaIconProps) {
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

interface MinervaLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export default function MinervaLogo({ size = 32, className = "", showText = true }: MinervaLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MinervaIcon size={size} />
      {showText && (
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.55 }}>
          Minerva
        </span>
      )}
    </div>
  );
}
