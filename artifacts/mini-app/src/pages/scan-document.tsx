import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildApiUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Camera,
  FileText,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Upload,
  Eye,
  Scan,
  CreditCard,
  Car,
  FileCheck,
  Plus,
  X,
  ImageIcon,
  Download,
} from "lucide-react";

const DOC_TYPES = [
  { value: "passport", icon: CreditCard, labelKey: "scanDoc.types.passport" },
  { value: "vehicle_doc", icon: Car, labelKey: "scanDoc.types.vehicleDoc" },
  { value: "certificate", icon: FileCheck, labelKey: "scanDoc.types.certificate" },
  { value: "other", icon: FileText, labelKey: "scanDoc.types.other" },
] as const;

const MAX_PHOTOS = 8;

type ScanState = "capture" | "processing" | "review" | "uploading" | "done";

interface PhotoItem {
  id: string;
  dataUrl: string;
  ocrText?: string;
  extractedFields?: Record<string, string>;
}

function detectRuOrUzText(text: string): "ru" | "uz" {
  const cyrillicCount = text.match(/[\u0400-\u04FF]/g)?.length ?? 0;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;
  return cyrillicCount > latinCount ? "ru" : "uz";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function optimizeDataUrl(dataUrl: string, maxWidth = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || image.naturalWidth <= maxWidth) {
        resolve(dataUrl);
        return;
      }

      const scale = maxWidth / image.naturalWidth;
      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function fileToPhotoItem(file: File, index: number): Promise<PhotoItem> {
  const dataUrl = await readFileAsDataUrl(file);
  const optimizedDataUrl = await optimizeDataUrl(dataUrl);
  return {
    id: `${Date.now()}-${index}`,
    dataUrl: optimizedDataUrl,
  };
}

export default function ScanDocumentPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState>("capture");
  const [docType, setDocType] = useState("passport");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [extractedFields, setExtractedFields] = useState<Record<string, string>>({});
  const [translatedText, setTranslatedText] = useState("");
  const [translatedLanguage, setTranslatedLanguage] = useState<"ru" | "uz" | null>(null);
  const [error, setError] = useState("");

  const scanMessages = {
    tooManyPhotos:
      i18n.language === "ru"
        ? `Можно добавить не более ${MAX_PHOTOS} фотографий за раз.`
        : `${MAX_PHOTOS} tadan ko'p surat biriktirib bo'lmaydi.`,
    invalidImage:
      i18n.language === "ru"
        ? "Добавляйте только изображения."
        : "Faqat rasm fayllarini yuklang.",
    translateFailed:
      i18n.language === "ru"
        ? "Перевод сейчас не удалось получить. Попробуйте еще раз."
        : "Tarjimani hozir olib bo'lmadi. Qayta urinib ko'ring.",
    extractFailed:
      i18n.language === "ru"
        ? "AI не смог полноценно извлечь данные по авто. OCR результат сохранен."
        : "AI avtomobil ma'lumotlarini to'liq ajrata olmadi. OCR natijasi saqlandi.",
    exportFailed:
      i18n.language === "ru"
        ? "Excel faylini tayyorlab bo'lmadi. Yana urinib ko'ring."
        : "Excel faylini tayyorlab bo'lmadi. Yana urinib ko'ring.",
  };

  const toFieldMap = useCallback((values: Record<string, unknown>) => {
    return Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
        .map(([key, value]) => [key, String(value)]),
    ) as Record<string, string>;
  }, []);

  const translateMutation = useMutation({
    mutationFn: async (targetLanguage: "ru" | "uz") => {
      const sourceLanguage = detectRuOrUzText(ocrText);
      return api.post("/ai/translate", {
        text: ocrText,
        sourceLanguage,
        targetLanguage,
      });
    },
    onMutate: () => {
      setError("");
    },
    onSuccess: (result: any, targetLanguage) => {
      setTranslatedText(result.text || "");
      setTranslatedLanguage(targetLanguage);
    },
    onError: () => {
      setTranslatedText("");
      setTranslatedLanguage(null);
      setError(scanMessages.translateFailed);
    },
  });

  const exportAutoMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.postBlob("/mini-app/exports/auto-excel", {
        clientId: parseInt(params.clientId),
        extractedData: extractedFields,
        ocrText,
        imageCount: photos.length,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `auto_extract_${params.clientId}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: () => {
      setError(scanMessages.exportFailed);
    },
  });

  const appendFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (validFiles.length === 0) {
      setError(scanMessages.invalidImage);
      return;
    }

    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setError(scanMessages.tooManyPhotos);
      return;
    }

    const filesToAdd = validFiles.slice(0, remainingSlots);
    const photoItems = await Promise.all(
      filesToAdd.map((file, index) => fileToPhotoItem(file, index)),
    );

    setPhotos((prev) => [...prev, ...photoItems]);
    setError(validFiles.length > remainingSlots ? scanMessages.tooManyPhotos : "");
  };

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handlePickFromGallery = () => {
    galleryInputRef.current?.click();
  };

  const handleCameraChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await appendFiles(event.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGalleryChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await appendFiles(event.target.files);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  };

  const parseExtractedFields = (text: string, type: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    const normalizedText = text.replace(/\r/g, "");

    const namePatterns = [
      /(?:ФИО|F\.?I\.?O\.?|FISH|Исм(?:и)?|NAME)[:\s]+([^\n]+)/iu,
    ];
    for (const pattern of namePatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        fields.fullName = match[1].trim();
        break;
      }
    }

    const passportPatterns = [
      /\b([A-ZА-Я]{2}\s?\d{7})\b/iu,
      /(?:passport|паспорт|seriya|серия)[:\s#№-]*([A-ZА-Я]{2}\s?\d{7})/iu,
    ];
    for (const pattern of passportPatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        fields.passportNumber = match[1].replace(/\s+/g, "");
        break;
      }
    }

    const dateMatches = normalizedText.match(/\b(\d{2}[./-]\d{2}[./-]\d{4})\b/g);
    if (dateMatches?.length) {
      fields.dateOfBirth = dateMatches[0];
    }

    const phoneMatches = normalizedText.match(/\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g);
    if (phoneMatches?.length) {
      fields.phone = phoneMatches[0].replace(/\s+/g, "");
    }

    const addressPatterns = [
      /(?:адрес|манзил|address)[:\s]+([^\n]+)/iu,
    ];
    for (const pattern of addressPatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        fields.address = match[1].trim();
        break;
      }
    }

    if (type === "vehicle_doc") {
      const vinMatch = normalizedText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
      if (vinMatch) {
        fields.vin = vinMatch[0];
      }

      const platePatterns = [
        /\b(\d{2}[A-Z]\d{3}[A-Z]{2})\b/i,
        /\b([A-Z]{1,2}\s?\d{3,4}\s?[A-Z]{2,3})\b/i,
      ];
      for (const pattern of platePatterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          fields.plateNumber = match[1].trim();
          break;
        }
      }
    }

    const innMatch = normalizedText.match(/\b\d{9}\b/);
    if (innMatch && !fields.passportNumber?.includes(innMatch[0])) {
      fields.inn = innMatch[0];
    }

    return fields;
  };

  const processAllPhotos = async () => {
    if (photos.length === 0) return;

    setState("processing");
    setError("");
    setTranslatedText("");
    setTranslatedLanguage(null);

    const updatedPhotos = [...photos];
    let combinedText = "";
    const allFields: Record<string, string> = {};
    let autoExtractionFailed = false;

    for (let index = 0; index < updatedPhotos.length; index += 1) {
      setProcessingIndex(index);
      try {
        const result = await api.post("/ocr/recognize", { image: updatedPhotos[index].dataUrl });
        const text = result.text || "";
        updatedPhotos[index].ocrText = text;
        const fields = parseExtractedFields(text, docType);
        updatedPhotos[index].extractedFields = fields;
        combinedText += text ? `${combinedText ? "\n---\n" : ""}${text}` : "";
        Object.entries(fields).forEach(([key, value]) => {
          if (value && !allFields[key]) {
            allFields[key] = value;
          }
        });
      } catch (err: any) {
        console.error(`OCR error on photo ${index + 1}:`, err);
        updatedPhotos[index].ocrText = "";
      }
    }

    if (docType === "vehicle_doc") {
      try {
        const autoResult = await api.post("/ai/extract-auto", {
          images: updatedPhotos.map((photo) => photo.dataUrl),
          language: i18n.language === "ru" ? "ru" : "uz",
          extraFields: { docType, imageCount: updatedPhotos.length },
          ocrText: combinedText || undefined,
        });

        const autoFields = toFieldMap({
          make: autoResult.make,
          model: autoResult.model,
          vehicleType: autoResult.vehicleType,
          color: autoResult.color,
          plateText: autoResult.plateText,
          approximateYear: autoResult.approximateYear,
          visibleConditionNotes: autoResult.visibleConditionNotes,
          confidence:
            typeof autoResult.confidence === "number"
              ? `${Math.round(autoResult.confidence * 100)}%`
              : null,
          rawNotes: autoResult.rawNotes,
        });

        Object.assign(allFields, autoFields);
        if (updatedPhotos[0]) {
          updatedPhotos[0].extractedFields = {
            ...(updatedPhotos[0].extractedFields || {}),
            ...autoFields,
          };
        }
      } catch (err) {
        autoExtractionFailed = true;
        console.warn("AI vehicle extraction failed, OCR results will still be used", err);
      }
    }

    setPhotos(updatedPhotos);
    setOcrText(combinedText);
    setExtractedFields(allFields);
    setError(autoExtractionFailed ? scanMessages.extractFailed : "");
    setState("review");
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setState("uploading");

      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        let storagePath = `documents/client-${params.clientId}/${Date.now()}-${index}.jpg`;

        try {
          const blob = await fetch(photo.dataUrl).then((response) => response.blob());
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
          console.warn("Object storage upload failed for photo", index, err);
        }

        await api.post(`/mini-app/clients/${params.clientId}/documents`, {
          docType,
          fileName: `scan_${docType}_${Date.now()}_p${index + 1}.jpg`,
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
    setTranslatedText("");
    setTranslatedLanguage(null);
    setProcessingIndex(0);
    setError("");
  };

  return (
    <div className="space-y-4 pb-4">
      <button
        onClick={() => navigate(`/clients/${params.clientId}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
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
        multiple
        onChange={handleCameraChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleGalleryChange}
        className="hidden"
      />

      {state === "capture" && (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="text-sm font-medium">{t("scanDoc.selectType")}</label>
              <div className="grid grid-cols-2 gap-2">
                {DOC_TYPES.map((docTypeOption) => {
                  const Icon = docTypeOption.icon;
                  return (
                    <button
                      key={docTypeOption.value}
                      onClick={() => setDocType(docTypeOption.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        docType === docTypeOption.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 mb-1 ${
                          docType === docTypeOption.value ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <p className="text-xs font-medium">{t(docTypeOption.labelKey)}</p>
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
                  <span className="text-[11px] text-muted-foreground">
                    {MAX_PHOTOS} max
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
                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center opacity-100 shadow-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2 h-12" onClick={handleCapture}>
              <Camera className="w-5 h-5" />
              {photos.length > 0 ? t("scanDoc.addMore") : t("scanDoc.takePhoto")}
            </Button>
            <Button variant="outline" className="flex-1 gap-2 h-12" onClick={handlePickFromGallery}>
              <ImageIcon className="w-5 h-5" />
              {t("scanDoc.fromGallery")}
            </Button>
          </div>

          {photos.length > 0 && (
            <Button className="w-full gap-2 h-12" onClick={processAllPhotos}>
              <Scan className="w-5 h-5" />
              {t("scanDoc.processAll", { count: photos.length })}
            </Button>
          )}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </>
      )}

      {state === "processing" && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-4 gap-1.5">
              {photos.map((photo, index) => (
                <div key={photo.id} className="relative">
                  <img
                    src={photo.dataUrl}
                    alt={`Photo ${index + 1}`}
                    className={`w-full h-14 object-cover rounded-lg border-2 transition-all ${
                      index === processingIndex
                        ? "border-primary ring-2 ring-primary/30"
                        : index < processingIndex
                          ? "border-green-500 opacity-70"
                          : "border-border opacity-40"
                    }`}
                  />
                  {index < processingIndex && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  )}
                  {index === processingIndex && (
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
                {photos.map((photo, index) => (
                  <img
                    key={photo.id}
                    src={photo.dataUrl}
                    alt={`Photo ${index + 1}`}
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
                {Object.entries(extractedFields).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1 border-b border-border/50 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground">{t(`scanDoc.fields.${key}`, key)}</span>
                    <span className="text-sm font-medium text-right max-w-[60%] truncate">{value}</span>
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
                onChange={(event) => setOcrText(event.target.value)}
                rows={6}
                className="w-full text-xs font-mono bg-muted/50 rounded-lg p-2 border resize-none"
              />
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => translateMutation.mutate("uz")}
                  disabled={!ocrText || translateMutation.isPending}
                >
                  {t("scanDoc.translateToUz")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => translateMutation.mutate("ru")}
                  disabled={!ocrText || translateMutation.isPending}
                >
                  {t("scanDoc.translateToRu")}
                </Button>
              </div>
              {translateMutation.isPending && (
                <p className="mt-2 text-xs text-muted-foreground">{t("scanDoc.translating")}</p>
              )}
              {translatedText && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {translatedLanguage === "ru" ? t("scanDoc.translatedRu") : t("scanDoc.translatedUz")}
                  </p>
                  <textarea
                    value={translatedText}
                    readOnly
                    rows={5}
                    className="w-full text-xs font-mono bg-muted/50 rounded-lg p-2 border resize-none"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex-1 gap-1 min-w-[120px]" onClick={reset}>
              <RotateCcw className="w-4 h-4" />
              {t("scanDoc.retake")}
            </Button>
            {docType === "vehicle_doc" && Object.keys(extractedFields).length > 0 && (
              <Button
                variant="outline"
                className="flex-1 gap-1 min-w-[140px]"
                onClick={() => exportAutoMutation.mutate()}
                disabled={exportAutoMutation.isPending}
              >
                {exportAutoMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {i18n.language === "ru" ? "Excel выгрузка" : "Excel eksport"}
              </Button>
            )}
            <Button className="flex-1 gap-1 min-w-[120px]" onClick={() => uploadMutation.mutate()}>
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
