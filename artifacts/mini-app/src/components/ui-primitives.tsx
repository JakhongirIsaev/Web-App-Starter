/**
 * Minerva v2 shared UI primitives for mini-app.
 * Mirrors the design system's primitives.jsx but as typed React components.
 */
import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/* ── Status chip ── */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:          { label: "Черновик",  cls: "mn-chip-draft" },
  questionnaire:  { label: "Анкета",   cls: "mn-chip-questionnaire" },
  recommendation: { label: "Подбор",   cls: "mn-chip-recommendation" },
  basket:         { label: "Корзина",  cls: "mn-chip-basket" },
  pdf_generated:  { label: "PDF готов",cls: "mn-chip-pdf_generated" },
  under_review:   { label: "На рассм.",cls: "mn-chip-under_review" },
  approved:       { label: "Одобрен",  cls: "mn-chip-approved" },
  completed:      { label: "Завершён", cls: "mn-chip-completed" },
  rejected:       { label: "Отклонён", cls: "mn-chip-rejected" },
};

export function StatusChip({ status, children }: { status: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const cls = meta?.cls ?? "mn-chip-draft";
  const label = children ?? t(`statuses.${status}`, meta?.label ?? status);
  return (
    <span className={`mn-chip ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

/* ── Color-coded monogram avatar ── */
const PALETTES = [
  { bg: "#ECFDF3", fg: "#15803D" },
  { bg: "#EFF6FF", fg: "#1d4ed8" },
  { bg: "#FAF5FF", fg: "#7e22ce" },
  { bg: "#FEF3C7", fg: "#b45309" },
  { bg: "#FCE7F3", fg: "#be185d" },
  { bg: "#F0FDFA", fg: "#0f766e" },
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Monogram({ text = "??", size = 44 }: { text?: string; size?: number }) {
  const p = PALETTES[hashStr(text) % PALETTES.length];
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: p.bg,
        color: p.fg,
        fontWeight: 700,
        fontSize: size * 0.36,
        letterSpacing: ".02em",
      }}
    >
      {text}
    </div>
  );
}

/* ── Section header ── */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-[18px] pb-2">
      <div className="text-[13px] font-bold text-[#0F172A] tracking-[-0.01em]">{title}</div>
      {onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-0.5 text-[13px] font-semibold text-[#16A34A]"
        >
          {actionLabel || "Все"}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ── Client row ── */
export function ClientRow({
  client,
  onClick,
}: {
  client: {
    id: number;
    fullName?: string;
    initials?: string;
    status: string;
    amount?: number;
    product?: string;
    updatedAt?: string;
  };
  onClick?: () => void;
}) {
  const initials = client.initials || getInitials(client.fullName);
  return (
    <div
      className="flex items-center gap-3 px-5 py-3 cursor-pointer active:bg-black/[0.04] border-b border-[#F1F5F9] last:border-0"
      onClick={onClick}
    >
      <Monogram text={initials} size={44} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-[#0F172A] truncate">
          {client.fullName || "—"}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#64748B] mt-0.5 overflow-hidden">
          {client.product && (
            <span className="truncate">{client.product}</span>
          )}
          {client.updatedAt && (
            <>
              <span className="w-[3px] h-[3px] bg-[#CBD5E1] rounded-full shrink-0" />
              <span className="shrink-0">{client.updatedAt}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {client.amount != null && client.amount > 0 && (
          <div className="text-[13px] font-bold text-[#0F172A] whitespace-nowrap">
            {fmtShort(client.amount)}
          </div>
        )}
        <StatusChip status={client.status} />
      </div>
    </div>
  );
}

/* ── KPI micro-card ── */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tint = "#16A34A",
  bg = "#ECFDF3",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ size?: number }>;
  tint?: string;
  bg?: string;
}) {
  return (
    <div className="mn-card p-3.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: bg, color: tint }}
        >
          <Icon size={16} />
        </div>
        <span className="text-[11px] font-semibold text-[#64748B] uppercase tracking-[0.06em]">
          {label}
        </span>
      </div>
      <div className="text-[22px] font-bold text-[#0F172A] leading-none">{value}</div>
      {hint && <div className="text-[11px] text-[#64748B]">{hint}</div>}
    </div>
  );
}

/* ── Helpers ── */
export function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

export function getGreeting(): string {
  const hour = (new Date().getUTCHours() + 5) % 24;
  if (hour >= 5 && hour < 12) return "Доброе утро,";
  if (hour >= 12 && hour < 17) return "Добрый день,";
  if (hour >= 17 && hour < 22) return "Добрый вечер,";
  return "Доброй ночи,";
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  return `${days} дн назад`;
}

export function fmtShort(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(".0", "") + " млрд";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " тыс";
  return n.toString();
}

export function fmtMoney(n: number, cur = "UZS"): string {
  return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009") + "\u00A0" + cur;
}
