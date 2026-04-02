import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Camera, FileText, Loader2, CheckCircle2,
  RotateCcw, Upload, Eye, Scan, CreditCard, Car, FileCheck,
  Plus, X, ImageIcon
} from "lucide-react";

const DOC_TYPES = [
  { value: "passport", icon: CreditCard, labelKey: "scanDoc.types.passport" },
  { value: "vehicle_doc", icon: Car, labelKey: "scanDoc.types.vehicleDoc" },
  { value: "certificate", icon: FileCheck, labelKey: "scanDoc.types.certificate" },
  { value: "other", icon: FileText, labelKey: "scanDoc.types.other" },
] as const;

type ScanState = "capture" | "processing" | "review" | "uploading" | "done";

interface PhotoItem {
  id: string;
  dataUrl: string;
  ocrText?: string;
  extractedFields?: Record<string, string>;
}

export default function ScanDocumentPage() {
  const { t } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState>("capture");
  const [docType, setDocType] = useState("passport");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [extractedFields, setExtractedFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const newPhoto: PhotoItem = { id: Date.now().toString(), dataUrl };
      setPhotos(prev => [...prev, newPhoto]);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const processAllPhotos = async () => {
    if (photos.length === 0) return;
    setState("processing");
    setError("");

    const updatedPhotos = [...photos];
    let combinedText = "";
    const allFields: Record<string, string> = {};

    for (let i = 0; i < updatedPhotos.length; i++) {
      setProcessingIndex(i);
      try {
        const result = await api.post("/ocr/recognize", { image: updatedPhotos[i].dataUrl });
        const text = result.text || "";
        updatedPhotos[i].ocrText = text;
        const fields = parseExtractedFields(text, docType);
        updatedPhotos[i].extractedFields = fields;
        combinedText += (combinedText ? "\n---\n" : "") + text;
        Object.entries(fields).forEach(([k, v]) => {
          if (v && !allFields[k]) allFields[k] = v;
        });
      } catch (err: any) {
        console.error(`OCR error on photo ${i + 1}:`, err);
        updatedPhotos[i].ocrText = `[Error: ${err.message}]`;
      }
    }

    setPhotos(updatedPhotos);
    setOcrText(combinedText);
    setExtractedFields(allFields);
    setState("review");
  };

  const parseExtractedFields = (text: string, type: string): Record<string, string> => {
    const fields: Record<string, string> = {};

    const namePatterns = [/ФИО[:\s]+(.+)/i, /Ф\.И\.О[:\s]+(.+)/i, /FISH[:\s]+(.+)/i, /ИСМИ[:\s]+(.+)/i, /NAME[:\s]+(.+)/i];
    for (const p of namePatterns) {
      const m = text.match(p);
      if (m) { fields.fullName = m[1].trim(); break; }
    }

    const passportPatterns = [/([A-Z]{2}\d{7})/i, /серия.*?([A-Z]{2}).*?№?\s*(\d{7})/i];
    for (const p of passportPatterns) {
      const m = text.match(p);
      if (m) { fields.passportNumber = m[0].trim(); break; }
    }

    const datePatterns = [/(\d{2}[.\/-]\d{2}[.\/-]\d{4})/g];
    const dates: string[] = [];
    for (const p of datePatterns) {
      let m;
      while ((m = p.exec(text)) !== null) dates.push(m[1]);
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

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        let storagePath = `documents/client-${params.clientId}/${Date.now()}-${i}.jpg`;

        try {
          const blob = await fetch(photo.dataUrl).then(r => r.blob());
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
          console.warn("Object storage upload failed for photo", i, err);
        }

        await api.post(`/mini-app/clients/${params.clientId}/documents`, {
          docType,
          fileName: `scan_${docType}_${Date.now()}_p${i + 1}.jpg`,
          storagePath,
          ocrText: photo.ocrText || "",
          extractedData: photo.extractedFields || {},
        });
      }
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
    setState("capture");
    setPhotos([]);
    setOcrText("");
    setExtractedFields({});
    setProcessingIndex(0);
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

      {state === "capture" && (
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

          {photos.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    {t("scanDoc.photosCount", { count: photos.length })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photo.dataUrl}
                        alt="Scan"
                        className="w-full h-20 object-cover rounded-lg border"
                      />
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-80 hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button
              variant={photos.length > 0 ? "outline" : "default"}
              className="flex-1 gap-2 h-12"
              onClick={handleCapture}
            >
              {photos.length > 0 ? <Plus className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              {photos.length > 0 ? t("scanDoc.addMore") : t("scanDoc.takePhoto")}
            </Button>
            {photos.length > 0 && (
              <Button className="flex-1 gap-2 h-12" onClick={processAllPhotos}>
                <Scan className="w-5 h-5" />
                {t("scanDoc.processAll", { count: photos.length })}
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </>
      )}

      {state === "processing" && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-4 gap-1.5">
              {photos.map((photo, idx) => (
                <div key={photo.id} className="relative">
                  <img
                    src={photo.dataUrl}
                    alt={`Photo ${idx + 1}`}
                    className={`w-full h-14 object-cover rounded-lg border-2 transition-all ${
                      idx === processingIndex
                        ? "border-primary ring-2 ring-primary/30"
                        : idx < processingIndex
                        ? "border-green-500 opacity-70"
                        : "border-border opacity-40"
                    }`}
                  />
                  {idx < processingIndex && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  )}
                  {idx === processingIndex && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
              <p className="text-sm font-medium">
                {t("scanDoc.processingPhoto", { current: processingIndex + 1, total: photos.length })}
              </p>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${((processingIndex + 0.5) / photos.length) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {state === "review" && (
        <>
          <Card>
            <CardContent className="p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((photo, idx) => (
                  <img
                    key={photo.id}
                    src={photo.dataUrl}
                    alt={`Photo ${idx + 1}`}
                    className="h-20 rounded-lg border flex-shrink-0 object-cover"
                  />
                ))}
              </div>
            </CardContent>
          </Card>

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
