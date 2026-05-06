import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

/* ─────────────────────────────────────────────────────────────
 * Phase D3 — Signature pad.
 * Touch-/mouse-/stylus-friendly canvas (PointerEvents handle all
 * three uniformly). Emits a PNG data URL to the parent each time
 * a stroke ends; null when cleared. The parent is responsible for
 * uploading via /storage/uploads/direct and registering a
 * client_documents row with docType="consent_signature".
 * ──────────────────────────────────────────────────────────── */

interface SignaturePadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export function SignaturePad({ value, onChange, height = 180 }: SignaturePadProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  // Set up canvas pixel-density on mount. Runs once — restoring
  // a previously-captured signature happens here too because we only
  // ever construct the pad with an existing value or with null.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0F172A";

    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
      setIsEmpty(false);
    }
    // Intentionally empty deps: setup happens once. The pad is the
    // source of truth after mount; parent reads via onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    // Capture the pointer so a finger that drifts off-canvas still
    // produces continuous "move" events until release.
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }, [isDrawing, onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    // clearRect uses raw pixel dimensions; the DPR scale applied to
    // the context still gives us the right region because the matrix
    // pre-multiplies the coords.
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-[#64748B]">
          {t("signature.hint", { defaultValue: "Подпишитесь пальцем" })}
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#64748B] transition-colors active:opacity-70 disabled:opacity-40"
          style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("signature.clear", { defaultValue: "Очистить" })}
        </button>
      </div>
      <div
        className="rounded-xl border border-[#E2E8F0] overflow-hidden bg-white relative"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px] text-[#94A3B8]">
            {t("signature.placeholder", { defaultValue: "Распишитесь здесь" })}
          </div>
        )}
      </div>
    </div>
  );
}
