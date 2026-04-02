interface MinervaIconProps {
  size?: number;
  className?: string;
}

export function MinervaIcon({ size = 32, className = "" }: MinervaIconProps) {
  const barCount = 9;
  const gap = 1.5;
  const barWidth = (size - gap * (barCount - 1)) / barCount;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      {Array.from({ length: barCount }).map((_, i) => {
        const x = i * (barWidth + gap);
        const heightFactor = 0.6 + Math.sin((i / (barCount - 1)) * Math.PI) * 0.4;
        const barHeight = size * heightFactor;
        const y = (size - barHeight) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={barWidth * 0.15}
            fill={i < barCount / 2 ? "#4ADE80" : "#22C55E"}
            opacity={0.7 + (i / barCount) * 0.3}
          />
        );
      })}
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
        <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.55 }}>
          Minerva
        </span>
      )}
    </div>
  );
}
