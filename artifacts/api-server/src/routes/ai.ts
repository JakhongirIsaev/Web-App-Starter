import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  questionnaireSessionsTable,
  questionnaireAnswersTable,
  clientDocumentsTable,
  extractedDocumentDataTable,
  creditProductsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { chatCompletion, visionExtract } from "../lib/ai-client";
import {
  QUESTIONNAIRE_SYSTEM_PROMPT,
  RECOMMENDATION_FACTS_PROMPT,
  DOCUMENT_EXTRACTION_PROMPT,
  PDF_SUMMARY_PROMPT,
} from "../lib/ai-prompts";

const router: IRouter = Router();

// Dynamic AI questionnaire - get next question
router.post("/ai/questionnaire/next", requireAuth, async (req, res) => {
  try {
    const { clientId, conversationHistory } = req.body;
    if (!clientId) {
      res.status(400).json({ error: "clientId is required" });
      return;
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> =
      conversationHistory || [];

    if (messages.length === 0) {
      messages.push({
        role: "user",
        content: "Начните анкетирование. Задайте первый вопрос.",
      });
    }

    const aiResponse = await chatCompletion(QUESTIONNAIRE_SYSTEM_PROMPT, messages, {
      maxTokens: 512,
      temperature: 0.4,
    });

    let parsed;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { question: aiResponse, type: "input", key: "fallback", done: false };
    } catch {
      parsed = { question: aiResponse, type: "input", key: "fallback", done: false };
    }

    if (parsed.done && parsed.summary) {
      // Save questionnaire session
      const [session] = await db
        .insert(questionnaireSessionsTable)
        .values({ clientId, userId: req.user!.id, status: "completed", completedAt: new Date() })
        .returning();

      // Save individual answers from conversation
      const answersFromHistory = extractAnswersFromHistory(messages);
      for (const a of answersFromHistory) {
        await db.insert(questionnaireAnswersTable).values({
          sessionId: session.id,
          questionKey: a.key,
          answer: a.answer,
        });
      }

      // Update client status and AI-derived fields
      const updates: Record<string, unknown> = {
        status: "questionnaire" as const,
        updatedAt: new Date(),
      };

      if (parsed.summary.gender) {
        updates.gender = parsed.summary.gender;
        updates.genderSource = "ai_questionnaire";
        updates.genderConfidence = parsed.summary.genderConfidence || "0.700";
      }

      if (parsed.summary.badges) {
        updates.badges = parsed.summary.badges;
      }

      await db
        .update(clientsTable)
        .set(updates)
        .where(eq(clientsTable.id, clientId));
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("AI questionnaire error:", err);
    res.status(500).json({ error: "AI service error", details: err.message });
  }
});

// AI recommendation facts
router.post("/ai/recommend-facts", requireAuth, async (req, res) => {
  try {
    const { clientId, answers, recommendedProducts } = req.body;

    const prompt = `Client answers: ${JSON.stringify(answers)}
Recommended products: ${JSON.stringify(recommendedProducts?.map((p: any) => ({ name: p.name, segment: p.segment, purpose: p.purpose })))}`;

    const aiResponse = await chatCompletion(RECOMMENDATION_FACTS_PROMPT, [
      { role: "user", content: prompt },
    ]);

    let parsed;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { clientProfile: aiResponse };
    } catch {
      parsed = { clientProfile: aiResponse };
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("AI recommendation facts error:", err);
    res.status(500).json({ error: "AI service error", details: err.message });
  }
});

// AI document extraction
router.post("/ai/extract-document", requireAuth, async (req, res) => {
  try {
    const { clientId, imageBase64, docType, documentUploadId } = req.body;
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const aiResponse = await visionExtract(DOCUMENT_EXTRACTION_PROMPT, imageBase64);

    let extracted;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      extracted = { rawText: aiResponse };
    }

    // Save extraction result if we have a document upload ID
    if (documentUploadId && clientId) {
      await db.insert(extractedDocumentDataTable).values({
        documentUploadId,
        clientId,
        userId: req.user!.id,
        extractedJson: extracted,
        extractionMethod: "ai_vision",
        extractionStatus: "completed",
        confidence: extracted.genderConfidence?.toString() || null,
        gender: extracted.gender || null,
        genderSource: extracted.gender ? "ai_document" : null,
        genderConfidence: extracted.genderConfidence?.toString() || null,
        suggestedBadges: extracted.suggestedBadges || null,
      });

      // Update client with extracted data
      const clientUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (extracted.gender) {
        clientUpdates.gender = extracted.gender;
        clientUpdates.genderSource = "ai_document";
        clientUpdates.genderConfidence = extracted.genderConfidence?.toString() || "0.800";
      }
      if (extracted.suggestedBadges) {
        // Merge badges
        const [client] = await db
          .select({ badges: clientsTable.badges })
          .from(clientsTable)
          .where(eq(clientsTable.id, clientId))
          .limit(1);

        const existingBadges = (client?.badges as string[]) || [];
        const newBadges = [...new Set([...existingBadges, ...extracted.suggestedBadges])];
        clientUpdates.badges = newBadges;
      }
      if (extracted.inn) {
        clientUpdates.tin = extracted.inn;
      }

      await db
        .update(clientsTable)
        .set(clientUpdates)
        .where(eq(clientsTable.id, clientId));
    }

    res.json(extracted);
  } catch (err: any) {
    console.error("AI document extraction error:", err);
    res.status(500).json({ error: "AI service error", details: err.message });
  }
});

// AI PDF summary
router.post("/ai/pdf-summary", requireAuth, async (req, res) => {
  try {
    const { client, basketItems, calculations } = req.body;

    const prompt = `Client: ${JSON.stringify(client)}
Products in basket: ${JSON.stringify(basketItems)}
Calculations: ${JSON.stringify(calculations)}`;

    const aiResponse = await chatCompletion(PDF_SUMMARY_PROMPT, [
      { role: "user", content: prompt },
    ]);

    let parsed;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { aiSummary: aiResponse };
    } catch {
      parsed = { aiSummary: aiResponse };
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("AI PDF summary error:", err);
    res.status(500).json({ error: "AI service error", details: err.message });
  }
});

function extractAnswersFromHistory(
  messages: Array<{ role: string; content: string }>,
): Array<{ key: string; answer: string }> {
  const answers: Array<{ key: string; answer: string }> = [];
  let lastKey = "";

  for (const msg of messages) {
    if (msg.role === "assistant") {
      try {
        const jsonMatch = msg.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.key) lastKey = parsed.key;
        }
      } catch {
        // ignore parse errors
      }
    } else if (msg.role === "user" && lastKey && msg.content !== "Начните анкетирование. Задайте первый вопрос.") {
      answers.push({ key: lastKey, answer: msg.content });
      lastKey = "";
    }
  }

  return answers;
}

export default router;
