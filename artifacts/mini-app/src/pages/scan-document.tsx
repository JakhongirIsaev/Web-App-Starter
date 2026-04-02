import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Camera, FileText, Loader2, CheckCircle2,
  RotateCcw, Upload, Eye, Scan, CreditCard, Car, FileCheck
} from "lucide-react";

const DOC_TYPES = [
  { value: "passport", icon: CreditCard, labelKey: "scanDoc.types.passport" },
  { value: "vehicle_doc", icon: Car, labelKey: "scanDoc.types.vehicleDoc" },
  { value: "certificate", icon: FileCheck, labelKey: "scanDoc.types.certificate" },
  { value: "other", icon: FileText, labelKey: "scanDoc.types.other" },
] as const;

type OcrState = "idle" | "capturing" | "processing" | "review" | "uploading" | "done";

export default function ScanDocumentPage() {
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<OcrState>("idle");
  const [docType, setDocType] = useState("passport");
  const [imageData, setImageData] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [extractedFields, setExtractedFields] = useState<Record<string, string>>({});
  const [ocrProgress, setOcrProgress] = useState(0);
  const [error, setError] = useState("");

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("capturing");
    setError("");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageData(dataUrl);
      setState("processing");
      await runOcr(dataUrl);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runOcr = async (dataUrl: string) => {
    try {
      setOcrProgress(0);

      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("rus+uzb_cyrl+eng", 1, {
        logger: (m: any) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data } = await worker.recognize(dataUrl);
      await worker.terminate();

      setOcrText(data.text);
      const fields = parseExtractedFields(data.text, docType);
      setExtractedFields(fields);
      setState("review");
    } catch (err: any) {
      console.error("OCR error:", err);
      setError(err.message || "OCR failed");
      setState("idle");
    }
  };

  const parseExtractedFields = (text: string, type: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    const fullText = text.toUpperCase();

    const namePatterns = [/ФИО[:\s]+(.+)/i, /Ф\.И\.О[:\s]+(.+)/i, /FISH[:\s]+(.+)/i, /ИСМИ[:\s]+(.+)/i, /NAME[:\s]+(.+)/i];
    for (const p of namePatterns) {
      const m = text.match(p);
      if (m) { fields.fullName = m[1].trim(); break; }
    }

    const passportPatterns = [/([A-Z]{2}\d{7})/i, /серия.*?([A-Z]{2}).*?№?\s*(\d{7})/i];
    for (const p of passportPatterns) {
      const m = text.match(p);
      if (m) {
        fields.passportNumber = m[0].trim();
        break;
      }
    }

    const datePatterns = [/(\d{2}[.\/-]\d{2}[.\/-]\d{4})/g];
    const dates: string[] = [];
    for (const p of datePatterns) {
      let m;
      while ((m = p.exec(text)) !== null) {
        dates.push(m[1]);
      }
    }
    if (dates.length > 0) fields.dateOfBirth = dates[0];

    const phonePatterns = [/\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, /\+?\d{3}[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g];
    for (const p of phonePatterns) {
      const m = text.match(p);
      if (m) { fields.phone = m[0].replace(/\s/g, ""); break; }
    }

    const addressPatterns = [/адрес[:\s]+(.+)/i, /манзил[:\s]+(.+)/i, /address[:\s]+(.+)/i];
    for (const p of addressPatterns) {
      const m = text.match(p);
      if (m) { fields.address = m[1].trim(); break; }
    }

    if (type === "vehicle_doc") {
      const vinPattern = /[A-HJ-NPR-Z0-9]{17}/;
      const vinMatch = text.match(vinPattern);
      if (vinMatch) fields.vin = vinMatch[0];

      const platePatterns = [/(\d{2}[A-Z]\d{3}[A-Z]{2})/i, /([A-Z]{1,2}\s?\d{3,4}\s?[A-Z]{2,3})/i];
      for (const p of platePatterns) {
        const m = text.match(p);
        if (m) { fields.plateNumber = m[0].trim(); break; }
      }
    }

    const innPattern = /\b\d{9}\b/;
    const innMatch = text.match(innPattern);
    if (innMatch && !fields.passportNumber?.includes(innMatch[0])) {
      fields.inn = innMatch[0];
    }

    return fields;
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setState("uploading");

      let storagePath = `documents/client-${params.clientId}/${Date.now()}.jpg`;

      try {
        const blob = await fetch(imageData!).then(r => r.blob());
        const uploadMeta = await api.post("/storage/uploads/request-url", {
          name: storagePath,
          size: blob.size,
          contentType: "image/jpeg",
        });
        await fetch(uploadMeta.uploadURL, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": "image/jpeg" },
        });
        storagePath = uploadMeta.objectPath;
      } catch (err) {
        console.warn("Object storage upload failed, saving path reference only:", err);
      }

      const doc = await api.post(`/mini-app/clients/${params.clientId}/documents`, {
        docType,
        fileName: `scan_${docType}_${Date.now()}.jpg`,
        storagePath,
        ocrText,
        extractedData: extractedFields,
      });

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mini-client", params.clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-documents", params.clientId] });
      setState("done");
    },
    onError: (err: any) => {
      setError(err.message);
      setState("review");
    },
  });

  const reset = () => {
    setState("idle");
    setImageData(null);
    setOcrText("");
    setExtractedFields({});
    setOcrProgress(0);
    setError("");
  };

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate(`/clients/${params.clientId}`)} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </button>

      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Scan className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t("scanDoc.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("scanDoc.subtitle")}</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {state === "idle" && (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="text-sm font-medium">{t("scanDoc.selectType")}</label>
              <div className="grid grid-cols-2 gap-2">
                {DOC_TYPES.map(dt => {
                  const Icon = dt.icon;
                  return (
                    <button
                      key={dt.value}
                      onClick={() => setDocType(dt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        docType === dt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-1 ${docType === dt.value ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="text-xs font-medium">{t(dt.labelKey)}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Button className="w-full gap-2 h-12" onClick={handleCapture}>
            <Camera className="w-5 h-5" />
            {t("scanDoc.takePhoto")}
          </Button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </>
      )}

      {(state === "capturing" || state === "processing") && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            {imageData && (
              <img src={imageData} alt="Captured" className="w-full rounded-lg border max-h-48 object-contain" />
            )}
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium">{t("scanDoc.processing")}</p>
              {state === "processing" && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {ocrProgress > 0 ? `${ocrProgress}%` : t("scanDoc.preparingOcr")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {state === "review" && (
        <>
          {imageData && (
            <Card>
              <CardContent className="p-3">
                <img src={imageData} alt="Scanned" className="w-full rounded-lg max-h-40 object-contain" />
              </CardContent>
            </Card>
          )}

          {Object.keys(extractedFields).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  {t("scanDoc.extractedFields")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {Object.entries(extractedFields).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">{t(`scanDoc.fields.${key}`, key)}</span>
                    <span className="text-sm font-medium text-right max-w-[60%] truncate">{val}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                {t("scanDoc.rawText")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <textarea
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                rows={6}
                className="w-full text-xs font-mono bg-muted/50 rounded-lg p-2 border resize-none"
              />
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-1" onClick={reset}>
              <RotateCcw className="w-4 h-4" />
              {t("scanDoc.retake")}
            </Button>
            <Button className="flex-1 gap-1" onClick={() => uploadMutation.mutate()}>
              <Upload className="w-4 h-4" />
              {t("scanDoc.save")}
            </Button>
          </div>
        </>
      )}

      {state === "uploading" && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm font-medium">{t("scanDoc.uploading")}</p>
          </CardContent>
        </Card>
      )}

      {state === "done" && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <div>
              <p className="text-sm font-bold">{t("scanDoc.saved")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("scanDoc.savedHint")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                {t("scanDoc.scanAnother")}
              </Button>
              <Button className="flex-1" onClick={() => navigate(`/clients/${params.clientId}`)}>
                {t("scanDoc.backToClient")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
