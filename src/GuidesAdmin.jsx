import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetchWithAuth, uploadImageFile } from "./api.js";
import { useAppData } from "./AppData.jsx";
import Dropdown from "./Dropdown.jsx";
import SortableList from "./SortableList.jsx";
import { GuideViewer } from "./Guides.jsx";
import { PhotoFrame } from "./PhotoGrid.jsx";
import { ChevronDownIcon, ChevronUpIcon, GripIcon, ImageIcon } from "./icons.jsx";
import { useIsNarrow } from "./useIsNarrow.js";
import { styles } from "./styles.js";
import { SUPPORTED_SCENARIO_LOCALES } from "../shared/scenarioSchema.mjs";
import { MAX_GUIDE_STEPS, guideCoverUrl, pickGuideView } from "../shared/guideSchema.mjs";

const LANG_LABELS = { en: "English", de: "Deutsch", sq: "Shqip" };

const orderBtn = {
  width: 34,
  height: 34,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  fontSize: "0.95rem",
  lineHeight: 1,
  flexShrink: 0,
};

const hiddenInput = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function newStepId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function blankTexts() {
  return Object.fromEntries(SUPPORTED_SCENARIO_LOCALES.map((lng) => [lng, ""]));
}

function newStep(imageUrl = "") {
  return { id: newStepId(), image_url: imageUrl, texts: blankTexts() };
}

function splitTags(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildForm(guide) {
  const translations = Object.fromEntries(
    SUPPORTED_SCENARIO_LOCALES.map((lng) => {
      const slot = guide?.translations?.[lng];
      return [lng, { title: slot?.title || "", summary: slot?.summary || "", tags: (slot?.tags || []).join(", ") }];
    })
  );
  const steps = (guide?.steps || []).map((s) => ({
    id: s.id,
    image_url: s.image_url || "",
    texts: Object.fromEntries(
      SUPPORTED_SCENARIO_LOCALES.map((lng) => [lng, s.translations?.[lng]?.text || ""])
    ),
  }));
  return {
    translations,
    wps: guide?.wps || [],
    steps,
    is_published: guide ? guide.is_published !== false : true,
  };
}

function languageHasContent(form, lng) {
  const tr = form.translations[lng];
  return (
    Boolean(tr.title.trim() || tr.summary.trim() || tr.tags.trim()) ||
    form.steps.some((s) => s.texts[lng].trim())
  );
}

function formToPayload(form, enabledLangs) {
  const translations = {};
  for (const lng of enabledLangs) {
    const tr = form.translations[lng];
    const title = tr.title.trim();
    const summary = tr.summary.trim();
    const tags = splitTags(tr.tags);
    if (title || summary || tags.length) translations[lng] = { title, summary, tags };
  }
  const steps = form.steps.map((s) => ({
    id: s.id,
    image_url: s.image_url,
    translations: Object.fromEntries(
      enabledLangs.filter((lng) => s.texts[lng].trim()).map((lng) => [lng, { text: s.texts[lng] }])
    ),
  }));
  return { translations, wps: form.wps, steps, is_published: form.is_published };
}

function StepPhoto({ step, onChange, disabled, narrow, setFormError }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setFormError("");
    try {
      onChange(await uploadImageFile(file));
    } catch (err) {
      setFormError(t("guides.form.uploadFailed", { name: file.name, message: err?.message || "" }));
    } finally {
      setUploading(false);
    }
  };

  const locked = disabled || uploading;
  const smallBtn = { ...styles.ghostBtn, padding: "0.35rem 0.7rem", fontSize: "0.8rem" };

  return (
    <div style={{ width: narrow ? "100%" : 170, flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      {step.image_url ? (
        <PhotoFrame
          url={step.image_url}
          aspect="4 / 3"
          style={{ borderRadius: 8, border: "1px solid #1a2a3a", maxWidth: narrow ? 260 : undefined }}
        />
      ) : (
        <div
          style={{
            aspectRatio: "4 / 3",
            maxWidth: narrow ? 260 : undefined,
            border: "1px dashed #2a3d52",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3d5268",
          }}
        >
          <ImageIcon />
        </div>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        disabled={locked}
        style={hiddenInput}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          await handleFile(file);
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <label
          htmlFor={inputId}
          style={{
            ...smallBtn,
            cursor: locked ? "default" : "pointer",
            opacity: locked ? 0.55 : 1,
            pointerEvents: locked ? "none" : "auto",
          }}
        >
          {uploading ? "…" : step.image_url ? t("guides.form.replacePhoto") : t("guides.form.addPhoto")}
        </label>
        {step.image_url ? (
          <button type="button" style={{ ...smallBtn, color: "#ff6b6b" }} disabled={locked} onClick={() => onChange("")}>
            {t("guides.form.removePhoto")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GuideForm({ initial, onSave, onCancel }) {
  const { t, i18n } = useTranslation();
  const { workPackages } = useAppData();
  const narrow = useIsNarrow();
  const [baseline] = useState(() => buildForm(initial));
  const baselineJson = useMemo(() => JSON.stringify(baseline), [baseline]);
  const [form, setForm] = useState(baseline);
  const uiLanguage = SUPPORTED_SCENARIO_LOCALES.includes((i18n.language || "en").toLowerCase())
    ? (i18n.language || "en").toLowerCase()
    : "en";
  const [enabledLangs, setEnabledLangs] = useState(() => {
    const filled = SUPPORTED_SCENARIO_LOCALES.filter((lng) => languageHasContent(baseline, lng));
    return filled.length ? filled : [uiLanguage];
  });
  const [activeLang, setActiveLang] = useState(() => {
    const filled = SUPPORTED_SCENARIO_LOCALES.find((lng) => languageHasContent(baseline, lng));
    return filled || uiLanguage;
  });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const formErrorRef = useRef(null);
  const stepCountRef = useRef(form.steps.length);
  stepCountRef.current = form.steps.length;
  const fileInputId = useId();
  const locked = busy || uploadProgress != null;
  const wpList = workPackages || [];
  const atStepCap = form.steps.length >= MAX_GUIDE_STEPS;

  const dirty = useMemo(() => JSON.stringify(form) !== baselineJson, [form, baselineJson]);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(t("guides.form.unsavedConfirm"))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (formError) formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [formError]);

  const requestCancel = useCallback(() => {
    if (!dirty || window.confirm(t("guides.form.unsavedConfirm"))) onCancel();
  }, [dirty, onCancel, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showPreview) setShowPreview(false);
      else requestCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestCancel, showPreview]);

  const toggleLang = (lng) => {
    setFormError("");
    if (enabledLangs.includes(lng)) {
      if (enabledLangs.length === 1) {
        setFormError(t("guides.form.needOneLang"));
        return;
      }
      const next = enabledLangs.filter((l) => l !== lng);
      setForm((f) => ({
        ...f,
        translations: { ...f.translations, [lng]: { title: "", summary: "", tags: "" } },
        steps: f.steps.map((s) => ({ ...s, texts: { ...s.texts, [lng]: "" } })),
      }));
      setEnabledLangs(next);
      if (activeLang === lng) setActiveLang(next[0]);
      return;
    }
    setEnabledLangs([...enabledLangs, lng]);
    setActiveLang(lng);
  };

  const patchTranslation = (key, value) => {
    setFormError("");
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [activeLang]: { ...f.translations[activeLang], [key]: value } },
    }));
  };

  const updateStep = (id, patch) => {
    setFormError("");
    setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  };

  const setStepText = (id, value) => {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s) => (s.id === id ? { ...s, texts: { ...s.texts, [activeLang]: value } } : s)),
    }));
  };

  const removeStep = (id) => {
    setConfirmRemoveId(null);
    setFormError("");
    setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.id !== id) }));
  };

  const addTextStep = () => {
    if (atStepCap) {
      setFormError(t("guides.form.maxSteps", { max: MAX_GUIDE_STEPS }));
      return;
    }
    setFormError("");
    setForm((f) => ({ ...f, steps: [...f.steps, newStep("")] }));
  };

  const addPhotoSteps = async (fileList) => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    const slots = MAX_GUIDE_STEPS - stepCountRef.current;
    if (slots <= 0) {
      setFormError(t("guides.form.maxSteps", { max: MAX_GUIDE_STEPS }));
      return;
    }
    const toUpload = files.slice(0, slots);
    setFormError("");
    setUploadProgress({ done: 0, total: toUpload.length });
    const failures = [];
    for (const file of toUpload) {
      try {
        const url = await uploadImageFile(file);
        setForm((f) => ({ ...f, steps: [...f.steps, newStep(url)] }));
      } catch (err) {
        failures.push(t("guides.form.uploadFailed", { name: file.name, message: err?.message || "" }));
      }
      setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setUploadProgress(null);
    if (files.length > slots) failures.push(t("guides.form.maxSteps", { max: MAX_GUIDE_STEPS }));
    if (failures.length) setFormError(failures.join(" — "));
  };

  const handleSave = async () => {
    if (locked) return;
    const payload = formToPayload(form, enabledLangs);
    if (!Object.values(payload.translations).some((tr) => tr.title)) {
      setFormError(t("guides.form.needTitle"));
      return;
    }
    if (payload.steps.length === 0) {
      setFormError(t("guides.form.needStep"));
      return;
    }
    const emptyAt = payload.steps.findIndex(
      (s) => !s.image_url && Object.keys(s.translations).length === 0
    );
    if (emptyAt >= 0) {
      setFormError(t("guides.form.stepNeedsContent", { n: emptyAt + 1 }));
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      await onSave(payload);
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => {
    const payload = formToPayload(form, enabledLangs);
    const guide = { id: 0, title: "", ...payload, wps: payload.wps };
    return { guide, view: pickGuideView(guide, activeLang) };
  }, [form, enabledLangs, activeLang]);

  const activeSlot = form.translations[activeLang];

  return (
    <div style={{ ...styles.formWrap, maxWidth: narrow ? 680 : 980 }}>
      <h2 style={styles.formTitle}>{initial ? t("guides.form.editTitle") : t("guides.form.addTitle")}</h2>

      {formError ? (
        <div ref={formErrorRef} style={styles.formInlineError} role="alert">
          {formError}
        </div>
      ) : null}

      <label style={styles.label}>{t("guides.form.languages")}</label>
      <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>{t("guides.form.languagesHelp")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {SUPPORTED_SCENARIO_LOCALES.map((lng) => (
          <label key={lng} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}>
            <input type="checkbox" checked={enabledLangs.includes(lng)} disabled={locked} onChange={() => toggleLang(lng)} />
            {t("guides.form.include", { lang: LANG_LABELS[lng] })}
          </label>
        ))}
      </div>
      <div style={{ ...styles.tabRow, marginBottom: "0.85rem" }} role="tablist" aria-label={t("guides.form.languages")}>
        {enabledLangs.map((lng) => {
          const filled = languageHasContent(form, lng);
          const isActive = lng === activeLang;
          return (
            <button
              key={lng}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveLang(lng)}
              style={{
                ...styles.tabBtn,
                ...(isActive ? styles.tabBtnActive : {}),
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {LANG_LABELS[lng]}
              <span
                aria-label={filled ? t("guides.form.langFilled") : t("guides.form.langEmpty")}
                style={{ width: 6, height: 6, borderRadius: "50%", background: filled ? "#1abc9c" : "#3a4a5a" }}
              />
            </button>
          );
        })}
      </div>

      <label style={styles.label}>
        {t("guides.form.titleLabel")} ({LANG_LABELS[activeLang]})
      </label>
      <input
        style={styles.input}
        placeholder={t("guides.form.titlePlaceholder")}
        value={activeSlot.title}
        maxLength={160}
        disabled={locked}
        onChange={(e) => patchTranslation("title", e.target.value)}
      />
      <label style={styles.label}>
        {t("guides.form.summary")} ({LANG_LABELS[activeLang]})
      </label>
      <textarea
        style={{ ...styles.input, height: 80 }}
        placeholder={t("guides.form.summaryPlaceholder")}
        value={activeSlot.summary}
        maxLength={600}
        disabled={locked}
        onChange={(e) => patchTranslation("summary", e.target.value)}
      />
      <label style={styles.label}>
        {t("guides.form.tags")} ({LANG_LABELS[activeLang]})
      </label>
      <input
        style={styles.input}
        placeholder={t("guides.form.tagsPlaceholder")}
        value={activeSlot.tags}
        disabled={locked}
        onChange={(e) => patchTranslation("tags", e.target.value)}
      />

      <label style={styles.label}>{t("guides.form.wps")}</label>
      <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>{t("guides.form.wpsHelp")}</p>
      {wpList.length === 0 ? null : (
        <Dropdown
          multiple
          options={wpList.map((wp) => ({ value: wp.label, label: wp.label }))}
          value={form.wps}
          onChange={(next) => {
            setFormError("");
            setForm((f) => ({ ...f, wps: next }));
          }}
          placeholder={t("guides.form.wpsPlaceholder")}
          summary={(selected) =>
            selected.length <= 2
              ? selected.map((o) => o.label).join(", ")
              : t("guides.form.wpsSelected", { count: selected.length })
          }
          searchPlaceholder={t("dropdown.search")}
          emptyText={t("dropdown.noResults")}
          ariaLabel={t("guides.form.wps")}
          disabled={locked}
          style={{ maxWidth: 420 }}
        />
      )}

      <div style={{ marginTop: "1.75rem" }}>
        <label style={{ ...styles.label, marginTop: 0 }}>
          {t("guides.form.stepsTitle")} ({form.steps.length})
        </label>
        <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>{t("guides.form.stepsHelp")}</p>
        <div
          onDragOver={(e) => {
            if (locked || atStepCap || !e.dataTransfer?.types?.includes("Files")) return;
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setDragActive(false);
          }}
          onDrop={async (e) => {
            if (!e.dataTransfer?.files?.length) return;
            e.preventDefault();
            setDragActive(false);
            if (locked || atStepCap) return;
            await addPhotoSteps(e.dataTransfer.files);
          }}
          style={{
            borderRadius: 12,
            border: dragActive ? "2px dashed #4fa3ff" : "2px dashed transparent",
            background: dragActive ? "rgba(79, 163, 255, 0.08)" : "transparent",
            padding: dragActive ? "0.5rem" : 0,
            margin: dragActive ? "-0.5rem" : 0,
            transition: "border-color 120ms ease, background 120ms ease",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", position: "relative" }}>
            <input
              id={fileInputId}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              disabled={locked || atStepCap}
              style={hiddenInput}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                await addPhotoSteps(files);
              }}
            />
            <label
              htmlFor={fileInputId}
              style={{
                ...styles.primaryBtn,
                cursor: locked || atStepCap ? "default" : "pointer",
                opacity: locked || atStepCap ? 0.55 : 1,
                pointerEvents: locked || atStepCap ? "none" : "auto",
              }}
            >
              <ImageIcon />{" "}
              {uploadProgress
                ? t("guides.form.uploading", uploadProgress)
                : t("guides.form.addPhotos")}
            </label>
            <button type="button" style={styles.ghostBtn} disabled={locked || atStepCap} onClick={addTextStep}>
              {t("guides.form.addTextStep")}
            </button>
            <span style={{ color: "#5c7186", fontSize: "0.8rem" }}>{t("guides.form.dropHint")}</span>
          </div>
          <p style={{ color: "#5c7186", fontSize: "0.78rem", margin: "0 0 0.85rem" }}>
            {t("guides.form.uploadHint")} · {form.steps.length} / {MAX_GUIDE_STEPS}
          </p>

          {form.steps.length === 0 ? (
            <div
              style={{
                border: "1px dashed #2a3d52",
                borderRadius: 12,
                padding: "2rem 1rem",
                textAlign: "center",
                color: "#8899aa",
              }}
            >
              {t("guides.form.noSteps")}
            </div>
          ) : (
            <SortableList
              items={form.steps}
              getKey={(s) => s.id}
              gap={12}
              disabled={locked}
              onReorder={(next) => setForm((f) => ({ ...f, steps: next }))}
              renderItem={(step, ctx) => {
                const n = ctx.index + 1;
                return (
                  <section
                    style={{
                      ...styles.situationCard,
                      background: ctx.isDragging ? "#16263a" : styles.situationCard.background,
                      padding: "0.75rem 0.9rem 0.9rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        {...ctx.handleProps}
                        style={{ ...styles.ghostBtn, ...orderBtn, ...ctx.handleStyle, color: "#8899aa" }}
                        aria-label={t("guides.form.dragStep", { n })}
                        title={t("guides.form.dragStep", { n })}
                      >
                        <GripIcon />
                      </button>
                      <button
                        type="button"
                        {...ctx.upProps}
                        style={{ ...styles.ghostBtn, ...orderBtn, opacity: ctx.upProps.disabled ? 0.35 : 1 }}
                        aria-label={t("guides.form.moveUp", { n })}
                        title={t("guides.form.moveUp", { n })}
                      >
                        <ChevronUpIcon />
                      </button>
                      <button
                        type="button"
                        {...ctx.downProps}
                        style={{ ...styles.ghostBtn, ...orderBtn, opacity: ctx.downProps.disabled ? 0.35 : 1 }}
                        aria-label={t("guides.form.moveDown", { n })}
                        title={t("guides.form.moveDown", { n })}
                      >
                        <ChevronDownIcon />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: "0.95rem", paddingLeft: "0.35rem" }}>
                        {t("guides.form.step", { n })}
                      </span>
                      <span style={{ flex: 1 }} />
                      {confirmRemoveId === step.id ? (
                        <>
                          <span style={{ color: "#ff6b6b", fontSize: "0.8rem" }}>{t("guides.form.removeStepConfirm")}</span>
                          <button type="button" style={styles.dangerBtn} onClick={() => removeStep(step.id)}>
                            {t("guides.yesDelete")}
                          </button>
                          <button type="button" style={styles.cancelBtn} onClick={() => setConfirmRemoveId(null)}>
                            {t("guides.cancel")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          style={styles.dangerBtn}
                          disabled={locked}
                          onClick={() => setConfirmRemoveId(step.id)}
                        >
                          {t("guides.form.removeStep")}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "1rem", flexDirection: narrow ? "column" : "row", alignItems: "flex-start" }}>
                      <StepPhoto
                        step={step}
                        narrow={narrow}
                        disabled={locked}
                        setFormError={setFormError}
                        onChange={(url) => updateStep(step.id, { image_url: url })}
                      />
                      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
                        <label style={{ ...styles.label, marginTop: 0 }}>
                          {t("guides.form.caption", { lang: LANG_LABELS[activeLang] })}
                        </label>
                        <textarea
                          style={{ ...styles.input, height: 110 }}
                          placeholder={t("guides.form.captionPlaceholder")}
                          value={step.texts[activeLang]}
                          maxLength={2000}
                          disabled={locked}
                          onChange={(e) => setStepText(step.id, e.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                );
              }}
            />
          )}
        </div>
      </div>

      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={form.is_published}
          disabled={locked}
          onChange={(e) => {
            setFormError("");
            setForm((f) => ({ ...f, is_published: e.target.checked }));
          }}
        />
        {t("guides.form.published")}
      </label>

      <div style={styles.formActions}>
        <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={locked}>
          {busy ? t("guides.form.saving") : initial ? t("guides.form.save") : t("guides.form.saveNew")}
        </button>
        <button
          type="button"
          style={styles.ghostBtn}
          onClick={() => setShowPreview(true)}
          disabled={locked || !preview.view}
        >
          {t("scenarioForm.preview")}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={requestCancel} disabled={locked}>
          {t("guides.form.cancel")}
        </button>
      </div>

      {showPreview && preview.view ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("scenarioForm.previewTitle")}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(4, 8, 14, 0.85)",
            display: "flex",
            justifyContent: "center",
            overflowY: "auto",
            padding: "2rem 1rem",
          }}
          onClick={() => setShowPreview(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d1520",
              border: "1px solid #1a2a3a",
              borderRadius: 12,
              padding: "1.5rem",
              width: "100%",
              maxWidth: 1180,
              height: "fit-content",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span style={{ color: "#8899aa", fontSize: "0.85rem" }}>{t("scenarioForm.previewNote")}</span>
              <button type="button" style={styles.ghostBtn} onClick={() => setShowPreview(false)}>
                {t("scenarioForm.closePreview")}
              </button>
            </div>
            <GuideViewer guide={preview.guide} view={preview.view} onBack={() => setShowPreview(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function GuidesAdmin({ startWithNew = false, onBack, onAuthFailure }) {
  const { t, i18n } = useTranslation();
  const { guides, setGuides, loadGuidesFromServer, guidesLoadError, adminSession, notify } = useAppData();
  const [mode, setMode] = useState(startWithNew ? "form" : "list");
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);
  const reorderSeq = useRef(0);
  const uiLng = (i18n.language || "en").slice(0, 2);

  useEffect(() => {
    loadGuidesFromServer();
  }, [loadGuidesFromServer]);

  const list = guides || [];
  const titleOf = (guide) => pickGuideView(guide, uiLng)?.title || guide.title || t("guides.untitled");

  const openForm = (guide = null) => {
    setEditing(guide);
    setMode("form");
  };

  const backToList = () => {
    setEditing(null);
    setMode("list");
  };

  const saveGuide = async (payload) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return;
    }
    try {
      const res = await apiFetchWithAuth(editing ? `/api/guides/${editing.id}` : "/api/guides", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (onAuthFailure(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.saveFailed"), "error");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.guide) {
        setGuides((prev) =>
          editing
            ? (prev || []).map((g) => (g.id === data.guide.id ? data.guide : g))
            : [...(prev || []), data.guide]
        );
      } else {
        await loadGuidesFromServer();
      }
      notify(editing ? t("toast.saved") : t("toast.added"));
      backToList();
    } catch {
      notify(t("toast.unreachable"), "error");
    }
  };

  const deleteGuide = async (id) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetchWithAuth(`/api/guides/${id}`, { method: "DELETE" });
      if (onAuthFailure(res)) return;
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.deleteFailed"), "error");
        return;
      }
      setGuides((prev) => (prev || []).filter((g) => g.id !== id));
      setDeleteId(null);
      notify(t("toast.deleted"));
    } catch {
      notify(t("toast.unreachable"), "error");
    } finally {
      setBusy(false);
    }
  };

  const reorderGuides = async (next) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return;
    }
    const seq = ++reorderSeq.current;
    setGuides(next);
    try {
      const res = await apiFetchWithAuth("/api/guides/order", {
        method: "PUT",
        body: JSON.stringify({ order: next.map((g) => g.id) }),
      });
      if (onAuthFailure(res)) return;
      if (!res.ok) {
        notify(t("guides.orderFailed"), "error");
        await loadGuidesFromServer();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (seq === reorderSeq.current && Array.isArray(data?.guides)) setGuides(data.guides);
      notify(t("guides.orderSaved"));
    } catch {
      notify(t("toast.unreachable"), "error");
      await loadGuidesFromServer();
    }
  };

  if (mode === "form") {
    return <GuideForm key={editing ? `edit-${editing.id}` : "new"} initial={editing} onSave={saveGuide} onCancel={backToList} />;
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <button type="button" style={styles.detailBack} onClick={onBack}>
        {t("guides.back")}
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <h2 style={{ ...styles.formTitle, margin: 0 }}>{t("guides.title")}</h2>
        <button type="button" style={styles.primaryBtn} onClick={() => openForm(null)}>
          {t("guides.add")}
        </button>
      </div>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.25rem", fontSize: "0.9rem" }}>{t("guides.help")}</p>

      {guides === null ? (
        <div style={styles.empty}>{t("guides.loading")}</div>
      ) : guidesLoadError ? (
        <div style={styles.formInlineError} role="alert">
          {t("guides.loadFailed")}
        </div>
      ) : list.length === 0 ? (
        <div style={styles.empty}>
          <div>{t("guides.empty")}</div>
          <button type="button" style={{ ...styles.primaryBtn, marginTop: "0.75rem" }} onClick={() => openForm(null)}>
            {t("guides.emptyCta")}
          </button>
        </div>
      ) : (
        <>
          <p style={{ color: "#8899aa", margin: "0 0 0.85rem", fontSize: "0.85rem" }}>{t("guides.orderHelp")}</p>
          <div style={styles.adminTableWrap}>
            <div style={styles.adminTable}>
              <SortableList
                items={list}
                getKey={(g) => g.id}
                disabled={busy}
                onReorder={reorderGuides}
                renderItem={(guide, ctx) => {
                  const title = titleOf(guide);
                  const cover = guideCoverUrl(guide);
                  return (
                    <div style={{ ...styles.tableRow, background: ctx.isDragging ? "#16263a" : "#111e2c", flexWrap: "wrap" }}>
                      {deleteId === guide.id ? (
                        <div style={styles.deleteConfirm}>
                          <span>{t("guides.deleteConfirm", { title })}</span>
                          <button type="button" style={styles.dangerBtn} disabled={busy} onClick={() => deleteGuide(guide.id)}>
                            {t("guides.yesDelete")}
                          </button>
                          <button type="button" style={styles.cancelBtn} disabled={busy} onClick={() => setDeleteId(null)}>
                            {t("guides.cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ width: 24, color: "#5c7186", fontWeight: 700, fontSize: "0.85rem", textAlign: "right", flexShrink: 0 }}>
                            {ctx.index + 1}
                          </span>
                          <button
                            type="button"
                            {...ctx.handleProps}
                            style={{ ...styles.ghostBtn, ...orderBtn, ...ctx.handleStyle, color: "#8899aa" }}
                            aria-label={t("guides.dragHandle", { title })}
                            title={t("guides.dragHandle", { title })}
                          >
                            <GripIcon />
                          </button>
                          <button
                            type="button"
                            {...ctx.upProps}
                            style={{ ...styles.ghostBtn, ...orderBtn, opacity: ctx.upProps.disabled ? 0.35 : 1 }}
                            aria-label={t("guides.moveUp", { title })}
                            title={t("guides.moveUp", { title })}
                          >
                            <ChevronUpIcon />
                          </button>
                          <button
                            type="button"
                            {...ctx.downProps}
                            style={{ ...styles.ghostBtn, ...orderBtn, opacity: ctx.downProps.disabled ? 0.35 : 1 }}
                            aria-label={t("guides.moveDown", { title })}
                            title={t("guides.moveDown", { title })}
                          >
                            <ChevronDownIcon />
                          </button>
                          <div style={{ width: 56, flexShrink: 0 }}>
                            {cover ? (
                              <PhotoFrame url={cover} aspect="4 / 3" style={{ borderRadius: 6 }} />
                            ) : (
                              <div style={{ aspectRatio: "4 / 3", borderRadius: 6, background: "#0b131d" }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600, color: "#eaf0fb", overflowWrap: "anywhere" }}>{title}</div>
                            <div style={{ color: "#8899aa", fontSize: "0.8rem" }}>
                              {(guide.wps || []).join(", ") || "—"} · {t("guides.stepsCount", { count: guide.steps.length })}
                            </div>
                          </div>
                          <span
                            style={{
                              width: 64,
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: guide.is_published === false ? "#e67e22" : "#1abc9c",
                            }}
                          >
                            {guide.is_published === false ? t("admin.draft") : t("admin.live")}
                          </span>
                          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                            <button type="button" style={styles.editBtn} onClick={() => openForm(guide)}>
                              {t("admin.edit")}
                            </button>
                            <button type="button" style={styles.dangerBtn} onClick={() => setDeleteId(guide.id)}>
                              {t("admin.delete")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
