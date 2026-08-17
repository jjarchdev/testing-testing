import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import ConfluenceView from "./ConfluenceView.jsx";
import { useAppData } from "./AppData.jsx";
import { pickTranslation, VERDICT_CODES } from "../shared/scenarioSchema.mjs";
import { ALL_FILTER, accentForCategory, buildCategoryCounts, localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { pushRecentId, readRecentIds } from "./recent.js";
import { styles } from "./styles.js";

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scenarioMatchesQuery(scenario, rawQuery) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const parts = [scenario.title, scenario.category, scenario.scenario, scenario.solution];
  if (Array.isArray(scenario.tags)) parts.push(...scenario.tags);
  const tr = scenario.translations || {};
  for (const lng of Object.keys(tr)) {
    const slot = tr[lng];
    if (!slot) continue;
    parts.push(slot.title, slot.scenario, slot.solution);
    if (Array.isArray(slot.tags)) parts.push(...slot.tags);
  }
  const haystack = normalizeSearchText(parts.filter(Boolean).join(" "));
  return q.split(" ").filter(Boolean).every((token) => haystack.includes(token));
}

function parseSolutionBlocks(solution) {
  const text = String(solution || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const NUM_RE = /^\s*(\d+)\.\s+(.+)$/;
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

function ScenarioCard({ scenario, view, onSelect, openLabel }) {
  const { t } = useTranslation();
  const color = accentForCategory(scenario.category);
  const text = view.scenario;
  const snippet = text.length > 100 ? `${text.slice(0, 100)}…` : text;
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
      <div style={styles.cardCat}>{scenario.category}</div>
      <VerdictBadge code={scenario.verdict} t={t} />
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

function ScenarioDetail({ scenario, view, onBack, onNotify }) {
  const { t } = useTranslation();
  const blocks = useMemo(
    () =>
      scenario.solution_as_checklist
        ? parseSolutionBlocks(view?.solution)
        : parseParagraphBlocks(view?.solution),
    [view?.solution, scenario.solution_as_checklist]
  );
  const stepTotal = useMemo(() => totalStepCount(blocks), [blocks]);
  const images = useMemo(() => scenarioImageUrls(scenario), [scenario]);
  const [checked, setChecked] = useState(() => ({}));
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const title = view?.title || scenario.title;
  const tags = Array.isArray(view?.tags) && view.tags.length ? view.tags : scenario.tags;

  useEffect(() => {
    setChecked({});
    setLightboxIndex(null);
  }, [scenario.id]);

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
      style={styles.detail}
      aria-labelledby="scenario-detail-title"
    >
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <button type="button" style={styles.detailBack} onClick={onBack}>
          {t("employee.backAll")}
        </button>
      </div>
      <div style={styles.detailCat}>{scenario.category}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {title}
      </h2>
      <div style={{ margin: "0 0 0.75rem" }}>
        <VerdictBadge code={scenario.verdict} t={t} />
      </div>
      {images.length > 0 ? (
        <div style={galleryStyle}>
          {images.map((url, i) => (
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
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
          ))}
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
          <img
            src={images[lightboxIndex]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(96vw, 1200px)",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 8,
              cursor: "default",
            }}
          />
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

      {view?.scenario ? (
        <div style={styles.detailSection}>
          <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
          <ParagraphText text={view.scenario} baseStyle={styles.detailBody} />
        </div>
      ) : null}
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>{t("employee.procedure")}</div>
        {blocks.map((block) =>
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
                        aria-label={t("employee.markStep")}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [step.key]: e.target.checked }))
                        }
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
        )}
      </div>
      <div style={styles.detailTags}>
        {tags.map((tag, i) => (
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
  const { scenarios, scenariosLoadError, loadScenariosFromServer, categories, notify } = useAppData();
  const activeLng = i18n.language || lng || "en";
  const viewFor = (s) => pickTranslation(s, activeLng);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState(ALL_FILTER);
  const [filterVerdict, setFilterVerdict] = useState(null);
  const [recentIds, setRecentIds] = useState(() => readRecentIds());
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef(null);
  const searching = Boolean(searchQuery.trim());

  const scenarioList = scenarios ?? [];
  const classifiedList = useMemo(
    () => scenarioList.filter((s) => viewFor(s) && VERDICT_CODES.includes(s.verdict)),
    [scenarioList, activeLng]
  );
  const categoryCounts = useMemo(() => buildCategoryCounts(classifiedList), [classifiedList]);
  const categoryLabels = useMemo(() => (categories || []).map((c) => c.label), [categories]);
  const allCategories = useMemo(() => [ALL_FILTER, ...categoryLabels], [categoryLabels]);

  const selectedScenario = useMemo(() => {
    if (scenarioId == null || scenarioId === "") return null;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) return null;
    return scenarioList.find((s) => s.id === id) || null;
  }, [scenarioList, scenarioId]);

  const inCategory = useMemo(
    () =>
      classifiedList.filter(
        (s) => filterCategory === ALL_FILTER || s.category === filterCategory
      ),
    [classifiedList, filterCategory]
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
      if (!matchesCat) return false;
      if (searching) return scenarioMatchesQuery(s, searchQuery);
      if (filterVerdict && s.verdict !== filterVerdict) return false;
      return true;
    });
  }, [classifiedList, searchQuery, filterCategory, filterVerdict, searching]);

  const recentScenarios = useMemo(() => {
    const byId = new Map(classifiedList.map((s) => [s.id, s]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [classifiedList, recentIds]);

  const showVerdictStep = !selectedScenario && !searching && !filterVerdict;

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
  }, [navOpen, selectedScenario, narrow, lng, searching, filterVerdict, filterCategory]);

  const emptyMessage = () => {
    if (searching) return t("employee.emptySearch");
    if (filterVerdict) return t("employee.emptyVerdict");
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

        {recentScenarios.length > 0 ? (
          <div style={{ padding: "0 0.5rem 0.75rem" }}>
            <div
              style={{
                padding: "0 0.75rem 0.35rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#4fa3ff",
              }}
            >
              {t("employee.recent")}
            </div>
            {recentScenarios.map((s) => (
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
            ))}
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
              {cat === ALL_FILTER ? t("common.all") : cat}
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
                      : filterCategory}
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
            onBack={closeDetail}
            onNotify={notify}
          />
        ) : showVerdictStep ? (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {filterCategory === ALL_FILTER ? t("employee.chooseVerdict") : filterCategory}
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
                  {searching
                    ? filterCategory === ALL_FILTER
                      ? t("employee.allScenarios")
                      : filterCategory
                    : t(`verdict.${filterVerdict}`)}
                </h2>
              </div>
              <span style={styles.mainCount}>
                {searching
                  ? t("employee.filteredCount", { count: filteredScenarios.length })
                  : t("employee.proceduresCount", { count: filteredScenarios.length })}
              </span>
            </div>
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
