import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import Dropdown from "./Dropdown.jsx";
import ConfluenceView from "./ConfluenceView.jsx";
import { useAppData } from "./AppData.jsx";
import { pickScenarioView, scenarioWpList, VERDICT_CODES } from "../shared/scenarioSchema.mjs";
import { accentForLabel, localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import {
  pushRecentId,
  readRecentIds,
  readFavoriteIds,
  toggleFavoriteId,
  readCheckedSteps,
  writeCheckedSteps,
  readWideLayout,
  writeWideLayout,
} from "./recent.js";
import { styles } from "./styles.js";

const VERDICT_ORDER = ["to_be_rejected", "grey_area", "acceptable"];

function truncateAtWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scenarioMatchesQuery(scenario, rawQuery, extraParts = []) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const parts = [
    scenario.title,
    scenario.scenario,
    scenario.solution,
    ...scenarioWpList(scenario),
    ...extraParts,
  ];
  if (Array.isArray(scenario.tags)) parts.push(...scenario.tags);
  const tr = scenario.translations || {};
  for (const lng of Object.keys(tr)) {
    const slot = tr[lng];
    if (!slot) continue;
    parts.push(slot.title, slot.scenario, slot.solution, slot.acceptance);
    if (Array.isArray(slot.tags)) parts.push(...slot.tags);
  }
  for (const situation of scenario.situations || []) {
    for (const slot of Object.values(situation.translations || {})) {
      parts.push(slot.scenario, slot.solution, slot.acceptance);
    }
  }
  const haystack = normalizeSearchText(parts.filter(Boolean).join(" "));
  return q.split(" ").filter(Boolean).every((token) => haystack.includes(token));
}

function parseSolutionBlocks(solution) {
  const text = String(solution || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const NUM_RE = /^\s*(\d+)\.\s*(.+)$/;
  const blocks = [];
  let paraBuf = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    const joined = paraBuf.join("\n").trim();
    if (joined) blocks.push({ type: "para", text: joined, key: `p-${blocks.length}` });
    paraBuf = [];
  };

  const pushSteps = (steps) => {
    if (steps.length < 2) {
      for (const s of steps) paraBuf.push(`${s.num}. ${s.text}`);
      return;
    }
    flushPara();
    blocks.push({ type: "steps", steps, key: `s-${blocks.length}` });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }
    const m = line.match(NUM_RE);
    if (m) {
      const run = [];
      while (i < lines.length) {
        if (lines[i].trim() === "") {
          if (i + 1 < lines.length && NUM_RE.test(lines[i + 1])) {
            i += 1;
            continue;
          }
          break;
        }
        const nm = lines[i].match(NUM_RE);
        if (!nm) break;
        run.push({
          key: `${i}-${nm[2].slice(0, 24)}`,
          num: nm[1],
          text: nm[2].trim(),
        });
        i += 1;
      }
      pushSteps(run);
      continue;
    }
    paraBuf.push(line);
    i += 1;
  }
  flushPara();
  return blocks;
}

function parseParagraphBlocks(solution) {
  const text = String(solution || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ type: "para", text: p, key: `p-${i}` }));
}

function prefixBlockKeys(blocks, prefix) {
  return blocks.map((b) =>
    b.type === "steps"
      ? {
          ...b,
          key: `${prefix}${b.key}`,
          steps: b.steps.map((s) => ({ ...s, key: `${prefix}${s.key}` })),
        }
      : { ...b, key: `${prefix}${b.key}` }
  );
}

function verdictBadgeStyle(code) {
  if (code === "to_be_rejected") return { color: "#e74c3c", borderColor: "#e74c3c" };
  if (code === "acceptable") return { color: "#1abc9c", borderColor: "#1abc9c" };
  return { color: "#e67e22", borderColor: "#e67e22" };
}

function VerdictBadge({ code, t }) {
  if (!VERDICT_CODES.includes(code)) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "0.15rem 0.5rem",
        borderRadius: 6,
        border: "1px solid",
        ...verdictBadgeStyle(code),
      }}
    >
      {t(`verdict.${code}`)}
    </span>
  );
}

function totalStepCount(blocks) {
  return blocks.reduce((n, b) => n + (b.type === "steps" ? b.steps.length : 0), 0);
}

function SolutionBlockList({ blocks, checked, onToggle, markLabel }) {
  return blocks.map((block) =>
    block.type === "steps" ? (
      <ol key={block.key} style={styles.stepList}>
        {block.steps.map((step) => {
          const isChecked = !!checked[step.key];
          return (
            <li key={step.key} style={styles.stepItem}>
              <label
                className="no-print"
                style={{ display: "flex", alignItems: "center", marginRight: "0.25rem" }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  aria-label={markLabel}
                  onChange={(e) => onToggle(step.key, e.target.checked)}
                />
              </label>
              <span
                style={{
                  ...styles.stepNum,
                  opacity: isChecked ? 0.55 : 1,
                }}
              >
                {step.num}
              </span>
              <span
                style={{
                  ...styles.stepText,
                  textDecoration: isChecked ? "line-through" : "none",
                  opacity: isChecked ? 0.65 : 1,
                }}
              >
                {renderInlineFormatting(step.text)}
              </span>
            </li>
          );
        })}
      </ol>
    ) : (
      <ParagraphText key={block.key} text={block.text} baseStyle={styles.detailBody} />
    )
  );
}

function renderInlineFormatting(text) {
  const source = String(text || "");
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(source))) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      parts.push(<em key={key++}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

function ParagraphText({ text, baseStyle }) {
  const paras = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!paras.length) return null;
  return (
    <>
      {paras.map((para, i) => {
        const lines = para.split("\n");
        return (
          <p key={i} style={baseStyle}>
            {lines.map((ln, j) => (
              <span key={j}>
                {renderInlineFormatting(ln)}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function viewImageUrls(view) {
  const urls = [];
  for (const s of view.situations) {
    for (const u of s.image_urls) if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

function ScenarioCard({ scenario, view, onSelect, openLabel, isFavorite, onToggleFavorite }) {
  const { t } = useTranslation();
  const wps = scenarioWpList(scenario);
  const color = accentForLabel(wps[0]);
  const snippet = truncateAtWord(view.situations[0].scenario, 100);
  const images = viewImageUrls(view);
  const imageUrl = images[0] || "";
  const verdicts = VERDICT_ORDER.filter((code) => view.situations.some((s) => s.verdict === code));
  const hasChecklist = view.situations.some((s) => s.solution_as_checklist || s.acceptance_as_checklist);

  return (
    <div
      role="button"
      tabIndex={0}
      style={styles.card}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div style={{ ...styles.cardAccent, background: color }} />
      {onToggleFavorite ? (
        <button
          type="button"
          className="no-print"
          aria-label={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
          title={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            background: "rgba(8, 14, 22, 0.75)",
            border: "none",
            borderRadius: 6,
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: isFavorite ? "#f5c518" : "#8899aa",
            fontSize: "1.05rem",
          }}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      ) : null}
      {imageUrl ? (
        <div style={{ position: "relative", margin: "-1.25rem -1.25rem 0.85rem" }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              width: "calc(100% + 0px)",
              maxHeight: 140,
              objectFit: "cover",
              display: "block",
            }}
          />
          {images.length > 1 ? (
            <span
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                background: "rgba(8, 14, 22, 0.82)",
                color: "#e8eef5",
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.2rem 0.45rem",
                borderRadius: 6,
              }}
            >
              +{images.length - 1}
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={styles.cardCat}>{wps.join(" · ")}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        {verdicts.map((code) => (
          <VerdictBadge key={code} code={code} t={t} />
        ))}
        {view.situations.length > 1 ? (
          <span style={styles.cardMiniBadge}>
            {t("employee.situationsCount", { count: view.situations.length })}
          </span>
        ) : null}
        {hasChecklist ? (
          <span title={t("employee.hasChecklist")} aria-label={t("employee.hasChecklist")} style={styles.cardMiniBadge}>
            ☑
          </span>
        ) : null}
        {scenario.confluence_page_id ? (
          <span title={t("employee.hasConfluence")} aria-label={t("employee.hasConfluence")} style={styles.cardMiniBadge}>
            🔗
          </span>
        ) : null}
      </div>
      <h3 style={styles.cardTitle}>{view.title}</h3>
      <p style={styles.cardSnippet}>{snippet}</p>
      <div style={styles.cardTags}>
        {view.tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
      <div style={styles.cardArrow}>{openLabel}</div>
    </div>
  );
}

function SituationPanel({ scenario, situation, index, title, flat, open, onToggle, narrow, onNotify }) {
  const { t } = useTranslation();
  const progressKey = situation.id === "legacy" ? scenario.id : `${scenario.id}:${situation.id}`;
  const persistProgress = Number.isFinite(Number(scenario.id));
  const blocks = useMemo(
    () =>
      situation.solution_as_checklist
        ? parseSolutionBlocks(situation.solution)
        : parseParagraphBlocks(situation.solution),
    [situation.solution, situation.solution_as_checklist]
  );
  const acceptanceText = (situation.acceptance || "").trim();
  const acceptanceBlocks = useMemo(() => {
    if (!acceptanceText) return [];
    return situation.acceptance_as_checklist
      ? prefixBlockKeys(parseSolutionBlocks(situation.acceptance), "ac-")
      : prefixBlockKeys(parseParagraphBlocks(situation.acceptance), "ac-");
  }, [situation.acceptance, situation.acceptance_as_checklist, acceptanceText]);
  const stepTotal = totalStepCount(blocks) + totalStepCount(acceptanceBlocks);
  const images = situation.image_urls;
  const imageCaptions = situation.image_captions;
  const [checked, setChecked] = useState(() => (persistProgress ? readCheckedSteps(progressKey) : {}));
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.5;
  const hasSidebar = !narrow && Boolean(acceptanceText);

  const handleToggleStep = (key, value) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: value };
      if (persistProgress) writeCheckedSteps(progressKey, next);
      return next;
    });
  };

  useEffect(() => {
    setZoom(1);
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight" && lightboxIndex < images.length - 1) {
        setLightboxIndex((i) => i + 1);
      }
      if (e.key === "ArrowLeft" && lightboxIndex > 0) {
        setLightboxIndex((i) => i - 1);
      }
      if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      }
      if (e.key === "-" || e.key === "_") {
        setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      }
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, images.length]);

  const doneCount = Object.values(checked).filter(Boolean).length;

  const copyProcedure = async () => {
    const stepLines = (list) =>
      list.flatMap((b) =>
        b.type === "steps" ? [...b.steps.map((s) => `${s.num}. ${s.text}`), ""] : [b.text, ""]
      );
    const bodyParts = [title, t(`verdict.${situation.verdict}`), ""];
    bodyParts.push(`${t("employee.situation")}:`, situation.scenario, "");
    bodyParts.push(`${t("employee.procedure")}:`, ...stepLines(blocks));
    if (acceptanceText) {
      bodyParts.push(`${t("employee.acceptance")}:`, ...stepLines(acceptanceBlocks));
    }
    try {
      await navigator.clipboard.writeText(bodyParts.join("\n").trim());
      onNotify(t("employee.copied"));
    } catch {
      onNotify(t("employee.copyFailed"), "error");
    }
  };

  const galleryStyle =
    images.length <= 1
      ? { display: "block", marginBottom: "1.25rem" }
      : images.length === 2
        ? {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }
        : {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          };

  const imgStyle =
    images.length === 1
      ? {
          width: "100%",
          maxHeight: 420,
          objectFit: "contain",
          borderRadius: 12,
          border: "1px solid #1a2a3a",
          display: "block",
          background: "#0d1520",
          cursor: "zoom-in",
        }
      : {
          width: "100%",
          height: images.length === 2 ? 240 : 180,
          objectFit: "contain",
          borderRadius: 12,
          border: "1px solid #1a2a3a",
          display: "block",
          background: "#0d1520",
          cursor: "zoom-in",
        };

  const body = (
    <>
      {images.length > 0 ? (
        <div style={galleryStyle}>
          {images.map((url, i) => {
            const caption = imageCaptions[url];
            return (
              <figure key={`${url}-${i}`} style={{ margin: 0 }}>
                <img
                  src={url}
                  alt={caption || ""}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLightboxIndex(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLightboxIndex(i);
                    }
                  }}
                  aria-label={t("employee.openImage", { n: i + 1 })}
                  style={imgStyle}
                />
                {caption ? (
                  <figcaption style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: "0.35rem" }}>
                    {caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          })}
        </div>
      ) : null}

      {lightboxIndex != null && images[lightboxIndex] ? (
        <div
          className="no-print"
          role="dialog"
          aria-modal="true"
          aria-label={t("employee.imageLightbox")}
          onClick={() => setLightboxIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(4, 8, 14, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            cursor: "zoom-out",
          }}
        >
          <button
            type="button"
            style={{
              ...styles.ghostBtn,
              position: "absolute",
              top: 16,
              right: 16,
            }}
            onClick={() => setLightboxIndex(null)}
          >
            {t("employee.closeImage")}
          </button>
          {images.length > 1 && lightboxIndex > 0 ? (
            <button
              type="button"
              style={{ ...styles.ghostBtn, position: "absolute", left: 16 }}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => i - 1);
              }}
            >
              ←
            </button>
          ) : null}
          {images.length > 1 && lightboxIndex < images.length - 1 ? (
            <button
              type="button"
              style={{ ...styles.ghostBtn, position: "absolute", right: 16 }}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => i + 1);
              }}
            >
              →
            </button>
          ) : null}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                overflow: "auto",
                maxWidth: "96vw",
                maxHeight: "78vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <img
                src={images[lightboxIndex]}
                alt={imageCaptions[images[lightboxIndex]] || ""}
                style={
                  zoom > 1
                    ? {
                        width: `calc(min(96vw, 1200px) * ${zoom})`,
                        maxWidth: "none",
                        maxHeight: "none",
                        borderRadius: 8,
                        cursor: "default",
                      }
                    : {
                        maxWidth: "min(96vw, 1200px)",
                        maxHeight: "78vh",
                        objectFit: "contain",
                        borderRadius: 8,
                        cursor: "default",
                      }
                }
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                style={{ ...styles.ghostBtn, padding: "0.35rem 0.75rem" }}
                disabled={zoom <= ZOOM_MIN}
                aria-label={t("employee.zoomOut")}
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              >
                −
              </button>
              <button
                type="button"
                style={{ ...styles.ghostBtn, padding: "0.35rem 0.75rem", minWidth: 56 }}
                aria-label={t("employee.zoomReset")}
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                style={{ ...styles.ghostBtn, padding: "0.35rem 0.75rem" }}
                disabled={zoom >= ZOOM_MAX}
                aria-label={t("employee.zoomIn")}
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              >
                +
              </button>
            </div>
            {imageCaptions[images[lightboxIndex]] ? (
              <div style={{ color: "#eaf0fb", fontSize: "0.9rem", textAlign: "center" }}>
                {imageCaptions[images[lightboxIndex]]}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <button type="button" style={styles.ghostBtn} onClick={copyProcedure}>
          {t("employee.copyProcedure")}
        </button>
        {stepTotal > 0 ? (
          <span style={{ alignSelf: "center", color: "#8899aa", fontSize: "0.9rem", fontWeight: 600 }}>
            {t("employee.stepsProgress", { done: doneCount, total: stepTotal })}
          </span>
        ) : null}
      </div>

      <div
        style={
          hasSidebar
            ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "1.5rem", alignItems: "start" }
            : undefined
        }
      >
        <div>
          <div style={styles.detailSection}>
            <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
            <ParagraphText text={situation.scenario} baseStyle={styles.detailBody} />
          </div>
          <div style={styles.detailSection}>
            <div style={styles.detailSectionLabel}>{t("employee.procedure")}</div>
            <SolutionBlockList
              blocks={blocks}
              checked={checked}
              markLabel={t("employee.markStep")}
              onToggle={handleToggleStep}
            />
          </div>
          {!hasSidebar && acceptanceText ? (
            <div style={styles.detailSection}>
              <div style={styles.detailSectionLabel}>{t("employee.acceptance")}</div>
              <SolutionBlockList
                blocks={acceptanceBlocks}
                checked={checked}
                markLabel={t("employee.markStep")}
                onToggle={handleToggleStep}
              />
            </div>
          ) : null}
        </div>
        {hasSidebar ? (
          <div style={styles.detailSection}>
            <div style={styles.detailSectionLabel}>{t("employee.acceptance")}</div>
            <SolutionBlockList
              blocks={acceptanceBlocks}
              checked={checked}
              markLabel={t("employee.markStep")}
              onToggle={handleToggleStep}
            />
          </div>
        ) : null}
      </div>
    </>
  );

  if (flat) return body;

  return (
    <section style={styles.situationCard}>
      <button
        type="button"
        className="no-print"
        onClick={onToggle}
        aria-expanded={open}
        style={styles.situationHeader}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, textAlign: "left" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#5c7186", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("employee.situationN", { n: index + 1 })}
          </span>
          <span style={{ color: "#eaf0fb", fontSize: "0.95rem", lineHeight: 1.4, overflowWrap: "anywhere" }}>
            {truncateAtWord(situation.scenario.replace(/\s+/g, " "), 160)}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: "#4fa3ff", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? <div style={{ padding: "0 1rem" }}>{body}</div> : null}
    </section>
  );
}

export function ScenarioDetail({ scenario, view, onBack, onNotify, isFavorite, onToggleFavorite }) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const wps = scenarioWpList(scenario);
  const situations = view.situations;
  const single = situations.length === 1;
  const [openIds, setOpenIds] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);
  const [wideLayout, setWideLayout] = useState(() => readWideLayout());
  const wide =
    !narrow &&
    situations.some((s) => (s.acceptance || "").trim() || s.image_urls.length > 1);

  const toggleWideLayout = () => {
    setWideLayout((v) => {
      const next = !v;
      writeWideLayout(next);
      return next;
    });
  };

  const toggleSituation = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOpen = situations.every((s) => openIds.has(s.id));

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  let shownCount = 0;
  const groups = VERDICT_ORDER.map((code) => ({
    code,
    items: situations.filter((s) => s.verdict === code).map((situation) => ({ situation, index: shownCount++ })),
  })).filter((g) => g.items.length);

  return (
    <article
      className="print-root"
      style={
        wideLayout && !narrow
          ? { ...styles.detail, maxWidth: "100%" }
          : wide
            ? { ...styles.detail, maxWidth: 1120 }
            : styles.detail
      }
      aria-labelledby="scenario-detail-title"
    >
      <div
        className="no-print"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", justifyContent: "space-between", alignItems: "center" }}
      >
        <button type="button" style={styles.detailBack} onClick={onBack}>
          {t("employee.backAll")}
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {!narrow ? (
            <button
              type="button"
              aria-label={wideLayout ? t("employee.comfortableWidth") : t("employee.fullWidth")}
              title={wideLayout ? t("employee.comfortableWidth") : t("employee.fullWidth")}
              onClick={toggleWideLayout}
              style={{ ...styles.ghostBtn, padding: "0.4rem 0.75rem" }}
            >
              {wideLayout ? "⤡" : "⤢"} {wideLayout ? t("employee.comfortableWidth") : t("employee.fullWidth")}
            </button>
          ) : null}
          <button
            type="button"
            style={{ ...styles.ghostBtn, padding: "0.4rem 0.75rem" }}
            onClick={() => setPrinting(true)}
          >
            {t("employee.print")}
          </button>
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
              title={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
              onClick={onToggleFavorite}
              style={{
                ...styles.ghostBtn,
                padding: "0.4rem 0.75rem",
                color: isFavorite ? "#f5c518" : undefined,
                borderColor: isFavorite ? "#f5c518" : undefined,
              }}
            >
              {isFavorite ? "★" : "☆"} {isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
            </button>
          ) : null}
        </div>
      </div>
      <div style={styles.detailCat}>{wps.join(" · ")}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {view.title}
      </h2>

      {single ? (
        <>
          <div style={{ margin: "0 0 0.75rem" }}>
            <VerdictBadge code={situations[0].verdict} t={t} />
          </div>
          <SituationPanel
            scenario={scenario}
            situation={situations[0]}
            index={0}
            title={view.title}
            flat
            open
            narrow={narrow}
            onNotify={onNotify}
          />
        </>
      ) : (
        <>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <span style={{ color: "#8899aa", fontSize: "0.9rem", fontWeight: 600 }}>
              {t("employee.situationsCount", { count: situations.length })}
            </span>
            <button
              type="button"
              style={{ ...styles.ghostBtn, padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(situations.map((s) => s.id)))}
            >
              {allOpen ? t("employee.collapseAll") : t("employee.expandAll")}
            </button>
          </div>
          {groups.map((group) => (
            <div key={group.code} style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.65rem" }}>
                <VerdictBadge code={group.code} t={t} />
                <span style={{ color: "#5c7186", fontSize: "0.8rem", fontWeight: 700 }}>{group.items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {group.items.map(({ situation, index }) => (
                  <SituationPanel
                    key={situation.id}
                    scenario={scenario}
                    situation={situation}
                    index={index}
                    title={view.title}
                    open={printing || openIds.has(situation.id)}
                    onToggle={() => toggleSituation(situation.id)}
                    narrow={narrow}
                    onNotify={onNotify}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={styles.detailTags}>
        {view.tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tagLarge}>
            {tag}
          </span>
        ))}
      </div>
      {scenario.confluence_page_id ? (
        <ConfluenceView
          pageId={scenario.confluence_page_id}
          pageUrl={scenario.confluence_page_url}
          pageTitle={scenario.confluence_page_title}
        />
      ) : null}
    </article>
  );
}

export default function EmployeeView() {
  const { t, i18n } = useTranslation();
  const { lng, scenarioId } = useParams();
  const navigate = useNavigate();
  const { scenarios, scenariosLoadError, loadScenariosFromServer, workPackages, notify } = useAppData();
  const activeLng = i18n.language || lng || "en";
  const viewFor = (s) => pickScenarioView(s, activeLng);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterWp, setFilterWp] = useState("");
  const [filterVerdict, setFilterVerdict] = useState(null);
  const [recentIds, setRecentIds] = useState(() => readRecentIds());
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => readFavoriteIds());
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const handleToggleFavorite = (id) => setFavoriteIds(toggleFavoriteId(id));
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef(null);
  const searching = Boolean(searchQuery.trim());

  const scenarioList = scenarios ?? [];
  const classifiedList = useMemo(
    () => scenarioList.filter((s) => viewFor(s)),
    [scenarioList, activeLng]
  );

  const wpOptions = useMemo(() => {
    const counts = new Map();
    for (const s of classifiedList) {
      for (const w of scenarioWpList(s)) counts.set(w, (counts.get(w) || 0) + 1);
    }
    const ordered = (workPackages || []).map((w) => w.label).filter((l) => counts.has(l));
    for (const l of counts.keys()) if (!ordered.includes(l)) ordered.push(l);
    return ordered.map((label) => ({ label, count: counts.get(label) }));
  }, [classifiedList, workPackages]);

  const selectedScenario = useMemo(() => {
    if (scenarioId == null || scenarioId === "") return null;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) return null;
    return scenarioList.find((s) => s.id === id) || null;
  }, [scenarioList, scenarioId]);

  const inWp = useMemo(
    () => classifiedList.filter((s) => !filterWp || scenarioWpList(s).includes(filterWp)),
    [classifiedList, filterWp]
  );

  const verdictCounts = useMemo(() => {
    const by = { to_be_rejected: 0, acceptable: 0, grey_area: 0 };
    for (const s of inWp) {
      for (const code of new Set(viewFor(s).situations.map((x) => x.verdict))) by[code] += 1;
    }
    return by;
  }, [inWp, activeLng]);

  const visibleVerdicts = VERDICT_ORDER.filter((code) => verdictCounts[code] > 0);

  const filteredScenarios = useMemo(() => {
    return inWp.filter((s) => {
      if (searching) {
        const verdictLabels = viewFor(s).situations.map((x) => t(`verdict.${x.verdict}`));
        return scenarioMatchesQuery(s, searchQuery, verdictLabels);
      }
      if (filterVerdict) return viewFor(s).situations.some((x) => x.verdict === filterVerdict);
      return true;
    });
  }, [inWp, searchQuery, filterVerdict, searching, t, activeLng]);

  const recentScenarios = useMemo(() => {
    const byId = new Map(classifiedList.map((s) => [s.id, s]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [classifiedList, recentIds]);

  const favoriteScenarios = useMemo(() => {
    const byId = new Map(classifiedList.map((s) => [s.id, s]));
    return favoriteIds.map((id) => byId.get(id)).filter(Boolean);
  }, [classifiedList, favoriteIds]);

  const openScenario = (scenario) => {
    if (!scenario) return;
    const next = pushRecentId(scenario.id);
    if (next) setRecentIds(next);
    else setRecentIds(readRecentIds());
    navigate(localePath(lng, "employee", String(scenario.id)));
    setNavOpen(false);
  };

  const closeDetail = () => {
    navigate(localePath(lng, "employee"));
  };

  useEffect(() => {
    if (filterWp && !wpOptions.some((w) => w.label === filterWp)) setFilterWp("");
  }, [filterWp, wpOptions]);

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  useEffect(() => {
    if (scenarios == null) return;
    if (scenarioId == null || scenarioId === "") return;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) {
      navigate(localePath(lng, "employee"), { replace: true });
      return;
    }
    const sc = scenarioList.find((s) => s.id === id);
    if (!sc || !pickScenarioView(sc, activeLng)) {
      navigate(localePath(lng, "employee"), { replace: true });
    }
  }, [scenarios, scenarioId, scenarioList, lng, navigate, activeLng]);

  useEffect(() => {
    if (selectedScenario) {
      const next = pushRecentId(selectedScenario.id);
      if (next) setRecentIds(next);
    }
  }, [selectedScenario?.id]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;

      if (e.key === "Escape") {
        if (navOpen) {
          setNavOpen(false);
          return;
        }
        if (selectedScenario) {
          closeDetail();
          return;
        }
        if (searching) {
          setSearchQuery("");
          return;
        }
        if (filterVerdict) {
          setFilterVerdict(null);
          return;
        }
        if (filterWp) setFilterWp("");
        return;
      }

      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
        if (narrow) setNavOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, selectedScenario, narrow, lng, searching, filterVerdict, filterWp]);

  const emptyMessage = () => {
    if (searching) return t("employee.emptySearch");
    if (filterVerdict) return t("employee.emptyVerdict");
    if (filterWp) return t("employee.emptyWp");
    if (scenarioList.length > 0) return t("employee.emptyLanguage");
    return t("employee.emptyPublished");
  };

  const selectedView = selectedScenario ? viewFor(selectedScenario) : null;

  return (
    <div style={{ ...styles.appWrap, height: "100vh", overflow: "hidden" }}>
      <nav
        className="no-print"
        style={{
          ...styles.sidebar,
          height: "100%",
          overflow: "hidden",
          ...(narrow
            ? {
                position: "fixed",
                inset: "0 auto 0 0",
                zIndex: 40,
                transform: navOpen ? "translateX(0)" : "translateX(-105%)",
                transition: "transform 0.2s ease",
                boxShadow: navOpen ? "8px 0 24px rgba(0,0,0,0.45)" : "none",
              }
            : null),
        }}
        aria-label={t("employee.navLabel")}
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarLogo}>QM</div>
          <div>
            <div style={styles.sidebarTitle}>{t("employee.title")}</div>
            <div style={styles.sidebarSub}>{t("employee.subtitle")}</div>
          </div>
        </div>
        <div style={{ padding: "0 1rem 1rem" }}>
          <LanguageSwitcher style={{ width: "100%", justifyContent: "center" }} />
        </div>
        <div style={{ position: "relative", margin: "0 1rem 0.35rem" }}>
          <input
            ref={searchRef}
            style={{ ...styles.searchInput, margin: 0, width: "100%", boxSizing: "border-box", paddingRight: searchQuery ? "2.5rem" : undefined }}
            placeholder={t("employee.searchPlaceholder")}
            aria-label={t("employee.searchAria")}
            title={t("employee.searchShortcutHint")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedScenario) closeDetail();
            }}
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label={t("employee.clearSearch")}
              onClick={() => {
                setSearchQuery("");
                searchRef.current?.focus();
              }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#8899aa",
                cursor: "pointer",
                fontSize: "1.1rem",
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        <div style={styles.sidebarGroup}>
          <div style={styles.sidebarGroupLabel}>{t("employee.wpSectionLabel")}</div>
          <Dropdown
            options={[
              { value: "", label: t("employee.allWps") },
              ...wpOptions.map((w) => ({ value: w.label, label: w.label, hint: w.count })),
            ]}
            value={filterWp}
            onChange={(next) => {
              setFilterWp(next);
              setFilterVerdict(null);
              if (selectedScenario) closeDetail();
              if (narrow) setNavOpen(false);
            }}
            searchPlaceholder={t("dropdown.search")}
            emptyText={t("dropdown.noResults")}
            ariaLabel={t("employee.wpSectionLabel")}
          />
        </div>

        {favoriteScenarios.length > 0 ? (
          <div style={styles.sidebarGroup}>
            <button
              type="button"
              onClick={() => setFavoritesExpanded((v) => !v)}
              aria-expanded={favoritesExpanded}
              style={styles.sidebarGroupToggle}
            >
              <span>{t("employee.favorites", { count: favoriteScenarios.length })}</span>
              <span aria-hidden="true">{favoritesExpanded ? "▲" : "▼"}</span>
            </button>
            {favoritesExpanded
              ? favoriteScenarios.map((s) => (
                  <button
                    key={`favorite-${s.id}`}
                    type="button"
                    style={{
                      ...styles.catBtn,
                      ...(selectedScenario?.id === s.id ? styles.catBtnActive : {}),
                    }}
                    onClick={() => openScenario(s)}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      ★ {viewFor(s).title}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}

        {recentScenarios.length > 0 ? (
          <div style={styles.sidebarGroup}>
            <button
              type="button"
              onClick={() => setRecentExpanded((v) => !v)}
              aria-expanded={recentExpanded}
              style={styles.sidebarGroupToggle}
            >
              <span>{t("employee.recent", { count: recentScenarios.length })}</span>
              <span aria-hidden="true">{recentExpanded ? "▲" : "▼"}</span>
            </button>
            {recentExpanded
              ? recentScenarios.map((s) => (
                  <button
                    key={`recent-${s.id}`}
                    type="button"
                    style={{
                      ...styles.catBtn,
                      ...(selectedScenario?.id === s.id ? styles.catBtnActive : {}),
                    }}
                    onClick={() => openScenario(s)}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {viewFor(s).title}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}

        <button
          type="button"
          style={{ ...styles.backBtn, marginTop: "auto" }}
          onClick={() => {
            navigate(localePath(lng));
          }}
        >
          {t("employee.backHome")}
        </button>
      </nav>
      {narrow && navOpen ? (
        <button
          type="button"
          className="no-print"
          aria-label={t("employee.closeMenu")}
          onClick={() => setNavOpen(false)}
          style={styles.navScrim}
        />
      ) : null}

      <main style={styles.main} id="employee-main">
        {narrow ? (
          <div className="no-print" style={styles.mobileBar}>
            <button type="button" style={styles.menuBtn} onClick={() => setNavOpen(true)}>
              {t("employee.menu")}
            </button>
            <span style={styles.mobileBarTitle}>
              {selectedView ? selectedView.title : filterWp || t("employee.allScenarios")}
            </span>
          </div>
        ) : null}
        {scenarios === null ? (
          <div style={styles.empty}>{t("employee.loading")}</div>
        ) : scenariosLoadError ? (
          <div style={styles.loadErrorBox}>
            <p style={styles.loadErrorText}>{scenariosLoadError}</p>
            <button type="button" style={styles.primaryBtn} onClick={loadScenariosFromServer}>
              {t("employee.retry")}
            </button>
          </div>
        ) : selectedScenario && selectedView ? (
          <ScenarioDetail
            scenario={selectedScenario}
            view={selectedView}
            onBack={closeDetail}
            onNotify={notify}
            isFavorite={favoriteIds.includes(selectedScenario.id)}
            onToggleFavorite={() => handleToggleFavorite(selectedScenario.id)}
          />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>{filterWp || t("employee.allScenarios")}</h2>
              <span style={styles.mainCount}>
                {searching
                  ? t("employee.filteredCount", { count: filteredScenarios.length })
                  : t("employee.proceduresCount", { count: filteredScenarios.length })}
              </span>
            </div>
            {!searching && visibleVerdicts.length > 1 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
                {visibleVerdicts.map((code) => {
                  const active = filterVerdict === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      style={{
                        ...styles.ghostBtn,
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.8rem",
                        ...(active ? verdictBadgeStyle(code) : {}),
                      }}
                      onClick={() => setFilterVerdict(active ? null : code)}
                    >
                      {t(`verdict.${code}`)} · {verdictCounts[code]}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {filteredScenarios.length === 0 ? (
              <div style={styles.empty}>{emptyMessage()}</div>
            ) : (
              <div style={styles.cardGrid}>
                {filteredScenarios.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    view={viewFor(s)}
                    openLabel={t("employee.open")}
                    onSelect={() => openScenario(s)}
                    isFavorite={favoriteIds.includes(s.id)}
                    onToggleFavorite={() => handleToggleFavorite(s.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
