import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, postOrQueue } from "@/lib/api";
import { Camera, MapPin, Loader2, Check } from "lucide-react";

/* ─────────────────────────────────────────────────────────────
 * Phase C1 — Rapid lead-capture screen.
 * One-screen "quick capture" mode for credit experts in the field.
 * Captures the bare minimum (name, phone, business type, GPS, photo)
 * so a lead is in the system + on file in <30 seconds. Expert can
 * fill the rest in from client-detail later.
 *
 * Note: latitude/longitude are not accepted by POST /mini-app/clients
 * (only by the PUT /:id endpoint), so we do create-then-update for the
 * location. clientType is not on the create schema either, so we omit it;
 * the row defaults to whatever the DB default is.
 *
 * Photo upload is best-effort: if /storage/uploads/direct fails, the
 * client still saves. On success we register the upload via the
 * mini-app documents endpoint so it shows up in client-detail.
 * ──────────────────────────────────────────────────────────── */

const BUSINESS_TYPES = ["shop", "services", "manufacturing", "other"] as const;

export default function QuickLeadPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [businessType, setBusinessType] = useState<string>("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(f);
  };

  const grabLocation = () => {
    if (!navigator.geolocation) {
      alert(t("quickLead.gpsUnsupported", { defaultValue: "GPS не поддерживается" }));
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      (err) => {
        alert(t("quickLead.gpsFailed", { defaultValue: "GPS не получен" }) + ": " + err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      // 1. Create the client via postOrQueue. When offline this falls
      // through to the IndexedDB queue (see lib/offline-queue.ts).
      // GPS + photo follow-ups stay online-only — they need a server-
      // assigned client.id and the photo bytes don't survive being
      // serialized into IndexedDB anyway. If the hunter is offline,
      // the lead row is queued and the photo/coords are silently
      // dropped for this session; bank policy is documented and
      // hunters know to re-shoot the photo from client-detail when
      // back online.
      const result = await postOrQueue<{ id: number }>("/mini-app/clients", {
        fullName: name.trim(),
        phone: phone.trim(),
        leadSource: "direct_visit",
        ...(businessType ? { businessType } : {}),
      });

      if ("_queued" in result) {
        return result;
      }

      const client = result;

      // 2. Persist the location (best-effort; client is already saved).
      if (coords) {
        try {
          await api.put(`/mini-app/clients/${client.id}`, {
            latitude: coords.lat,
            longitude: coords.lng,
          });
        } catch {
          // Non-fatal: the lead is already in the system.
        }
      }

      // 3. Upload the photo and register it as a client document
      // (best-effort: lead survives even if upload fails).
      if (photoDataUrl) {
        try {
          const upload = (await api.post("/storage/uploads/direct", {
            name: `clients/${client.id}/quick-lead.jpg`,
            dataUrl: photoDataUrl,
          })) as { objectPath: string; metadata?: { name?: string } };
          await api.post(`/mini-app/clients/${client.id}/documents`, {
            docType: "quick_lead_photo",
            fileName: upload.metadata?.name ?? `quick-lead-${client.id}.jpg`,
            storagePath: upload.objectPath,
          });
        } catch {
          // Non-fatal.
        }
      }

      return client;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["mini-clients"] });
      qc.invalidateQueries({ queryKey: ["my-day"] });
      qc.invalidateQueries({ queryKey: ["mini-dashboard"] });
      qc.invalidateQueries({ queryKey: ["offline-queue-size"] });
      if (data && "_queued" in data) {
        alert(t("quickLead.savedOffline"));
      }
      navigate("/");
    },
    onError: (err: any) => {
      alert(
        t("quickLead.saveFailed", { defaultValue: "Не удалось сохранить" }) +
          ": " +
          (err?.message ?? String(err)),
      );
    },
  });

  const canSave = name.trim().length >= 2 && phone.trim().length >= 9;

  return (
    <div
      className="min-h-screen pb-32 flex flex-col"
      style={{ background: "var(--tg-bg, #F4F4F5)" }}
    >
      <div className="px-4 pt-3 pb-4">
        <h1 className="text-[22px] font-bold text-[#0F172A]">
          {t("quickLead.title", { defaultValue: "Быстрый лид" })}
        </h1>
        <p className="text-[13px] text-[#64748B] mt-1">
          {t("quickLead.subtitle", { defaultValue: "Минимум для записи. Остальное — потом." })}
        </p>
      </div>

      <div className="mx-4 mn-card p-4 space-y-4">
        {/* Photo */}
        <div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="w-full aspect-[4/3] rounded-xl flex items-center justify-center bg-[#F1F5F9] active:bg-[#E2E8F0] transition-colors overflow-hidden"
          >
            {photoDataUrl ? (
              <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-[#64748B]">
                <Camera className="w-10 h-10 mb-2" />
                <span className="text-[13px] font-medium">
                  {t("quickLead.takePhoto", { defaultValue: "Сделать фото" })}
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="text-[12px] text-[#64748B]">
            {t("quickLead.name", { defaultValue: "Имя" })}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("quickLead.namePlaceholder", { defaultValue: "Aziz Karimov" })}
            className="w-full h-11 rounded-lg bg-white px-3 text-[15px] mt-1 border border-[#E2E8F0] outline-none focus:ring-2 focus:ring-[#FFD531]/40"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="text-[12px] text-[#64748B]">
            {t("quickLead.phone", { defaultValue: "Телефон" })}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-11 rounded-lg bg-white px-3 text-[15px] mt-1 border border-[#E2E8F0] outline-none focus:ring-2 focus:ring-[#FFD531]/40"
          />
        </div>

        {/* Business type — chips */}
        <div>
          <label className="text-[12px] text-[#64748B]">
            {t("quickLead.businessType", { defaultValue: "Тип бизнеса" })}
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            {BUSINESS_TYPES.map((bt) => {
              const active = businessType === bt;
              return (
                <button
                  key={bt}
                  type="button"
                  onClick={() => setBusinessType(bt)}
                  className="px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors"
                  style={{
                    background: active ? "#0F172A" : "#FFFFFF",
                    color: active ? "#FFFFFF" : "#0F172A",
                    border: active ? "none" : "1px solid #E2E8F0",
                  }}
                >
                  {t(`quickLead.business.${bt}`, { defaultValue: bt })}
                </button>
              );
            })}
          </div>
        </div>

        {/* Location */}
        <div>
          <button
            type="button"
            onClick={grabLocation}
            disabled={gpsLoading}
            className="w-full h-11 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center gap-2 text-[14px]"
          >
            {gpsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : coords ? (
              <Check className="w-4 h-4 text-[#272424]" />
            ) : (
              <MapPin className="w-4 h-4 text-[#64748B]" />
            )}
            {coords
              ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
              : t("quickLead.grabLocation", { defaultValue: "Захватить локацию" })}
          </button>
        </div>
      </div>

      {/* Save button (sticky at bottom) */}
      <div
        className="fixed inset-x-0 z-40 px-4"
        style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="w-full h-14 rounded-2xl text-[16px] font-bold text-[#272424] flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: "#FFD531",
              opacity: !canSave || save.isPending ? 0.5 : 1,
              boxShadow: "0 6px 20px rgba(255,213,49,0.45)",
            }}
          >
            {save.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {save.isPending
              ? t("common.saving", { defaultValue: "Сохранение..." })
              : t("quickLead.save", { defaultValue: "Сохранить" })}
          </button>
        </div>
      </div>
    </div>
  );
}
