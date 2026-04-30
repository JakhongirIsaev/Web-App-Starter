import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Local copies of non-exported pure helpers from src/routes/storage.ts.
// resolveOcrLanguage and ocrErrorMessages are module-private, so we
// replicate the logic here for testing (same approach as ai-fallback.test.ts).
// ---------------------------------------------------------------------------

interface MinimalRequest {
  query: Record<string, string | undefined>;
  body?: { language?: string };
  headers: Record<string, string | undefined>;
}

function resolveOcrLanguage(req: MinimalRequest): "ru" | "uz" {
  const query = req.query as { language?: string };
  if (query.language === "ru") return "ru";
  const body = req.body as { language?: string } | undefined;
  if (body?.language === "ru") return "ru";
  const acceptLang = req.headers["accept-language"] || "";
  if (/^ru\b/i.test(acceptLang)) return "ru";
  return "uz";
}

const ocrErrorMessages = {
  missingImage:     { ru: "Данные изображения не указаны",                uz: "Rasm ma'lumoti ko'rsatilmagan" },
  uploadSaveFailed: { ru: "Не удалось сохранить загруженное изображение", uz: "Yuklangan rasmni saqlab bo'lmadi" },
  healthTimeout:    { ru: "Сервис распознавания не отвечает",             uz: "Matnni tanish xizmati javob bermadi" },
  healthFailed:     { ru: "Сервис распознавания не работает",             uz: "Matnni tanish xizmati ishlamadi" },
  healthParse:      { ru: "Не удалось прочитать результат проверки",      uz: "Matnni tanish tekshiruvi natijasini o'qib bo'lmadi" },
  ocrTimeout:       { ru: "Время распознавания истекло",                  uz: "Matnni tanish uchun vaqt tugadi" },
  ocrProcess:       { ru: "Процесс распознавания завершился с ошибкой",   uz: "Matnni tanish jarayoni xato bilan tugadi" },
  ocrParse:         { ru: "Не удалось прочитать результат распознавания",  uz: "Matnni tanish natijasini o'qib bo'lmadi" },
  ocrGeneric:       { ru: "Не удалось распознать текст документа",        uz: "Hujjat matnini tanib bo'lmadi" },
} as const;

function makeRequest(overrides: {
  queryLanguage?: string;
  bodyLanguage?: string;
  acceptLanguage?: string;
}): MinimalRequest {
  return {
    query: overrides.queryLanguage !== undefined
      ? { language: overrides.queryLanguage }
      : {},
    body: overrides.bodyLanguage !== undefined
      ? { language: overrides.bodyLanguage }
      : undefined,
    headers: overrides.acceptLanguage !== undefined
      ? { "accept-language": overrides.acceptLanguage }
      : {},
  };
}

// ---------------------------------------------------------------------------
// resolveOcrLanguage
// ---------------------------------------------------------------------------

describe("resolveOcrLanguage", () => {
  it("returns ru when query param language is ru", () => {
    expect(resolveOcrLanguage(makeRequest({ queryLanguage: "ru" }))).toBe("ru");
  });

  it("returns uz when query param language is uz", () => {
    expect(resolveOcrLanguage(makeRequest({ queryLanguage: "uz" }))).toBe("uz");
  });

  it("returns uz when query param language is an unrecognized value", () => {
    expect(resolveOcrLanguage(makeRequest({ queryLanguage: "en" }))).toBe("uz");
  });

  it("falls back to body language when query is not ru", () => {
    expect(
      resolveOcrLanguage(makeRequest({ queryLanguage: "uz", bodyLanguage: "ru" })),
    ).toBe("ru");
  });

  it("returns ru from body when query has no language", () => {
    expect(resolveOcrLanguage(makeRequest({ bodyLanguage: "ru" }))).toBe("ru");
  });

  it("falls back to Accept-Language header when query and body are not ru", () => {
    expect(
      resolveOcrLanguage(makeRequest({ acceptLanguage: "ru-RU,ru;q=0.9" })),
    ).toBe("ru");
  });

  it("detects ru from Accept-Language header starting with ru", () => {
    expect(resolveOcrLanguage(makeRequest({ acceptLanguage: "ru" }))).toBe("ru");
    expect(resolveOcrLanguage(makeRequest({ acceptLanguage: "RU" }))).toBe("ru");
    expect(resolveOcrLanguage(makeRequest({ acceptLanguage: "ru-RU" }))).toBe("ru");
  });

  it("returns uz when Accept-Language does not start with ru", () => {
    expect(resolveOcrLanguage(makeRequest({ acceptLanguage: "en-US" }))).toBe("uz");
    expect(resolveOcrLanguage(makeRequest({ acceptLanguage: "uz" }))).toBe("uz");
  });

  it("defaults to uz when no language information is provided", () => {
    expect(resolveOcrLanguage(makeRequest({}))).toBe("uz");
  });

  it("prioritizes query param over body and header", () => {
    expect(
      resolveOcrLanguage(
        makeRequest({
          queryLanguage: "ru",
          bodyLanguage: "uz",
          acceptLanguage: "en-US",
        }),
      ),
    ).toBe("ru");
  });

  it("prioritizes body over header", () => {
    expect(
      resolveOcrLanguage(
        makeRequest({
          bodyLanguage: "ru",
          acceptLanguage: "en-US",
        }),
      ),
    ).toBe("ru");
  });
});

// ---------------------------------------------------------------------------
// ocrErrorMessages — completeness checks
// ---------------------------------------------------------------------------

describe("ocrErrorMessages", () => {
  const expectedKeys: Array<keyof typeof ocrErrorMessages> = [
    "missingImage",
    "uploadSaveFailed",
    "healthTimeout",
    "healthFailed",
    "healthParse",
    "ocrTimeout",
    "ocrProcess",
    "ocrParse",
    "ocrGeneric",
  ];

  it("contains all expected error keys", () => {
    for (const key of expectedKeys) {
      expect(ocrErrorMessages).toHaveProperty(key);
    }
  });

  it("has both ru and uz text for every key", () => {
    for (const key of expectedKeys) {
      const entry = ocrErrorMessages[key];
      expect(typeof entry.ru).toBe("string");
      expect(typeof entry.uz).toBe("string");
      expect(entry.ru.length).toBeGreaterThan(0);
      expect(entry.uz.length).toBeGreaterThan(0);
    }
  });

  it("has distinct Russian and Uzbek messages for each key", () => {
    for (const key of expectedKeys) {
      const entry = ocrErrorMessages[key];
      expect(entry.ru).not.toBe(entry.uz);
    }
  });

  it("has 9 error message entries total", () => {
    expect(Object.keys(ocrErrorMessages)).toHaveLength(9);
  });
});
