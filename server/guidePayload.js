import { isSupabaseConfigured } from "./db.js";
import { sanitizeWpList } from "../shared/categoryMap.mjs";
import { SUPPORTED_SCENARIO_LOCALES, isLocalUploadPath } from "../shared/scenarioSchema.mjs";
import { MAX_GUIDE_STEPS, sanitizeGuideSteps, sanitizeGuideTranslations } from "../shared/guideSchema.mjs";

export function parseGuideBody(body) {
  const allowLocalUploads = !isSupabaseConfigured();
  const rawSteps = Array.isArray(body?.steps) ? body.steps : [];
  if (!rawSteps.length) throw new Error("Add at least one step");
  if (rawSteps.length > MAX_GUIDE_STEPS) {
    throw new Error(`At most ${MAX_GUIDE_STEPS} steps are allowed per guide`);
  }
  if (!allowLocalUploads && rawSteps.some((s) => isLocalUploadPath(s?.image_url))) {
    throw new Error(
      "Local /uploads/ image paths do not work in production. Use Upload so the file is stored in Supabase Storage."
    );
  }
  const steps = sanitizeGuideSteps(rawSteps, { allowLocalUploads });
  if (steps.length !== rawSteps.length) throw new Error("Every step needs a photo or some text");

  const translations = sanitizeGuideTranslations(body?.translations);
  const titleLng = SUPPORTED_SCENARIO_LOCALES.find((lng) => (translations[lng]?.title || "").trim());
  if (!titleLng) throw new Error("A title is required in at least one language");

  return {
    title: translations[titleLng].title,
    translations,
    steps,
    wps: sanitizeWpList(body?.wps),
    is_published: body?.is_published !== false && body?.is_published !== "false",
  };
}
