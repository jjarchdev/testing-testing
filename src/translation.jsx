import { useState } from "react";
import { useTranslation } from "react-i18next";
import { styles } from "./styles.js";
import { SUPPORTED_SCENARIO_LOCALES } from "../shared/scenarioSchema.mjs";

export const LANG_LABELS = { en: "English", de: "Deutsch", sq: "Shqip" };

const LANG_ORDER = ["sq", "en", "de"];

export function useUiLanguage() {
  const { i18n } = useTranslation();
  const lng = String(i18n.language || "en").slice(0, 2).toLowerCase();
  return LANG_ORDER.includes(lng) ? lng : "en";
}

const inOrder = (list) => LANG_ORDER.filter((l) => list.includes(l));
const STATUS_COLORS = { complete: "#1abc9c", partial: "#e67e22", empty: "#5c7186" };

const filled = (value) => typeof value === "string" && value.trim() !== "";

export function scenarioLangStatus(editable, lng) {
  const slot = editable.translations?.[lng];
  const title = filled(slot?.title);
  const texts = editable.situations.map((s) => s.translations?.[lng] || {});
  const complete = title && texts.length > 0 && texts.every((x) => filled(x.scenario) && filled(x.solution));
  if (complete) return "complete";
  const anyText = texts.some((x) => filled(x.scenario) || filled(x.solution) || filled(x.acceptance));
  return title || anyText || (slot?.tags || []).length > 0 ? "partial" : "empty";
}

export function guideLangStatus(guide, lng) {
  const slot = guide.translations?.[lng];
  const title = filled(slot?.title);
  const textOf = (step, l) => step.translations?.[l]?.text;
  const stepsWithText = guide.steps.filter((s) => Object.keys(s.translations || {}).some((l) => filled(textOf(s, l))));
  if (title && stepsWithText.every((s) => filled(textOf(s, lng)))) return "complete";
  const anyText = guide.steps.some((s) => filled(textOf(s, lng)));
  return title || anyText || filled(slot?.summary) ? "partial" : "empty";
}

function pickStartLanguage(uiLanguage, hasContent) {
  return [uiLanguage, ...LANG_ORDER].find((l) => hasContent(l)) || null;
}

function pickReferenceLang(enabled, active, choice, scoreOf, preferred) {
  const others = enabled.filter((l) => l !== active);
  if (choice && others.includes(choice)) return choice;
  let best = null;
  let bestScore = 0;
  for (const l of others) {
    const base = scoreOf(l);
    const score = base > 0 && l === preferred ? base + 0.5 : base;
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  }
  return best;
}

export function useEditorLanguages({ hasContent, scoreOf, initialLang, clearLanguage, onChange }) {
  const { t } = useTranslation();
  const uiLanguage = useUiLanguage();
  const requestedLang = SUPPORTED_SCENARIO_LOCALES.includes(initialLang) ? initialLang : null;
  const [enabledLangs, setEnabledLangs] = useState(() => {
    const filled = SUPPORTED_SCENARIO_LOCALES.filter((lng) => hasContent(lng) || lng === requestedLang);
    return filled.length ? filled : [uiLanguage];
  });
  const [activeLang, setActiveLang] = useState(
    () => requestedLang || pickStartLanguage(uiLanguage, hasContent) || uiLanguage
  );
  const [referenceChoice, setReferenceChoice] = useState(null);

  const addLang = (lng) => {
    onChange();
    if (!enabledLangs.includes(lng)) setEnabledLangs([...enabledLangs, lng]);
    setActiveLang(lng);
  };

  const removeLang = (lng) => {
    if (enabledLangs.length === 1 || !enabledLangs.includes(lng)) return;
    if (!window.confirm(t("translate.removeConfirm", { lang: LANG_LABELS[lng] }))) return;
    onChange();
    const next = enabledLangs.filter((l) => l !== lng);
    clearLanguage(lng);
    setEnabledLangs(next);
    if (activeLang === lng) setActiveLang(next[0]);
    if (referenceChoice === lng) setReferenceChoice(null);
  };

  const referenceLang = pickReferenceLang(enabledLangs, activeLang, referenceChoice, scoreOf, uiLanguage);

  return { enabledLangs, activeLang, setActiveLang, referenceLang, setReferenceChoice, addLang, removeLang };
}

const addBtn = {
  border: "1px dashed #4fa3ff",
  borderRadius: 8,
  background: "transparent",
  color: "#4fa3ff",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: "0.8rem",
  padding: "0.3rem 0.7rem",
  cursor: "pointer",
  alignSelf: "center",
  marginLeft: "0.4rem",
};

export function LanguageTabs({ languages, enabled, active, statusOf, onSelect, onAdd, onRemove, disabled, ariaLabel, note }) {
  const { t } = useTranslation();
  const missing = inOrder(languages.filter((l) => !enabled.includes(l)));
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        style={{ ...styles.tabRow, marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
      >
        {inOrder(enabled).map((lng) => {
          const status = statusOf(lng);
          const isActive = lng === active;
          return (
            <button
              key={lng}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(lng)}
              style={{
                ...styles.tabBtn,
                ...(isActive ? styles.tabBtnActive : {}),
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {LANG_LABELS[lng]}
              <span
                title={t(`translate.status.${status}`)}
                aria-label={t(`translate.status.${status}`)}
                style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[status] }}
              />
            </button>
          );
        })}
        {missing.map((lng) => (
          <button key={lng} type="button" disabled={disabled} onClick={() => onAdd(lng)} style={addBtn}>
            + {t("translate.addLanguage", { lang: LANG_LABELS[lng] })}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem 1rem" }}>
        <span style={{ color: "#8899aa", fontSize: "0.8rem", flex: "1 1 260px" }}>{note}</span>
        {enabled.length > 1 && enabled.includes(active) ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(active)}
            style={{
              background: "transparent",
              border: "none",
              color: "#ff6b6b",
              fontFamily: "inherit",
              fontSize: "0.8rem",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {t("translate.removeLanguage", { lang: LANG_LABELS[active] })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TranslateFrom({ languages, value, onChange }) {
  const { t } = useTranslation();
  if (!languages.length || !value) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
      <span style={{ color: "#8899aa", fontSize: "0.82rem", fontWeight: 600 }}>{t("translate.from")}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...styles.select, width: "auto", padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}
      >
        {inOrder(languages).map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SourceHint({ lang, text, canCopy, onCopy }) {
  const { t } = useTranslation();
  if (!lang || !filled(text)) return null;
  return (
    <div
      style={{
        background: "#0d1520",
        border: "1px dashed #2a3d52",
        borderRadius: 8,
        padding: "0.5rem 0.65rem",
        marginBottom: "0.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5c7186" }}>
          {t("translate.original", { lang: LANG_LABELS[lang] })}
        </span>
        {canCopy ? (
          <button
            type="button"
            onClick={onCopy}
            title={t("translate.copyHint")}
            style={{
              background: "transparent",
              border: "1px solid #1a2a3a",
              borderRadius: 6,
              color: "#4fa3ff",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: "0.75rem",
              padding: "0.15rem 0.55rem",
              cursor: "pointer",
            }}
          >
            {t("translate.copy")}
          </button>
        ) : null}
      </div>
      <div style={{ color: "#b7c4d4", fontSize: "0.88rem", lineHeight: 1.45, whiteSpace: "pre-wrap", maxHeight: 130, overflow: "auto", overflowWrap: "anywhere" }}>
        {text}
      </div>
    </div>
  );
}

export function LanguageBadges({ statusOf, onOpen }) {
  const { t } = useTranslation();
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {LANG_ORDER.map((lng) => {
        const status = statusOf(lng);
        const color = STATUS_COLORS[status];
        const label = t("translate.badgeTitle", { lang: LANG_LABELS[lng], status: t(`translate.status.${status}`) });
        return (
          <button
            key={lng}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onOpen(lng)}
            style={{
              minWidth: 34,
              padding: "0.12rem 0.4rem",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: "0.7rem",
              fontWeight: 800,
              cursor: "pointer",
              color: status === "empty" ? "#5c7186" : color,
              background: status === "complete" ? "rgba(26, 188, 156, 0.12)" : "transparent",
              border: `1px ${status === "empty" ? "dashed" : "solid"} ${color}`,
            }}
          >
            {lng.toUpperCase()}
          </button>
        );
      })}
    </span>
  );
}
