import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ImageLightbox from "./ImageLightbox.jsx";
import { PhotoFrame, PhotoTile } from "./PhotoGrid.jsx";
import { BookIcon, ImageIcon } from "./icons.jsx";
import { ParagraphText } from "./richText.jsx";
import { LANG_LABELS } from "./translation.jsx";
import { accentForLabel, pressableProps } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { styles } from "./styles.js";

const SIDEBAR_GUIDES = 6;

const clamp = (lines) => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
});

export function KbSidebarGroup({ items, activeId, listActive, onOpenList, onOpenGuide, inKb, onBackToScenarios }) {
  const { t } = useTranslation();
  const shown = items.slice(0, SIDEBAR_GUIDES);
  return (
    <div style={styles.sidebarGroup}>
      <div style={styles.sidebarGroupLabel}>{t("kb.navLabel")}</div>
      {inKb ? (
        <button
          type="button"
          onClick={onBackToScenarios}
          style={{
            ...styles.ghostBtn,
            width: "100%",
            justifyContent: "center",
            padding: "0.6rem 0.75rem",
            fontSize: "0.9rem",
            marginBottom: "0.6rem",
            border: "1px solid #4fa3ff",
            background: "rgba(79, 163, 255, 0.08)",
            color: "#4fa3ff",
          }}
        >
          {t("kb.backToScenarios")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpenList}
        aria-current={listActive ? "page" : undefined}
        title={t("kb.open")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          width: "100%",
          padding: "0.65rem 0.75rem",
          marginBottom: "0.4rem",
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          border: `1px solid ${listActive ? "#4fa3ff" : "#1a2a3a"}`,
          background: listActive ? "rgba(79, 163, 255, 0.14)" : "linear-gradient(135deg, #12263a, #0f1d2c)",
          color: "#eaf0fb",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "#1a6bd2",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BookIcon />
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left", gap: 1 }}>
          <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{t("kb.title")}</span>
          <span style={{ fontSize: "0.75rem", color: "#8899aa" }}>
            {t("kb.subtitle")} · {items.length}
          </span>
        </span>
      </button>
      {shown.map(({ guide, view }) => (
        <button
          key={guide.id}
          type="button"
          style={{ ...styles.catBtn, width: "100%", ...(activeId === guide.id ? styles.catBtnActive : {}) }}
          onClick={() => onOpenGuide(guide)}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {view.title}
          </span>
        </button>
      ))}
      {items.length > SIDEBAR_GUIDES ? (
        <button
          type="button"
          onClick={onOpenList}
          style={{ ...styles.catBtn, width: "100%", color: "#4fa3ff", fontWeight: 600 }}
        >
          {t("kb.seeAll", { count: items.length })}
        </button>
      ) : null}
    </div>
  );
}

function GuideCard({ guide, view, onOpen, compact = false }) {
  const { t } = useTranslation();
  const cover = view.steps.find((s) => s.image_url)?.image_url || "";
  const wps = guide.wps || [];
  const accent = accentForLabel(wps[0] || "");
  return (
    <div {...pressableProps(onOpen)} style={{ ...styles.card, padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ ...styles.cardAccent, background: accent, zIndex: 1 }} />
      {cover ? (
        <PhotoFrame url={cover} aspect="4 / 3" />
      ) : (
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            aspectRatio: "4 / 3",
            background: "#0b131d",
            color: "#2f4358",
            transform: "none",
          }}
        >
          <span style={{ transform: "scale(3)" }}>
            <BookIcon />
          </span>
        </span>
      )}
      <div
        style={{
          padding: compact ? "0.55rem 0.65rem 0.7rem" : "0.75rem 0.9rem 0.9rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ ...styles.cardCat, margin: 0, fontSize: compact ? "0.62rem" : "0.68rem", ...clamp(1) }}>
          {wps.length ? wps.join(" · ") : t("kb.general")}
        </div>
        <h3 style={{ ...styles.cardTitle, margin: 0, fontSize: compact ? "0.88rem" : "1rem", ...clamp(2) }}>
          {view.title}
        </h3>
        {view.summary && !compact ? (
          <p style={{ ...styles.cardSnippet, margin: 0, fontSize: "0.82rem", ...clamp(2) }}>{view.summary}</p>
        ) : null}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.35rem",
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#8899aa",
            fontSize: "0.78rem",
          }}
        >
          <ImageIcon /> {t("kb.stepsCount", { count: view.steps.length })}
        </div>
      </div>
    </div>
  );
}

export function GuideGrid({ items, onOpen }) {
  const phone = useIsNarrow(560);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: phone ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(210px, 1fr))",
        gap: phone ? "0.6rem" : "0.9rem",
      }}
    >
      {items.map(({ guide, view }) => (
        <GuideCard key={guide.id} guide={guide} view={view} compact={phone} onOpen={() => onOpen(guide)} />
      ))}
    </div>
  );
}

export function GuideViewer({ guide, view, onBack, onBackToScenarios }) {
  const { t } = useTranslation();
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const total = view.steps.length;
  const wps = guide.wps || [];

  const lightboxImages = useMemo(
    () =>
      view.steps
        .map((step, i) => ({ step, i }))
        .filter(({ step }) => step.image_url)
        .map(({ step, i }) => ({
          url: step.image_url,
          caption: step.text,
          title: t("kb.stepOf", { n: i + 1, total }),
        })),
    [view, total, t]
  );
  const lightboxPosition = (stepIndex) => view.steps.slice(0, stepIndex).filter((s) => s.image_url).length;

  return (
    <article className="print-root" style={{ maxWidth: 1120 }} aria-labelledby="guide-title">
      <div
        className="no-print"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" style={styles.smallBtn} onClick={onBack}>
            {t("kb.backToGuides")}
          </button>
          {onBackToScenarios ? (
            <button type="button" style={styles.smallBtn} onClick={onBackToScenarios}>
              {t("kb.backToScenarios")}
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {lightboxImages.length > 0 ? (
            <button type="button" style={styles.smallBtn} onClick={() => setLightboxIndex(0)}>
              {t("kb.startSteps")}
            </button>
          ) : null}
          <button type="button" style={styles.smallBtn} onClick={() => window.print()}>
            {t("employee.print")}
          </button>
        </div>
      </div>
      <div style={styles.detailCat}>{wps.length ? wps.join(" · ") : t("kb.general")}</div>
      <h2 id="guide-title" style={{ ...styles.detailTitle, marginBottom: "0.75rem" }}>
        {view.title}
      </h2>
      {view.summary ? (
        <p style={{ color: "#b7c4d4", fontSize: "1.02rem", lineHeight: 1.6, maxWidth: 760, margin: "0 0 1rem" }}>
          {view.summary}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#8899aa", fontSize: "0.85rem", fontWeight: 600 }}>
          <ImageIcon /> {t("kb.stepsCount", { count: total })}
        </span>
        {view.fallback ? (
          <span style={{ ...styles.tag, background: "rgba(230, 126, 34, 0.14)", color: "#e67e22" }}>
            {t("kb.shownIn", { lang: LANG_LABELS[view.language] || view.language })}
          </span>
        ) : null}
        {view.tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tag}>
            {tag}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: "1rem" }}>
        {view.steps.map((step, i) => {
          const n = i + 1;
          return (
            <section
              key={step.id}
              className="guide-step"
              style={{
                background: "#111e2c",
                border: "1px solid #1a2a3a",
                borderRadius: 12,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {step.image_url ? (
                <PhotoTile
                  url={step.image_url}
                  caption={step.text}
                  aspect="4 / 3"
                  badge={n}
                  ariaLabel={t("kb.openStep", { n })}
                  onClick={() => setLightboxIndex(lightboxPosition(i))}
                  style={{ borderRadius: 0, border: "none" }}
                />
              ) : null}
              {step.text || !step.image_url ? (
                <div style={{ padding: "0.85rem 1rem 1rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  {!step.image_url ? <span style={styles.stepNum}>{n}</span> : null}
                  <div style={{ flex: 1, minWidth: 0, color: "#eaf0fb", fontSize: "0.95rem", lineHeight: 1.55, overflowWrap: "anywhere" }}>
                    <ParagraphText text={step.text} baseStyle={{ margin: "0 0 0.4rem" }} />
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {lightboxIndex != null && lightboxImages[lightboxIndex] ? (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          richCaption
        />
      ) : null}
    </article>
  );
}
