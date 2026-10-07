import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ConfluenceView from "./ConfluenceView.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import PhotoGrid, { PhotoCountBadge, PhotoFrame } from "./PhotoGrid.jsx";
import { ChecklistIcon, ImageIcon } from "./icons.jsx";
import { ParagraphText } from "./richText.jsx";
import {
  SolutionBlockList,
  VERDICT_COLORS,
  VERDICT_ORDER,
  VerdictBadge,
  parseParagraphBlocks,
  parseSolutionBlocks,
  prefixBlockKeys,
  totalStepCount,
  truncateAtWord,
} from "./scenarioUi.jsx";
import { scenarioWpList } from "../shared/scenarioSchema.mjs";
import { useIsNarrow } from "./useIsNarrow.js";
import { pressableProps } from "./utils.js";
import { readCheckedSteps, readWideLayout, writeCheckedSteps, writeWideLayout } from "./localState.js";
import { styles } from "./styles.js";

function toPhotos(urls, captions) {
  return (urls || []).map((url) => ({ url, caption: (captions && captions[url]) || "" }));
}

function SituationCard({ situation, number, onOpen }) {
  const { t } = useTranslation();
  const color = VERDICT_COLORS[situation.verdict] || VERDICT_COLORS.grey_area;
  const acceptancePhotos = situation.acceptance_image_urls || [];
  const cover = situation.image_urls[0] || acceptancePhotos[0] || "";
  const photoCount = situation.image_urls.length + acceptancePhotos.length;
  const stepCount = useMemo(
    () => (situation.solution_as_checklist ? totalStepCount(parseSolutionBlocks(situation.solution)) : 0),
    [situation.solution, situation.solution_as_checklist]
  );
  const snippet = truncateAtWord(situation.scenario.replace(/\s+/g, " ").trim(), 140);

  return (
    <div {...pressableProps(onOpen)} style={{ ...styles.card, padding: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ ...styles.cardAccent, background: color, zIndex: 1 }} />
      {cover ? (
        <PhotoFrame url={cover} aspect="16 / 10">
          {photoCount > 1 ? (
            <PhotoCountBadge>
              <ImageIcon /> {photoCount}
            </PhotoCountBadge>
          ) : null}
        </PhotoFrame>
      ) : null}
      <div style={{ padding: "0.9rem 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5c7186" }}>
            {t("employee.situationN", { n: number })}
          </span>
        </div>
        <div style={{ color: "#eaf0fb", fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {snippet}
        </div>
        <div
          style={{
            marginTop: "auto",
            paddingTop: "0.35rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#8899aa", fontSize: "0.78rem" }}>
            {stepCount ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ChecklistIcon /> {t("employee.stepsCount", { count: stepCount })}
              </span>
            ) : null}
            {photoCount ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ImageIcon /> {t("employee.photosCount", { count: photoCount })}
              </span>
            ) : null}
          </span>
          <span style={styles.cardArrow}>{t("employee.open")}</span>
        </div>
      </div>
    </div>
  );
}

function SituationBody({ scenario, situation, title, narrow, onNotify }) {
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
  const photos = useMemo(
    () => toPhotos(situation.image_urls, situation.image_captions),
    [situation.image_urls, situation.image_captions]
  );
  const acceptancePhotos = useMemo(
    () => toPhotos(situation.acceptance_image_urls, situation.acceptance_image_captions),
    [situation.acceptance_image_urls, situation.acceptance_image_captions]
  );
  const [checked, setChecked] = useState(() => (persistProgress ? readCheckedSteps(progressKey) : {}));
  const [lightbox, setLightbox] = useState(null);
  const hasAcceptance = Boolean(acceptanceText) || acceptancePhotos.length > 0;
  const hasSidebar = !narrow && hasAcceptance;
  const doneCount = Object.values(checked).filter(Boolean).length;
  const lightboxImages = lightbox ? (lightbox.group === "acceptance" ? acceptancePhotos : photos) : [];

  const handleToggleStep = (key, value) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: value };
      if (persistProgress) writeCheckedSteps(progressKey, next);
      return next;
    });
  };

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

  const openLabel = (n) => t("employee.openImage", { n });

  const acceptanceSection = hasAcceptance ? (
    <section style={styles.detailSection}>
      <div style={styles.detailSectionLabel}>{t("employee.acceptance")}</div>
      <SolutionBlockList
        blocks={acceptanceBlocks}
        checked={checked}
        markLabel={t("employee.markStep")}
        onToggle={handleToggleStep}
      />
      {acceptancePhotos.length > 0 ? (
        <div style={{ marginTop: acceptanceText ? "1rem" : 0 }}>
          <PhotoGrid
            images={acceptancePhotos}
            openLabel={openLabel}
            minWidth={narrow ? 128 : hasSidebar ? 130 : 170}
            onOpen={(index) => setLightbox({ group: "acceptance", index })}
          />
        </div>
      ) : null}
    </section>
  ) : null;

  return (
    <>
      <div
        style={
          hasSidebar
            ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 380px)", gap: "1.25rem", alignItems: "start" }
            : undefined
        }
      >
        <div>
          <section style={styles.detailSection}>
            <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
            <ParagraphText text={situation.scenario} baseStyle={styles.detailBody} />
            {photos.length > 0 ? (
              <div style={{ marginTop: "1.1rem" }}>
                <PhotoGrid
                  images={photos}
                  openLabel={openLabel}
                  minWidth={narrow ? (photos.length === 1 ? 220 : 128) : photos.length === 1 ? 280 : 160}
                  onOpen={(index) => setLightbox({ group: "situation", index })}
                />
              </div>
            ) : null}
          </section>
          <section style={styles.detailSection}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginBottom: "0.75rem",
              }}
            >
              <div style={{ ...styles.detailSectionLabel, marginBottom: 0 }}>{t("employee.procedure")}</div>
              <div className="no-print" style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                {stepTotal > 0 ? (
                  <span style={{ color: "#8899aa", fontSize: "0.85rem", fontWeight: 600 }}>
                    {t("employee.stepsProgress", { done: doneCount, total: stepTotal })}
                  </span>
                ) : null}
                <button type="button" style={{ ...styles.ghostBtn, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={copyProcedure}>
                  {t("employee.copyProcedure")}
                </button>
              </div>
            </div>
            <SolutionBlockList
              blocks={blocks}
              checked={checked}
              markLabel={t("employee.markStep")}
              onToggle={handleToggleStep}
            />
          </section>
          {!hasSidebar ? acceptanceSection : null}
        </div>
        {hasSidebar ? <aside>{acceptanceSection}</aside> : null}
      </div>

      {lightbox && lightboxImages[lightbox.index] ? (
        <ImageLightbox
          images={lightboxImages}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox({ ...lightbox, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

function SituationNav({ situations, activeIndex, onSelect }) {
  const { t } = useTranslation();
  const prev = situations[activeIndex - 1];
  const next = situations[activeIndex + 1];
  return (
    <div
      className="no-print"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.1rem" }}
    >
      <button type="button" style={{ ...styles.smallBtn, fontSize: "0.85rem" }} onClick={() => onSelect(null)}>
        {t("employee.allSituations")}
      </button>
      <div role="group" aria-label={t("employee.situationSwitcher")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {situations.map((s, i) => {
          const color = VERDICT_COLORS[s.verdict] || VERDICT_COLORS.grey_area;
          const active = i === activeIndex;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={active ? "true" : undefined}
              title={`${t("employee.situationN", { n: i + 1 })} · ${t(`verdict.${s.verdict}`)}`}
              onClick={() => onSelect(s.id)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: `1.5px solid ${color}`,
                background: active ? color : "transparent",
                color: active ? "#0d1520" : color,
                fontWeight: 800,
                fontSize: "0.85rem",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          aria-label={t("employee.prevSituation")}
          title={t("employee.prevSituation")}
          disabled={!prev}
          onClick={() => prev && onSelect(prev.id)}
          style={{ ...styles.smallBtn, padding: "0.35rem 0.75rem", opacity: prev ? 1 : 0.4 }}
        >
          ‹
        </button>
        <span style={{ color: "#8899aa", fontSize: "0.85rem", fontWeight: 600 }}>
          {t("employee.situationOf", { n: activeIndex + 1, total: situations.length })}
        </span>
        <button
          type="button"
          aria-label={t("employee.nextSituation")}
          title={t("employee.nextSituation")}
          disabled={!next}
          onClick={() => next && onSelect(next.id)}
          style={{ ...styles.smallBtn, padding: "0.35rem 0.75rem", opacity: next ? 1 : 0.4 }}
        >
          ›
        </button>
      </div>
    </div>
  );
}

function GroupHeader({ code, count, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.7rem" }}>
      <VerdictBadge code={code} t={t} />
      <span style={{ color: "#5c7186", fontSize: "0.8rem", fontWeight: 700 }}>{count}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: "#1a2a3a" }} />
    </div>
  );
}

export function ScenarioDetail({
  scenario,
  view,
  onBack,
  onNotify,
  isFavorite,
  onToggleFavorite,
  situationId,
  onSelectSituation,
}) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const wps = scenarioWpList(scenario);
  const situations = view.situations;
  const single = situations.length === 1;
  const controlled = typeof onSelectSituation === "function";
  const [localId, setLocalId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [wideLayout, setWideLayout] = useState(() => readWideLayout());
  const articleRef = useRef(null);

  const activeId = single ? situations[0].id : controlled ? situationId || null : localId;
  const previousActiveId = useRef(activeId);
  const activeIndex = situations.findIndex((s) => s.id === activeId);
  const active = activeIndex >= 0 ? situations[activeIndex] : null;
  const select = (id) => {
    if (controlled) onSelectSituation(id);
    else setLocalId(id);
  };

  const wide =
    !narrow &&
    (situations.length > 1 ||
      situations.some(
        (s) =>
          (s.acceptance || "").trim() ||
          s.image_urls.length > 1 ||
          (s.acceptance_image_urls || []).length > 0
      ));

  const toggleWideLayout = () => {
    setWideLayout((v) => {
      const next = !v;
      writeWideLayout(next);
      return next;
    });
  };

  useEffect(() => {
    if (previousActiveId.current === activeId) return;
    previousActiveId.current = activeId;
    articleRef.current?.scrollIntoView?.({ block: "start" });
  }, [activeId]);

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

  const groups = VERDICT_ORDER.map((code) => ({
    code,
    items: situations
      .map((situation, index) => ({ situation, index }))
      .filter((x) => x.situation.verdict === code),
  })).filter((g) => g.items.length);

  const body = (situation) => (
    <SituationBody
      key={situation.id}
      scenario={scenario}
      situation={situation}
      title={view.title}
      narrow={narrow}
      onNotify={onNotify}
    />
  );

  let content;
  if (single) {
    content = (
      <>
        <div style={{ margin: "0 0 0.75rem" }}>
          <VerdictBadge code={situations[0].verdict} t={t} />
        </div>
        {body(situations[0])}
      </>
    );
  } else if (printing) {
    content = groups.map((group) => (
      <div key={group.code} style={{ marginBottom: "1.5rem" }}>
        <GroupHeader code={group.code} count={group.items.length} t={t} />
        {group.items.map(({ situation, index }) => (
          <div key={situation.id} style={{ marginBottom: "1.25rem", breakInside: "avoid-page" }}>
            <div style={{ color: "#5c7186", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              {t("employee.situationN", { n: index + 1 })}
            </div>
            {body(situation)}
          </div>
        ))}
      </div>
    ));
  } else if (active) {
    content = (
      <>
        <SituationNav situations={situations} activeIndex={activeIndex} onSelect={select} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0 0 0.9rem" }}>
          <VerdictBadge code={active.verdict} t={t} />
          <span style={{ color: "#5c7186", fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {t("employee.situationN", { n: activeIndex + 1 })}
          </span>
        </div>
        {body(active)}
      </>
    );
  } else {
    content = (
      <>
        <div className="no-print" style={{ color: "#8899aa", fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem" }}>
          {t("employee.situationsCount", { count: situations.length })}
        </div>
        {groups.map((group) => (
          <div key={group.code} style={{ marginBottom: "1.75rem" }}>
            <GroupHeader code={group.code} count={group.items.length} t={t} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "0.9rem" }}>
              {group.items.map(({ situation, index }) => (
                <SituationCard
                  key={situation.id}
                  situation={situation}
                  number={index + 1}
                  onOpen={() => select(situation.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <article
      ref={articleRef}
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
              style={styles.smallBtn}
            >
              {wideLayout ? "⤡" : "⤢"} {wideLayout ? t("employee.comfortableWidth") : t("employee.fullWidth")}
            </button>
          ) : null}
          <button type="button" style={styles.smallBtn} onClick={() => setPrinting(true)}>
            {t("employee.print")}
          </button>
          {onToggleFavorite ? (
            <button
              type="button"
              aria-label={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
              title={isFavorite ? t("employee.unfavorite") : t("employee.favorite")}
              onClick={onToggleFavorite}
              style={{
                ...styles.smallBtn,
                ...(isFavorite ? { color: "#f5c518", border: "1px solid #f5c518" } : {}),
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

      {content}

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

export default ScenarioDetail;
