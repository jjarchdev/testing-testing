import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { uploadImageFile } from "./api.js";
import { useAppData } from "./AppData.jsx";
import { ScenarioDetail } from "./EmployeeView.jsx";
import { useIsNarrow } from "./useIsNarrow.js";
import Dropdown from "./Dropdown.jsx";
import { styles } from "./styles.js";
import {
  MAX_SCENARIO_IMAGES,
  SUPPORTED_SCENARIO_LOCALES,
  VERDICT_CODES,
  isScenarioV2Id,
  scenarioToEditable,
} from "../shared/scenarioSchema.mjs";

const LANG_LABELS = { en: "English", de: "Deutsch", sq: "Shqip" };
const BLANK_TEXT = { scenario: "", solution: "", acceptance: "" };

function newSituationId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function blankSituation() {
  return {
    id: newSituationId(),
    verdict: "",
    texts: Object.fromEntries(SUPPORTED_SCENARIO_LOCALES.map((lng) => [lng, { ...BLANK_TEXT }])),
    image_urls: [],
    image_captions: {},
    solution_as_checklist: false,
    acceptance_as_checklist: false,
  };
}

function buildForm(initial) {
  const editable = initial
    ? scenarioToEditable(initial)
    : { translations: {}, wps: [], situations: [] };
  const translations = {};
  for (const lng of SUPPORTED_SCENARIO_LOCALES) {
    const slot = editable.translations[lng];
    translations[lng] = { title: slot?.title || "", tags: (slot?.tags || []).join(", ") };
  }
  const situations = editable.situations.map((s) => ({
    id: s.id,
    verdict: s.verdict || "",
    texts: Object.fromEntries(
      SUPPORTED_SCENARIO_LOCALES.map((lng) => [lng, { ...BLANK_TEXT, ...(s.translations?.[lng] || {}) }])
    ),
    image_urls: s.image_urls || [],
    image_captions: s.image_captions || {},
    solution_as_checklist: s.solution_as_checklist === true,
    acceptance_as_checklist: s.acceptance_as_checklist === true,
  }));
  return {
    wps: editable.wps,
    translations,
    situations: situations.length ? situations : [blankSituation()],
    confluence_page_id: initial?.confluence_page_id || "",
    confluence_page_url: initial?.confluence_page_url || "",
    confluence_page_title: initial?.confluence_page_title || "",
    is_published: initial?.is_published !== false,
  };
}

function isComplete(texts) {
  return Boolean(texts && texts.scenario.trim() && texts.solution.trim());
}

function hasAnyText(texts) {
  return Boolean(texts && (texts.scenario.trim() || texts.solution.trim() || texts.acceptance.trim()));
}

function splitTags(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function languageHasContent(form, lng) {
  return (
    Boolean(form.translations[lng].title.trim() || form.translations[lng].tags.trim()) ||
    form.situations.some((s) => hasAnyText(s.texts[lng]))
  );
}

function languageIsComplete(form, lng) {
  return (
    form.translations[lng].title.trim() !== "" &&
    form.situations.length > 0 &&
    form.situations.every((s) => isComplete(s.texts[lng]))
  );
}

function languageHasCompleteSituation(form, lng) {
  return (
    form.translations[lng].title.trim() !== "" &&
    form.situations.some((s) => isComplete(s.texts[lng]))
  );
}

function formToPayload(form, enabledLangs, primaryLanguage, replacesLegacyId) {
  const translations = {};
  for (const lng of enabledLangs) {
    const title = form.translations[lng].title.trim();
    const tags = splitTags(form.translations[lng].tags);
    if (title || tags.length) translations[lng] = { title, tags };
  }
  const situations = form.situations.map((s) => {
    const situationTranslations = {};
    for (const lng of enabledLangs) {
      if (hasAnyText(s.texts[lng])) situationTranslations[lng] = { ...s.texts[lng] };
    }
    return {
      id: s.id,
      verdict: s.verdict,
      translations: situationTranslations,
      image_urls: s.image_urls,
      image_captions: s.image_captions,
      solution_as_checklist: s.solution_as_checklist,
      acceptance_as_checklist: s.acceptance_as_checklist,
    };
  });
  return {
    translations,
    primary_language: primaryLanguage,
    wps: form.wps,
    situations,
    confluence_page_id: form.confluence_page_id,
    confluence_page_url: form.confluence_page_url,
    confluence_page_title: form.confluence_page_title,
    is_published: form.is_published,
    ...(replacesLegacyId ? { replaces_legacy_id: replacesLegacyId } : {}),
  };
}

function TextFormatToolbar({ onBold, onItalic, onList, t }) {
  return (
    <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem" }}>
      <button
        type="button"
        style={{ ...styles.ghostBtn, padding: "0.25rem 0.65rem", fontWeight: 700 }}
        onClick={onBold}
        title={t("scenarioForm.formatBold")}
        aria-label={t("scenarioForm.formatBold")}
      >
        B
      </button>
      <button
        type="button"
        style={{ ...styles.ghostBtn, padding: "0.25rem 0.65rem", fontStyle: "italic" }}
        onClick={onItalic}
        title={t("scenarioForm.formatItalic")}
        aria-label={t("scenarioForm.formatItalic")}
      >
        I
      </button>
      <button
        type="button"
        style={{ ...styles.ghostBtn, padding: "0.25rem 0.65rem", fontSize: "0.8rem" }}
        onClick={onList}
        title={t("scenarioForm.formatList")}
        aria-label={t("scenarioForm.formatList")}
      >
        1. 2. 3.
      </button>
    </div>
  );
}

function SituationImages({ situation, onUpdate, disabled, setFormError }) {
  const { t } = useTranslation();
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState(null);
  const imageUrlsRef = useRef(situation.image_urls);
  imageUrlsRef.current = situation.image_urls;
  const fileInputId = useId();
  const urls = situation.image_urls;
  const atImageCap = urls.length >= MAX_SCENARIO_IMAGES;
  const locked = disabled || uploading;

  const appendImageUrls = (toAdd) => {
    setFormError("");
    onUpdate((s) => {
      const seen = new Set(s.image_urls);
      const next = [...s.image_urls];
      for (const url of toAdd) {
        const clean = String(url || "").trim();
        if (!clean || seen.has(clean)) continue;
        if (next.length >= MAX_SCENARIO_IMAGES) break;
        seen.add(clean);
        next.push(clean);
      }
      return { ...s, image_urls: next };
    });
  };

  const removeImageAt = (index) => {
    setFormError("");
    setConfirmRemoveIndex(null);
    onUpdate((s) => {
      const removedUrl = s.image_urls[index];
      const nextCaptions = { ...s.image_captions };
      delete nextCaptions[removedUrl];
      return {
        ...s,
        image_urls: s.image_urls.filter((_, i) => i !== index),
        image_captions: nextCaptions,
      };
    });
  };

  const patchCaption = (url, caption) => {
    onUpdate((s) => ({ ...s, image_captions: { ...s.image_captions, [url]: caption } }));
  };

  const moveImage = (index, delta) => {
    setFormError("");
    onUpdate((s) => {
      const next = [...s.image_urls];
      const target = index + delta;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...s, image_urls: next };
    });
  };

  const setCoverImage = (index) => {
    if (index <= 0) return;
    setFormError("");
    onUpdate((s) => {
      if (index >= s.image_urls.length) return s;
      const next = [...s.image_urls];
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return { ...s, image_urls: next };
    });
  };

  const handleUploadFiles = async (fileList) => {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    const slots = MAX_SCENARIO_IMAGES - imageUrlsRef.current.length;
    if (slots <= 0) {
      setFormError(t("scenarioForm.maxImages", { max: MAX_SCENARIO_IMAGES }));
      return;
    }
    const toUpload = files.slice(0, slots);
    setUploading(true);
    setFormError("");
    setUploadProgress({ done: 0, total: toUpload.length });

    const failures = [];
    for (const file of toUpload) {
      try {
        const url = await uploadImageFile(file);
        appendImageUrls([url]);
      } catch (err) {
        failures.push({ name: file.name, message: err?.message || t("scenarioForm.uploadFailed") });
      }
      setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setUploading(false);
    setUploadProgress(null);

    const messages = failures.map((f) =>
      t("scenarioForm.uploadFileFailed", { name: f.name, message: f.message })
    );
    if (files.length > slots) {
      messages.push(t("scenarioForm.maxImages", { max: MAX_SCENARIO_IMAGES }));
    }
    if (messages.length) setFormError(messages.join(" — "));
  };

  const handleAddUrl = () => {
    const url = urlDraft.trim();
    if (!url) return;
    if (atImageCap) {
      setFormError(t("scenarioForm.maxImages", { max: MAX_SCENARIO_IMAGES }));
      return;
    }
    appendImageUrls([url]);
    setUrlDraft("");
  };

  return (
    <>
      <label style={styles.label}>{t("scenarioForm.images")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
        <input
          style={{ ...styles.input, flex: "1 1 220px", marginBottom: 0 }}
          placeholder={t("scenarioForm.imageUrlPlaceholder")}
          value={urlDraft}
          disabled={locked || atImageCap}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddUrl();
            }
          }}
        />
        <button
          type="button"
          style={styles.ghostBtn}
          disabled={locked || atImageCap || !urlDraft.trim()}
          onClick={handleAddUrl}
        >
          {t("scenarioForm.addImageUrl")}
        </button>
      </div>
      <div
        onDragOver={(e) => {
          if (locked || atImageCap) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDragActive(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setDragActive(false);
          if (locked || atImageCap) return;
          await handleUploadFiles(e.dataTransfer.files);
        }}
        style={{
          borderRadius: 10,
          border: dragActive ? "2px dashed #4fa3ff" : "2px dashed transparent",
          background: dragActive ? "rgba(79, 163, 255, 0.08)" : "transparent",
          transition: "border-color 120ms ease, background 120ms ease",
          padding: dragActive ? "0.5rem" : 0,
          margin: dragActive ? "-0.5rem" : 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginTop: "0.5rem",
            alignItems: "center",
            position: "relative",
          }}
        >
          <input
            id={fileInputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            multiple
            disabled={locked || atImageCap}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              await handleUploadFiles(files);
            }}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          />
          <label
            htmlFor={fileInputId}
            style={{
              ...styles.ghostBtn,
              cursor: locked || atImageCap ? "default" : "pointer",
              opacity: locked || atImageCap ? 0.55 : 1,
              pointerEvents: locked || atImageCap ? "none" : "auto",
            }}
          >
            {uploadProgress
              ? t("scenarioForm.uploadProgress", uploadProgress)
              : t("scenarioForm.uploadImages")}
          </label>
          <span style={{ color: "#8899aa", fontSize: "0.85rem" }}>
            {t("scenarioForm.imageCount", { count: urls.length, max: MAX_SCENARIO_IMAGES })}
          </span>
          <span style={{ color: "#5c7186", fontSize: "0.8rem" }}>{t("scenarioForm.dropHint")}</span>
        </div>
        <p style={{ color: "#5c7186", fontSize: "0.78rem", marginTop: "0.35rem", marginBottom: 0 }}>
          {t("scenarioForm.uploadHint")}
        </p>
        {urls.length === 0 ? (
          <p style={{ color: "#8899aa", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            {t("admin.noImagesYet")}
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.85rem",
            }}
          >
            {urls.map((url, index) => (
              <div
                key={`${url}-${index}`}
                style={{
                  position: "relative",
                  borderRadius: 10,
                  border: index === 0 ? "2px solid #4fa3ff" : "1px solid #1a2a3a",
                  overflow: "hidden",
                  background: "#0d1520",
                }}
              >
                <img
                  src={url}
                  alt={t("admin.imageBroken")}
                  onError={(e) => {
                    e.currentTarget.style.opacity = "0.35";
                    e.currentTarget.alt = t("admin.imageBroken");
                  }}
                  style={{ display: "block", width: "100%", height: 110, objectFit: "cover" }}
                />
                {index === 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      background: "rgba(8, 14, 22, 0.85)",
                      color: "#4fa3ff",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.4rem",
                      borderRadius: 4,
                    }}
                  >
                    {t("scenarioForm.coverBadge")}
                  </div>
                ) : null}
                <input
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "#111e2c",
                    border: "none",
                    borderTop: "1px solid #1a2a3a",
                    color: "#eaf0fb",
                    fontSize: "0.72rem",
                    padding: "0.35rem 0.5rem",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                  placeholder={t("scenarioForm.captionPlaceholder")}
                  value={situation.image_captions[url] || ""}
                  maxLength={200}
                  disabled={locked}
                  onChange={(e) => patchCaption(url, e.target.value)}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                  <button
                    type="button"
                    style={{ ...styles.ghostBtn, flex: 1, borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                    disabled={locked || index === 0}
                    onClick={() => moveImage(index, -1)}
                    title={t("scenarioForm.moveUp")}
                    aria-label={t("scenarioForm.moveUp")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.ghostBtn, flex: 1, borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                    disabled={locked || index === urls.length - 1}
                    onClick={() => moveImage(index, 1)}
                    title={t("scenarioForm.moveDown")}
                    aria-label={t("scenarioForm.moveDown")}
                  >
                    ↓
                  </button>
                </div>
                {index > 0 ? (
                  <button
                    type="button"
                    style={{ ...styles.ghostBtn, width: "100%", borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                    disabled={locked}
                    onClick={() => setCoverImage(index)}
                  >
                    {t("scenarioForm.setCover")}
                  </button>
                ) : null}
                {confirmRemoveIndex === index ? (
                  <div style={{ padding: "0.35rem", background: "rgba(192, 57, 43, 0.12)" }}>
                    <p style={{ color: "#ff6b6b", fontSize: "0.72rem", margin: "0 0 0.35rem" }}>
                      {t("scenarioForm.removeImageConfirm")}
                    </p>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        style={{ ...styles.dangerBtn, flex: 1, fontSize: "0.72rem", padding: "0.3rem" }}
                        onClick={() => removeImageAt(index)}
                      >
                        {t("scenarioForm.yesRemove")}
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.cancelBtn, flex: 1, fontSize: "0.72rem", padding: "0.3rem" }}
                        onClick={() => setConfirmRemoveIndex(null)}
                      >
                        {t("scenarioForm.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    style={{
                      ...styles.cancelBtn,
                      width: "100%",
                      borderRadius: 0,
                      marginTop: 0,
                      fontSize: "0.75rem",
                      padding: "0.35rem",
                    }}
                    disabled={locked}
                    onClick={() => setConfirmRemoveIndex(index)}
                  >
                    {t("scenarioForm.removeImage")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SituationEditor({
  situation,
  index,
  total,
  activeLang,
  open,
  onToggle,
  onUpdate,
  onRemove,
  onMove,
  fixed,
  disabled,
  narrow,
  setFormError,
  sectionRef,
}) {
  const { t } = useTranslation();
  const texts = situation.texts[activeLang];
  const refs = {
    scenario: useRef(null),
    solution: useRef(null),
    acceptance: useRef(null),
  };

  const setText = (key, value) =>
    onUpdate((s) => ({
      ...s,
      texts: { ...s.texts, [activeLang]: { ...s.texts[activeLang], [key]: value } },
    }));

  const wrapSelection = (key, before, after, placeholder) => {
    const el = refs[key].current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd) || placeholder;
    setText(key, value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd));
    requestAnimationFrame(() => {
      el.focus();
      const start = selectionStart + before.length;
      el.setSelectionRange(start, start + selected.length);
    });
  };

  const insertList = (key) => {
    const el = refs[key].current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const lines = value
      .slice(selectionStart, selectionEnd)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const insertion =
      lines.length >= 2
        ? lines.map((l, i) => `${i + 1}. ${l}`).join("\n\n")
        : `1. ${t("scenarioForm.formatListItemOne")}\n\n2. ${t("scenarioForm.formatListItemTwo")}`;
    setText(key, value.slice(0, selectionStart) + insertion + value.slice(selectionEnd));
    requestAnimationFrame(() => {
      el.focus();
      const pos = selectionStart + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toolbarFor = (key) => (
    <TextFormatToolbar
      t={t}
      onBold={() => wrapSelection(key, "**", "**", t("scenarioForm.formatBoldPlaceholder"))}
      onItalic={() => wrapSelection(key, "_", "_", t("scenarioForm.formatItalicPlaceholder"))}
      onList={() => insertList(key)}
    />
  );

  const modeButtons = (flagKey, labelKey, ariaKey) => (
    <div
      role="radiogroup"
      aria-label={t(ariaKey)}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}
    >
      {[
        { value: false, key: "solutionModeText" },
        { value: true, key: "solutionModeChecklist" },
      ].map((opt) => {
        const active = situation[flagKey] === opt.value;
        return (
          <button
            key={`${labelKey}-${opt.key}`}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onUpdate((s) => ({ ...s, [flagKey]: opt.value }))}
            style={{
              ...styles.ghostBtn,
              padding: "0.4rem 0.85rem",
              fontSize: "0.85rem",
              ...(active ? { borderColor: "#4fa3ff", color: "#4fa3ff" } : {}),
            }}
          >
            {t(`scenarioForm.${opt.key}`)}
          </button>
        );
      })}
    </div>
  );

  const snippet = (texts.scenario || "").replace(/\s+/g, " ").trim();
  const headerBtnStyle = { ...styles.ghostBtn, padding: "0.3rem 0.6rem", fontSize: "0.8rem" };

  return (
    <section ref={sectionRef} style={styles.situationCard}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.75rem" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            color: "#eaf0fb",
            textAlign: "left",
            padding: "0.25rem 0",
          }}
        >
          <span aria-hidden="true" style={{ color: "#4fa3ff" }}>{open ? "▲" : "▼"}</span>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>
            {t("scenarioForm.situationN", { n: index + 1 })}
          </span>
          {situation.verdict ? (
            <span style={{ color: "#8899aa", fontSize: "0.8rem", flexShrink: 0 }}>
              · {t(`verdict.${situation.verdict}`)}
            </span>
          ) : null}
          <span
            style={{
              color: "#5c7186",
              fontSize: "0.85rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {snippet}
          </span>
        </button>
        {fixed ? null : (
          <>
            <button
              type="button"
              style={headerBtnStyle}
              disabled={disabled || index === 0}
              onClick={() => onMove(-1)}
              title={t("scenarioForm.moveUp")}
              aria-label={t("scenarioForm.moveUp")}
            >
              ↑
            </button>
            <button
              type="button"
              style={headerBtnStyle}
              disabled={disabled || index === total - 1}
              onClick={() => onMove(1)}
              title={t("scenarioForm.moveDown")}
              aria-label={t("scenarioForm.moveDown")}
            >
              ↓
            </button>
            <button
              type="button"
              style={{ ...styles.dangerBtn, padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
              disabled={disabled || total === 1}
              onClick={onRemove}
            >
              {t("scenarioForm.removeSituation")}
            </button>
          </>
        )}
      </div>

      {open ? (
        <div style={{ padding: "0 1rem 1.25rem", borderTop: "1px solid #1a2a3a" }}>
          <label style={styles.label}>{t("scenarioForm.verdict")}</label>
          <select
            style={styles.select}
            value={situation.verdict}
            onChange={(e) => onUpdate((s) => ({ ...s, verdict: e.target.value }))}
            disabled={disabled}
          >
            <option value="">{t("scenarioForm.verdictPlaceholder")}</option>
            {VERDICT_CODES.map((code) => (
              <option key={code} value={code}>
                {t(`verdict.${code}`)}
              </option>
            ))}
          </select>

          <label style={styles.label}>
            {t("scenarioForm.scenario")} ({LANG_LABELS[activeLang]})
          </label>
          {toolbarFor("scenario")}
          <textarea
            ref={refs.scenario}
            style={{ ...styles.input, height: 100 }}
            placeholder={t("scenarioForm.situationPlaceholder")}
            value={texts.scenario}
            disabled={disabled}
            onChange={(e) => setText("scenario", e.target.value)}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: narrow ? "1fr" : "1fr 1fr",
              gap: "0 1.25rem",
              alignItems: "start",
            }}
          >
            <div>
              <label style={styles.label}>
                {t("scenarioForm.solution")} ({LANG_LABELS[activeLang]})
              </label>
              {modeButtons("solution_as_checklist", "solution", "scenarioForm.solutionMode")}
              {toolbarFor("solution")}
              <textarea
                ref={refs.solution}
                style={{ ...styles.input, height: 200 }}
                placeholder={
                  situation.solution_as_checklist
                    ? t("scenarioForm.solutionPlaceholderChecklist")
                    : t("scenarioForm.solutionPlaceholder")
                }
                value={texts.solution}
                disabled={disabled}
                onChange={(e) => setText("solution", e.target.value)}
              />
              <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>
                {situation.solution_as_checklist
                  ? t("scenarioForm.solutionHelpChecklist")
                  : t("scenarioForm.solutionHelp")}
              </p>
            </div>
            <div>
              <label style={styles.label}>
                {t("scenarioForm.acceptance")} ({LANG_LABELS[activeLang]})
              </label>
              {modeButtons("acceptance_as_checklist", "acceptance", "scenarioForm.acceptanceMode")}
              {toolbarFor("acceptance")}
              <textarea
                ref={refs.acceptance}
                style={{ ...styles.input, height: 200 }}
                placeholder={
                  situation.acceptance_as_checklist
                    ? t("scenarioForm.acceptancePlaceholderChecklist")
                    : t("scenarioForm.acceptancePlaceholder")
                }
                value={texts.acceptance}
                disabled={disabled}
                onChange={(e) => setText("acceptance", e.target.value)}
              />
              <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>
                {situation.acceptance_as_checklist
                  ? t("scenarioForm.acceptanceHelpChecklist")
                  : t("scenarioForm.acceptanceHelp")}
              </p>
            </div>
          </div>

          <SituationImages
            situation={situation}
            onUpdate={onUpdate}
            disabled={disabled}
            setFormError={setFormError}
          />
        </div>
      ) : null}
    </section>
  );
}

export default function ScenarioForm({
  initial,
  focusSituationId,
  addSituation,
  onSave,
  onCancel,
  onManageWps,
}) {
  const { t, i18n } = useTranslation();
  const { notify, workPackages } = useAppData();
  const narrow = useIsNarrow();
  const isLegacyScenario = Boolean(initial) && !isScenarioV2Id(initial.id);
  const [converting, setConverting] = useState(isLegacyScenario && Boolean(addSituation));
  const legacyMode = isLegacyScenario && !converting;
  const [baseline] = useState(() => buildForm(initial));
  const baselineJson = useMemo(() => JSON.stringify(baseline), [baseline]);
  const [form, setForm] = useState(() =>
    addSituation ? { ...baseline, situations: [...baseline.situations, blankSituation()] } : baseline
  );
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
  const [openIds, setOpenIds] = useState(() => {
    if (addSituation) return new Set([form.situations[form.situations.length - 1].id]);
    return new Set([focusSituationId || baseline.situations[0].id]);
  });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const formErrorRef = useRef(null);
  const situationRefs = useRef({});
  const sectionRefs = {
    basics: useRef(null),
    situations: useRef(null),
    publish: useRef(null),
  };

  const jumpToSection = (key) => {
    sectionRefs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const targetId = addSituation
      ? form.situations[form.situations.length - 1].id
      : focusSituationId;
    if (!targetId) return;
    requestAnimationFrame(() => {
      situationRefs.current[targetId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    if (formError) {
      formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [formError]);

  const dirty = useMemo(() => JSON.stringify(form) !== baselineJson, [form, baselineJson]);

  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(t("scenarioForm.unsavedConfirm"))) blocker.proceed();
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

  const confirmDiscard = useCallback(
    () => !dirty || window.confirm(t("scenarioForm.unsavedConfirm")),
    [dirty, t]
  );

  const requestCancel = useCallback(() => {
    if (confirmDiscard()) onCancel();
  }, [confirmDiscard, onCancel]);

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
        setFormError(t("scenarioForm.languagesNeedOne"));
        return;
      }
      const next = enabledLangs.filter((l) => l !== lng);
      setForm((f) => ({
        ...f,
        translations: { ...f.translations, [lng]: { title: "", tags: "" } },
        situations: f.situations.map((s) => ({ ...s, texts: { ...s.texts, [lng]: { ...BLANK_TEXT } } })),
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

  const updateSituation = (id, fn) => {
    setFormError("");
    setForm((f) => ({ ...f, situations: f.situations.map((s) => (s.id === id ? fn(s) : s)) }));
  };

  const addNewSituation = () => {
    const created = blankSituation();
    setFormError("");
    if (isLegacyScenario) setConverting(true);
    setForm((f) => ({ ...f, situations: [...f.situations, created] }));
    setOpenIds((prev) => new Set(prev).add(created.id));
    requestAnimationFrame(() => {
      situationRefs.current[created.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const removeSituation = (id) => {
    if (!window.confirm(t("scenarioForm.removeSituationConfirm"))) return;
    setFormError("");
    setForm((f) => ({ ...f, situations: f.situations.filter((s) => s.id !== id) }));
  };

  const moveSituation = (index, delta) => {
    setForm((f) => {
      const target = index + delta;
      if (target < 0 || target >= f.situations.length) return f;
      const next = [...f.situations];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, situations: next };
    });
  };

  const toggleSituationOpen = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (busy) return;
    if (!legacyMode && form.wps.length === 0) {
      setFormError(t("scenarioForm.wpsRequired"));
      return;
    }
    for (let i = 0; i < form.situations.length; i += 1) {
      const s = form.situations[i];
      if (!s.verdict) {
        setFormError(t("scenarioForm.situationVerdictRequired", { n: i + 1 }));
        setOpenIds((prev) => new Set(prev).add(s.id));
        return;
      }
      if (!enabledLangs.some((lng) => isComplete(s.texts[lng]))) {
        setFormError(t("scenarioForm.situationIncomplete", { n: i + 1 }));
        setOpenIds((prev) => new Set(prev).add(s.id));
        return;
      }
    }
    const complete = enabledLangs.filter((lng) => languageHasCompleteSituation(form, lng));
    if (complete.length === 0) {
      setFormError(t("scenarioForm.needOneLanguage"));
      return;
    }
    const partial = enabledLangs.filter(
      (lng) => languageHasContent(form, lng) && !languageIsComplete(form, lng)
    );
    if (partial.length && !window.confirm(t("scenarioForm.partialWarn", { langs: partial.join(", ") }))) {
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      await onSave(
        formToPayload(
          form,
          enabledLangs,
          complete.includes(activeLang) ? activeLang : complete[0],
          converting ? initial.id : null
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const previewView = useMemo(
    () => ({
      title: form.translations[activeLang].title,
      tags: splitTags(form.translations[activeLang].tags),
      situations: form.situations
        .filter((s) => s.verdict && isComplete(s.texts[activeLang]))
        .map((s) => ({
          id: s.id,
          verdict: s.verdict,
          scenario: s.texts[activeLang].scenario,
          solution: s.texts[activeLang].solution,
          acceptance: s.texts[activeLang].acceptance,
          image_urls: s.image_urls,
          image_captions: s.image_captions,
          solution_as_checklist: s.solution_as_checklist,
          acceptance_as_checklist: s.acceptance_as_checklist,
        })),
    }),
    [form, activeLang]
  );
  const previewScenario = useMemo(
    () => ({ id: "preview", wps: form.wps, category_wps: [], confluence_page_id: "" }),
    [form.wps]
  );
  const canPreview = form.translations[activeLang].title.trim() !== "" && previewView.situations.length > 0;
  const locked = busy;
  const wpList = workPackages || [];

  return (
    <div style={{ ...styles.formWrap, maxWidth: narrow ? 680 : 1100 }}>
      <h2 style={styles.formTitle}>
        {initial ? t("scenarioForm.editTitle") : t("scenarioForm.addTitle")}
      </h2>

      <nav
        aria-label={t("scenarioForm.jumpNav")}
        style={{
          display: "flex",
          flexWrap: "nowrap",
          overflowX: "auto",
          gap: "0.4rem",
          background: "#0d1520",
          borderBottom: "1px solid #1a2a3a",
          padding: "0.6rem 0",
          marginBottom: "1rem",
        }}
      >
        {[
          ["basics", t("scenarioForm.sectionBasics")],
          ["situations", `${t("scenarioForm.sectionSituations")} (${form.situations.length})`],
          ["publish", t("scenarioForm.sectionPublish")],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => jumpToSection(key)}
            style={{
              ...styles.ghostBtn,
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              whiteSpace: "nowrap",
              flex: "none",
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={addNewSituation}
          disabled={locked}
          style={{
            ...styles.ghostBtn,
            padding: "0.35rem 0.75rem",
            fontSize: "0.8rem",
            whiteSpace: "nowrap",
            flex: "none",
            border: "1px dashed #4fa3ff",
            color: "#4fa3ff",
          }}
        >
          {t("scenarioForm.addSituation")}
        </button>
      </nav>

      {formError ? (
        <div id="scenario-form-error" ref={formErrorRef} style={styles.formInlineError} role="alert">
          {formError}
        </div>
      ) : null}

      <div ref={sectionRefs.basics}>
        <label style={styles.label}>{t("scenarioForm.wps")}</label>
        {legacyMode ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {form.wps.map((w) => (
                <span key={w} style={styles.tagLarge}>
                  {w}
                </span>
              ))}
              {form.wps.length === 0 ? <span style={{ color: "#8899aa" }}>—</span> : null}
            </div>
            <p style={{ color: "#8899aa", fontSize: "0.8rem", marginBottom: 0 }}>
              {t("scenarioForm.wpsLegacy")}
            </p>
          </>
        ) : wpList.length === 0 ? (
          <p style={{ color: "#8899aa", fontSize: "0.85rem", marginTop: 0 }}>
            {t("scenarioForm.wpsEmpty")}{" "}
            <button
              type="button"
              style={{ ...styles.ghostBtn, padding: "0.25rem 0.6rem" }}
              onClick={() => {
                if (confirmDiscard()) onManageWps();
              }}
            >
              {t("admin.manageWps")}
            </button>
          </p>
        ) : (
          <Dropdown
            multiple
            options={wpList.map((wp) => ({ value: wp.label, label: wp.label }))}
            value={form.wps}
            onChange={(next) => {
              setFormError("");
              setForm((f) => ({ ...f, wps: next }));
            }}
            placeholder={t("scenarioForm.wpsPlaceholder")}
            summary={(selected) =>
              selected.length <= 2
                ? selected.map((o) => o.label).join(", ")
                : t("scenarioForm.wpsSelected", { count: selected.length })
            }
            searchPlaceholder={t("dropdown.search")}
            emptyText={t("dropdown.noResults")}
            ariaLabel={t("scenarioForm.wps")}
            disabled={locked}
            style={{ maxWidth: 420 }}
          />
        )}

        <label style={styles.label}>{t("scenarioForm.languagesLabel")}</label>
        <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>
          {t("scenarioForm.languagesHelp")}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
          {SUPPORTED_SCENARIO_LOCALES.map((lng) => (
            <label
              key={lng}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={enabledLangs.includes(lng)}
                disabled={locked}
                onChange={() => toggleLang(lng)}
              />
              {t("scenarioForm.languagesEnable", { lang: LANG_LABELS[lng] })}
            </label>
          ))}
        </div>
        <div style={{ ...styles.tabRow, marginBottom: "0.85rem" }} role="tablist" aria-label={t("scenarioForm.languagesLabel")}>
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
                  aria-label={filled ? t("scenarioForm.langFilled") : t("scenarioForm.langEmpty")}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: filled ? "#1abc9c" : "#3a4a5a",
                  }}
                />
              </button>
            );
          })}
        </div>

        <label style={styles.label}>
          {t("scenarioForm.title")} ({LANG_LABELS[activeLang]})
        </label>
        <input
          style={styles.input}
          placeholder={t("scenarioForm.title")}
          value={form.translations[activeLang].title}
          disabled={locked}
          onChange={(e) => patchTranslation("title", e.target.value)}
        />

        <label style={styles.label}>
          {t("scenarioForm.tags")} ({LANG_LABELS[activeLang]})
        </label>
        <input
          style={styles.input}
          placeholder={t("scenarioForm.tagsPlaceholder")}
          value={form.translations[activeLang].tags}
          disabled={locked}
          onChange={(e) => patchTranslation("tags", e.target.value)}
        />
      </div>

      <div ref={sectionRefs.situations} style={{ marginTop: "1.5rem" }}>
        <label style={styles.label}>
          {t("scenarioForm.sectionSituations")} ({form.situations.length})
        </label>
        <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: 0 }}>
          {legacyMode ? t("scenarioForm.legacyNote") : t("scenarioForm.situationsHelp")}
        </p>
        {converting ? (
          <div
            role="note"
            style={{
              background: "rgba(79, 163, 255, 0.1)",
              border: "1px solid rgba(79, 163, 255, 0.35)",
              color: "#b9d6ff",
              padding: "0.65rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
            }}
          >
            {t("scenarioForm.convertNote")}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {form.situations.map((situation, index) => (
            <SituationEditor
              key={situation.id}
              situation={situation}
              index={index}
              total={form.situations.length}
              activeLang={activeLang}
              open={openIds.has(situation.id)}
              onToggle={() => toggleSituationOpen(situation.id)}
              onUpdate={(fn) => updateSituation(situation.id, fn)}
              onRemove={() => removeSituation(situation.id)}
              onMove={(delta) => moveSituation(index, delta)}
              fixed={legacyMode}
              disabled={locked}
              narrow={narrow}
              setFormError={setFormError}
              sectionRef={(el) => {
                if (el) situationRefs.current[situation.id] = el;
                else delete situationRefs.current[situation.id];
              }}
            />
          ))}
        </div>
        <button
          type="button"
          style={{ ...styles.ghostBtn, marginTop: "0.85rem", border: "1px dashed #1a2a3a" }}
          disabled={locked}
          onClick={addNewSituation}
        >
          {t("scenarioForm.addSituation")}
        </button>
      </div>

      <div ref={sectionRefs.publish}>
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
          {t("scenarioForm.published")}
        </label>

        <div style={styles.formActions}>
          <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={locked}>
            {busy
              ? t("scenarioForm.saving")
              : initial
                ? t("scenarioForm.saveChanges")
                : t("scenarioForm.addScenario")}
          </button>
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={() => setShowPreview(true)}
            disabled={locked || !canPreview}
            title={canPreview ? undefined : t("scenarioForm.previewUnavailable")}
          >
            {t("scenarioForm.preview")}
          </button>
          <button type="button" style={styles.ghostBtn} onClick={requestCancel} disabled={locked}>
            {t("scenarioForm.cancel")}
          </button>
        </div>
      </div>
      {showPreview ? (
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
            <ScenarioDetail
              scenario={previewScenario}
              view={previewView}
              onBack={() => setShowPreview(false)}
              onNotify={notify}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
