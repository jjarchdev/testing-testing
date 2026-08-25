import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import ConfluenceView from "./ConfluenceView.jsx";
import { useAppData } from "./AppData.jsx";
import { pickTranslation, VERDICT_CODES } from "../shared/scenarioSchema.mjs";
import { ALL_FILTER, accentForCategory, buildCategoryCounts, localePath, formatCategoryLabel } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import {
  pushRecentId,
  readRecentIds,
  readFavoriteIds,
  toggleFavoriteId,
  readCheckedSteps,
  writeCheckedSteps,
} from "./recent.js";
import { styles } from "./styles.js";

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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scenarioMatchesQuery(scenario, rawQuery, extraParts = []) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const parts = [
    scenario.title,
    scenario.category,
    scenario.category_wp,
    ...(Array.isArray(scenario.category_wps) ? scenario.category_wps : []),
    scenario.scenario,
    scenario.solution,
    scenario.verdict,
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
                {step.text}
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
                {ln}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function scenarioImageUrls(scenario) {
  if (Array.isArray(scenario?.image_urls) && scenario.image_urls.length) {
    return scenario.image_urls.filter((u) => typeof u === "string" && u.trim());
  }
  if (typeof scenario?.image_url === "string" && scenario.image_url.trim()) {
    return [scenario.image_url.trim()];
  }
  return [];
}

function categoryWps(scenario, wpsByLabel) {
  if (Array.isArray(scenario?.category_wps) && scenario.category_wps.length) {
    return scenario.category_wps.map((w) => String(w).trim()).filter(Boolean);
  }
  const fromCat = wpsByLabel?.[scenario?.category];
  if (Array.isArray(fromCat) && fromCat.length) return fromCat;
  const one = String(scenario?.category_wp || "").trim();
  return one ? one.split(/,\s*/).filter(Boolean) : [];
}

function ScenarioCard({ scenario, view, onSelect, openLabel, categoryWp, isFavorite, onToggleFavorite }) {
  const { t } = useTranslation();
  const color = accentForCategory(scenario.category);
  const text = view.scenario;
  const snippet = truncateAtWord(text, 100);
  const images = scenarioImageUrls(scenario);
  const imageUrl = images[0] || "";
  const title = view.title || scenario.title;
  const tags = Array.isArray(view.tags) && view.tags.length ? view.tags : scenario.tags;

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
      <div style={styles.cardCat}>{formatCategoryLabel(scenario.category, categoryWp)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <VerdictBadge code={scenario.verdict} t={t} />
        {scenario.solution_as_checklist || scenario.acceptance_as_checklist ? (
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
      <h3 style={styles.cardTitle}>{title}</h3>
      <p style={styles.cardSnippet}>{snippet}</p>
      <div style={styles.cardTags}>
        {tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
      <div style={styles.cardArrow}>{openLabel}</div>
    </div>
  );
}

export function ScenarioDetail({ scenario, view, onBack, onNotify, categoryWp, isFavorite, onToggleFavorite }) {
  const { t } = useTranslation();
  const blocks = useMemo(
    () =>
      scenario.solution_as_checklist
        ? parseSolutionBlocks(view?.solution)
        : parseParagraphBlocks(view?.solution),
    [view?.solution, scenario.solution_as_checklist]
  );
  const acceptanceText = (view?.acceptance || "").trim();
  const acceptanceBlocks = useMemo(
    () => {
      if (!acceptanceText) return [];
      return scenario.acceptance_as_checklist
        ? prefixBlockKeys(parseSolutionBlocks(view?.acceptance), "ac-")
        : prefixBlockKeys(parseParagraphBlocks(view?.acceptance), "ac-");
    },
    [view?.acceptance, scenario.acceptance_as_checklist, acceptanceText]
  );
  const stepTotal = useMemo(
    () => totalStepCount(blocks) + totalStepCount(acceptanceBlocks),
    [blocks, acceptanceBlocks]
  );
  const images = useMemo(() => scenarioImageUrls(scenario), [scenario]);
  const imageCaptions =
    scenario.image_captions && typeof scenario.image_captions === "object" ? scenario.image_captions : {};
  const persistProgress = Number.isFinite(Number(scenario.id));
  const [checked, setChecked] = useState(() => (persistProgress ? readCheckedSteps(scenario.id) : {}));
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.5;
  const handleToggleStep = (key, value) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: value };
      if (persistProgress) writeCheckedSteps(scenario.id, next);
      return next;
    });
  };
  const title = view?.title || scenario.title;
  const tags = Array.isArray(view?.tags) && view.tags.length ? view.tags : scenario.tags;
  const narrow = useIsNarrow();
  const hasSidebar = !narrow && Boolean(acceptanceText);

  useEffect(() => {
    setChecked(persistProgress ? readCheckedSteps(scenario.id) : {});
    setLightboxIndex(null);
  }, [scenario.id]);

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
    const bodyParts = [title, ""];
    if (view?.scenario) {
      bodyParts.push(`${t("employee.situation")}:`, view.scenario, "");
    }
    bodyParts.push(`${t("employee.procedure")}:`);
    for (const b of blocks) {
      if (b.type === "steps") {
        for (const s of b.steps) bodyParts.push(`${s.num}. ${s.text}`);
      } else {
        bodyParts.push(b.text);
      }
      bodyParts.push("");
    }
    if (acceptanceText) {
      bodyParts.push(`${t("employee.acceptance")}:`);
      for (const b of acceptanceBlocks) {
        if (b.type === "steps") {
          for (const s of b.steps) bodyParts.push(`${s.num}. ${s.text}`);
        } else {
          bodyParts.push(b.text);
        }
        bodyParts.push("");
      }
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

  return (
    <article
      className="print-root"
      style={hasSidebar ? { ...styles.detail, maxWidth: 1120 } : styles.detail}
      aria-labelledby="scenario-detail-title"
    >
      <div
        className="no-print"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", justifyContent: "space-between", alignItems: "center" }}
      >
        <button type="button" style={styles.detailBack} onClick={onBack}>
          {t("employee.backAll")}
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
      <div style={styles.detailCat}>{formatCategoryLabel(scenario.category, categoryWp)}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {title}
      </h2>
      <div style={{ margin: "0 0 0.75rem" }}>
        <VerdictBadge code={scenario.verdict} t={t} />
      </div>
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
                style={{
                  maxWidth: "min(96vw, 1200px)",
                  maxHeight: "78vh",
                  objectFit: "contain",
                  borderRadius: 8,
                  cursor: "default",
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 120ms ease",
                }}
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
        <button type="button" style={styles.ghostBtn} onClick={() => window.print()}>
          {t("employee.print")}
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
          {view?.scenario ? (
            <div style={styles.detailSection}>
              <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
              <ParagraphText text={view.scenario} baseStyle={styles.detailBody} />
            </div>
          ) : null}
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
          <div style={styles.detailTags}>
            {tags.map((tag, i) => (
              <span key={`${tag}-${i}`} style={styles.tagLarge}>
                {tag}
              </span>
            ))}
          </div>
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
  const { scenarios, scenariosLoadError, loadScenariosFromServer, categories, notify } = useAppData();
  const activeLng = i18n.language || lng || "en";
  const viewFor = (s) => pickTranslation(s, activeLng);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState(ALL_FILTER);
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
    () => scenarioList.filter((s) => viewFor(s) && VERDICT_CODES.includes(s.verdict)),
    [scenarioList, activeLng]
  );
  const categoryLabels = useMemo(() => (categories || []).map((c) => c.label), [categories]);
  const allCategories = useMemo(() => [ALL_FILTER, ...categoryLabels], [categoryLabels]);
  const wpsByLabel = useMemo(() => {
    const m = Object.create(null);
    for (const c of categories || []) {
      m[c.label] = Array.isArray(c.wps) ? c.wps : c.wp ? [c.wp] : [];
    }
    return m;
  }, [categories]);
  const wpValues = useMemo(() => {
    const set = new Set();
    for (const c of categories || []) {
      const list = Array.isArray(c.wps) ? c.wps : c.wp ? [c.wp] : [];
      for (const w of list) {
        const label = String(w || "").trim();
        if (label) set.add(label);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categories]);
  const categoryCounts = useMemo(() => {
    const forWp = classifiedList.filter(
      (s) => !filterWp || categoryWps(s, wpsByLabel).includes(filterWp)
    );
    return buildCategoryCounts(forWp);
  }, [classifiedList, filterWp, wpsByLabel]);

  const selectedScenario = useMemo(() => {
    if (scenarioId == null || scenarioId === "") return null;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) return null;
    return scenarioList.find((s) => s.id === id) || null;
  }, [scenarioList, scenarioId]);

  const inCategory = useMemo(
    () =>
      classifiedList.filter((s) => {
        const matchesCat = filterCategory === ALL_FILTER || s.category === filterCategory;
        const matchesWp = !filterWp || categoryWps(s, wpsByLabel).includes(filterWp);
        return matchesCat && matchesWp;
      }),
    [classifiedList, filterCategory, filterWp, wpsByLabel]
  );

  const verdictCounts = useMemo(() => {
    const by = { to_be_rejected: 0, acceptable: 0, grey_area: 0 };
    for (const s of inCategory) {
      if (by[s.verdict] != null) by[s.verdict] += 1;
    }
    return by;
  }, [inCategory]);

  const visibleVerdicts = useMemo(
    () => VERDICT_CODES.filter((code) => verdictCounts[code] > 0),
    [verdictCounts]
  );

  const filteredScenarios = useMemo(() => {
    return classifiedList.filter((s) => {
      const matchesCat = filterCategory === ALL_FILTER || s.category === filterCategory;
      const matchesWp = !filterWp || categoryWps(s, wpsByLabel).includes(filterWp);
      if (!matchesCat || !matchesWp) return false;
      if (searching) {
        const verdictLabel = VERDICT_CODES.includes(s.verdict) ? t(`verdict.${s.verdict}`) : "";
        return scenarioMatchesQuery(s, searchQuery, [verdictLabel, ...categoryWps(s, wpsByLabel)]);
      }
      if (filterVerdict && s.verdict !== filterVerdict) return false;
      return true;
    });
  }, [classifiedList, searchQuery, filterCategory, filterWp, filterVerdict, searching, t, wpsByLabel]);

  const recentScenarios = useMemo(() => {
    const byId = new Map(classifiedList.map((s) => [s.id, s]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [classifiedList, recentIds]);

  const favoriteScenarios = useMemo(() => {
    const byId = new Map(classifiedList.map((s) => [s.id, s]));
    return favoriteIds.map((id) => byId.get(id)).filter(Boolean);
  }, [classifiedList, favoriteIds]);

  const SKIP_VERDICT_STEP_MAX = 4;
  const showVerdictStep =
    !selectedScenario &&
    !searching &&
    !filterVerdict &&
    visibleVerdicts.length > 1 &&
    inCategory.length > SKIP_VERDICT_STEP_MAX;

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
    if (filterWp && !wpValues.includes(filterWp)) setFilterWp("");
  }, [filterWp, wpValues]);

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
    if (!scenarioList.some((s) => s.id === id)) {
      navigate(localePath(lng, "employee"), { replace: true });
      return;
    }
    const sc = scenarioList.find((s) => s.id === id);
    if (sc && !pickTranslation(sc, activeLng)) {
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
        if (filterWp) {
          setFilterWp("");
          return;
        }
        if (filterCategory !== ALL_FILTER) {
          setFilterCategory(ALL_FILTER);
        }
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
  }, [navOpen, selectedScenario, narrow, lng, searching, filterVerdict, filterCategory, filterWp]);

  const emptyMessage = () => {
    if (searching) return t("employee.emptySearch");
    if (filterVerdict) return t("employee.emptyVerdict");
    if (filterWp) return t("employee.emptyWp");
    if (filterCategory !== ALL_FILTER) return t("employee.emptyCategory");
    if (classifiedList.length > 0) return t("employee.emptyLanguage");
    return t("employee.emptyPublished");
  };

  return (
    <div style={styles.appWrap}>
      <nav
        className="no-print"
        style={{
          ...styles.sidebar,
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
        <div style={{ padding: "0 1rem 0.75rem", color: "#8899aa", fontSize: "0.72rem" }}>
          {t("employee.searchShortcutHint")}
        </div>
        {wpValues.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.35rem",
              padding: "0 1rem 0.85rem",
            }}
          >
            <button
              type="button"
              style={{
                ...styles.ghostBtn,
                padding: "0.3rem 0.65rem",
                fontSize: "0.75rem",
                ...(filterWp === "" ? { borderColor: "#4fa3ff", color: "#4fa3ff" } : {}),
              }}
              onClick={() => {
                setFilterWp("");
                setFilterVerdict(null);
                if (selectedScenario) closeDetail();
              }}
            >
              {t("employee.allWps")}
            </button>
            {wpValues.map((w) => (
              <button
                key={w}
                type="button"
                style={{
                  ...styles.ghostBtn,
                  padding: "0.3rem 0.65rem",
                  fontSize: "0.75rem",
                  ...(filterWp === w ? { borderColor: "#4fa3ff", color: "#4fa3ff" } : {}),
                }}
                onClick={() => {
                  setFilterWp(w);
                  setFilterVerdict(null);
                  if (selectedScenario) closeDetail();
                }}
              >
                {w}
              </button>
            ))}
          </div>
        ) : null}

        {favoriteScenarios.length > 0 ? (
          <div style={{ padding: "0 0.5rem 0.75rem" }}>
            <button
              type="button"
              onClick={() => setFavoritesExpanded((v) => !v)}
              aria-expanded={favoritesExpanded}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0 0.75rem 0.35rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#4fa3ff",
                fontFamily: "inherit",
              }}
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
                      ★ {s.title}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}

        {recentScenarios.length > 0 ? (
          <div style={{ padding: "0 0.5rem 0.75rem" }}>
            <button
              type="button"
              onClick={() => setRecentExpanded((v) => !v)}
              aria-expanded={recentExpanded}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0 0.75rem 0.35rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#4fa3ff",
                fontFamily: "inherit",
              }}
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
                      {s.title}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}

        <div style={styles.catList}>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              style={{
                ...styles.catBtn,
                ...(filterCategory === cat ? styles.catBtnActive : {}),
              }}
              onClick={() => {
                setFilterCategory(cat);
                setFilterVerdict(null);
                if (selectedScenario) closeDetail();
                setNavOpen(false);
              }}
            >
              {cat === ALL_FILTER ? (
                t("common.all")
              ) : (
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, marginRight: 8 }}>
                  <span>{cat}</span>
                  {wpsByLabel[cat]?.length ? (
                    <span style={{ fontSize: "0.72rem", color: "#8899aa", fontWeight: 600 }}>
                      {wpsByLabel[cat].join(", ")}
                    </span>
                  ) : null}
                </span>
              )}
              <span style={styles.catCount}>
                {cat === ALL_FILTER ? categoryCounts.total : categoryCounts.by[cat] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          style={styles.backBtn}
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
              {selectedScenario
                ? selectedScenario.title
                : searching
                  ? t("employee.allScenarios")
                  : filterVerdict
                    ? t(`verdict.${filterVerdict}`)
                    : filterCategory === ALL_FILTER
                      ? t("employee.chooseVerdict")
                      : formatCategoryLabel(filterCategory, wpsByLabel[filterCategory])}
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
        ) : selectedScenario && viewFor(selectedScenario) ? (
          <ScenarioDetail
            scenario={selectedScenario}
            view={viewFor(selectedScenario)}
            categoryWp={categoryWps(selectedScenario, wpsByLabel)}
            onBack={closeDetail}
            onNotify={notify}
            isFavorite={favoriteIds.includes(selectedScenario.id)}
            onToggleFavorite={() => handleToggleFavorite(selectedScenario.id)}
          />
        ) : showVerdictStep ? (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {filterCategory === ALL_FILTER
                  ? t("employee.chooseVerdict")
                  : formatCategoryLabel(filterCategory, wpsByLabel[filterCategory])}
              </h2>
              <span style={styles.mainCount}>
                {t("employee.proceduresCount", { count: inCategory.length })}
              </span>
            </div>
            {visibleVerdicts.length === 0 ? (
              <div style={styles.empty}>{emptyMessage()}</div>
            ) : (
              <div style={styles.cardGrid}>
                {visibleVerdicts.map((code) => (
                  <div
                    key={code}
                    role="button"
                    tabIndex={0}
                    style={styles.card}
                    onClick={() => setFilterVerdict(code)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFilterVerdict(code);
                      }
                    }}
                  >
                    <div
                      style={{
                        ...styles.cardAccent,
                        background:
                          code === "to_be_rejected"
                            ? "#e74c3c"
                            : code === "acceptable"
                              ? "#1abc9c"
                              : "#e67e22",
                      }}
                    />
                    <h3 style={styles.cardTitle}>{t(`verdict.${code}`)}</h3>
                    <p style={styles.cardSnippet}>
                      {t("employee.proceduresCount", { count: verdictCounts[code] })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={styles.mainHeader}>
              <div>
                {!searching && filterVerdict ? (
                  <button type="button" style={styles.detailBack} onClick={() => setFilterVerdict(null)}>
                    {t("employee.backToVerdicts")}
                  </button>
                ) : null}
                <h2 style={styles.mainTitle}>
                  {searching || !filterVerdict
                    ? filterCategory === ALL_FILTER
                      ? t("employee.allScenarios")
                      : formatCategoryLabel(filterCategory, wpsByLabel[filterCategory])
                    : t(`verdict.${filterVerdict}`)}
                </h2>
              </div>
              <span style={styles.mainCount}>
                {searching
                  ? t("employee.filteredCount", { count: filteredScenarios.length })
                  : t("employee.proceduresCount", { count: filteredScenarios.length })}
              </span>
            </div>
            {!searching && !filterVerdict && visibleVerdicts.length > 1 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
                {visibleVerdicts.map((code) => (
                  <button
                    key={code}
                    type="button"
                    style={{ ...styles.ghostBtn, padding: "0.3rem 0.65rem", fontSize: "0.8rem" }}
                    onClick={() => setFilterVerdict(code)}
                  >
                    {t(`verdict.${code}`)} · {verdictCounts[code]}
                  </button>
                ))}
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
                    categoryWp={categoryWps(s, wpsByLabel)}
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
