import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import Dropdown from "./Dropdown.jsx";
import ScenarioDetail from "./ScenarioDetail.jsx";
import { GuideGrid, GuideViewer, KbSidebarGroup } from "./Guides.jsx";
import { guideMatchesQuery } from "./guideSearch.js";
import { useAppData } from "./AppData.jsx";
import { VERDICT_ORDER, VerdictBadge, truncateAtWord, verdictBadgeStyle } from "./scenarioUi.jsx";
import { pickScenarioView, scenarioWpList } from "../shared/scenarioSchema.mjs";
import { pickGuideView } from "../shared/guideSchema.mjs";
import { accentForLabel, localePath, normalizeSearchText } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { pushRecentId, readRecentIds, readFavoriteIds, toggleFavoriteId } from "./recent.js";
import { styles } from "./styles.js";

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

export default function EmployeeView({ section = "scenarios" }) {
  const { t, i18n } = useTranslation();
  const { lng, scenarioId, situationId, guideId } = useParams();
  const navigate = useNavigate();
  const {
    scenarios,
    scenariosLoadError,
    loadScenariosFromServer,
    workPackages,
    guides,
    guidesLoadError,
    loadGuidesFromServer,
    notify,
  } = useAppData();
  const inGuides = section === "guides";
  const activeLng = i18n.language || lng || "en";
  const viewFor = (s) => pickScenarioView(s, activeLng);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterWp, setFilterWp] = useState("");
  const [filterGuideWp, setFilterGuideWp] = useState("");
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

  const guidesListPath = localePath(lng, "employee", "guides");
  const scenariosListPath = localePath(lng, "employee");

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

  const publishedGuides = useMemo(
    () =>
      (guides ?? [])
        .filter((g) => g.is_published !== false)
        .map((guide) => ({ guide, view: pickGuideView(guide, activeLng) }))
        .filter((item) => item.view),
    [guides, activeLng]
  );

  const guideWpOptions = useMemo(() => {
    const counts = new Map();
    for (const { guide } of publishedGuides) {
      for (const w of guide.wps || []) counts.set(w, (counts.get(w) || 0) + 1);
    }
    const ordered = (workPackages || []).map((w) => w.label).filter((l) => counts.has(l));
    for (const l of counts.keys()) if (!ordered.includes(l)) ordered.push(l);
    return ordered.map((label) => ({ label, count: counts.get(label) }));
  }, [publishedGuides, workPackages]);

  const filteredGuides = useMemo(
    () =>
      publishedGuides.filter(({ guide }) => {
        if (filterGuideWp && !(guide.wps || []).includes(filterGuideWp)) return false;
        return !searching || guideMatchesQuery(guide, searchQuery);
      }),
    [publishedGuides, filterGuideWp, searching, searchQuery]
  );

  const selectedGuideItem = useMemo(() => {
    if (!guideId) return null;
    return publishedGuides.find((item) => String(item.guide.id) === String(guideId)) || null;
  }, [publishedGuides, guideId]);

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
    navigate(scenariosListPath);
  };

  const selectSituation = (id) => {
    if (!selectedScenario) return;
    navigate(localePath(lng, "employee", String(selectedScenario.id), id ? String(id) : ""));
  };

  const openGuidesList = () => {
    setSearchQuery("");
    navigate(guidesListPath);
    setNavOpen(false);
  };

  const openGuide = (guide) => {
    navigate(localePath(lng, "employee", "guides", String(guide.id)));
    setNavOpen(false);
  };

  const backToScenarios = () => {
    setSearchQuery("");
    navigate(scenariosListPath);
  };

  useEffect(() => {
    if (filterWp && !wpOptions.some((w) => w.label === filterWp)) setFilterWp("");
  }, [filterWp, wpOptions]);

  useEffect(() => {
    if (guides != null && filterGuideWp && !guideWpOptions.some((w) => w.label === filterGuideWp)) {
      setFilterGuideWp("");
    }
  }, [guides, filterGuideWp, guideWpOptions]);

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
    const view = sc ? pickScenarioView(sc, activeLng) : null;
    if (!sc || !view) {
      navigate(localePath(lng, "employee"), { replace: true });
      return;
    }
    if (situationId && !view.situations.some((s) => s.id === situationId)) {
      navigate(localePath(lng, "employee", String(id)), { replace: true });
    }
  }, [scenarios, scenarioId, situationId, scenarioList, lng, navigate, activeLng]);

  useEffect(() => {
    if (!inGuides || guides == null || !guideId) return;
    if (!selectedGuideItem) navigate(guidesListPath, { replace: true });
  }, [inGuides, guides, guideId, selectedGuideItem, guidesListPath, navigate]);

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
        if (inGuides) {
          if (guideId) navigate(guidesListPath);
          else if (searching) setSearchQuery("");
          else if (filterGuideWp) setFilterGuideWp("");
          return;
        }
        if (situationId && selectedScenario) {
          navigate(localePath(lng, "employee", String(selectedScenario.id)));
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
  }, [
    navOpen,
    selectedScenario,
    situationId,
    narrow,
    lng,
    searching,
    filterVerdict,
    filterWp,
    inGuides,
    guideId,
    filterGuideWp,
    guidesListPath,
  ]);

  const emptyMessage = () => {
    if (searching) return t("employee.emptySearch");
    if (filterVerdict) return t("employee.emptyVerdict");
    if (filterWp) return t("employee.emptyWp");
    if (scenarioList.length > 0) return t("employee.emptyLanguage");
    return t("employee.emptyPublished");
  };

  const selectedView = selectedScenario ? viewFor(selectedScenario) : null;
  const activeWpOptions = inGuides ? guideWpOptions : wpOptions;
  const activeFilterWp = inGuides ? filterGuideWp : filterWp;

  const mobileTitle = inGuides
    ? selectedGuideItem
      ? selectedGuideItem.view.title
      : filterGuideWp || t("kb.title")
    : selectedView
      ? selectedView.title
      : filterWp || t("employee.allScenarios");

  const renderGuides = () => {
    if (guides === null) return <div style={styles.empty}>{t("employee.loading")}</div>;
    if (guidesLoadError) {
      return (
        <div style={styles.loadErrorBox}>
          <p style={styles.loadErrorText}>{guidesLoadError}</p>
          <button type="button" style={styles.primaryBtn} onClick={loadGuidesFromServer}>
            {t("employee.retry")}
          </button>
        </div>
      );
    }
    if (selectedGuideItem) {
      return (
        <GuideViewer
          guide={selectedGuideItem.guide}
          view={selectedGuideItem.view}
          onBack={() => navigate(guidesListPath)}
        />
      );
    }
    return (
      <>
        <button type="button" className="no-print" style={{ ...styles.detailBack, paddingBottom: "1rem" }} onClick={backToScenarios}>
          {t("kb.backToScenarios")}
        </button>
        <div style={styles.mainHeader}>
          <h2 style={styles.mainTitle}>{filterGuideWp || t("kb.title")}</h2>
          <span style={styles.mainCount}>{t("kb.count", { count: filteredGuides.length })}</span>
        </div>
        {filteredGuides.length === 0 ? (
          <div style={styles.empty}>
            <div>{searching ? t("kb.emptySearch") : filterGuideWp ? t("kb.emptyWp") : t("kb.empty")}</div>
            {filterGuideWp && !searching ? (
              <button
                type="button"
                style={{ ...styles.ghostBtn, marginTop: "0.75rem" }}
                onClick={() => setFilterGuideWp("")}
              >
                {t("kb.showAll")}
              </button>
            ) : null}
          </div>
        ) : (
          <GuideGrid items={filteredGuides} onOpen={openGuide} />
        )}
      </>
    );
  };

  const renderScenarios = () => {
    if (scenarios === null) return <div style={styles.empty}>{t("employee.loading")}</div>;
    if (scenariosLoadError) {
      return (
        <div style={styles.loadErrorBox}>
          <p style={styles.loadErrorText}>{scenariosLoadError}</p>
          <button type="button" style={styles.primaryBtn} onClick={loadScenariosFromServer}>
            {t("employee.retry")}
          </button>
        </div>
      );
    }
    if (selectedScenario && selectedView) {
      return (
        <ScenarioDetail
          scenario={selectedScenario}
          view={selectedView}
          onBack={closeDetail}
          onNotify={notify}
          isFavorite={favoriteIds.includes(selectedScenario.id)}
          onToggleFavorite={() => handleToggleFavorite(selectedScenario.id)}
          situationId={situationId || null}
          onSelectSituation={selectSituation}
        />
      );
    }
    return (
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
    );
  };

  return (
    <div style={{ ...styles.appWrap, height: "100vh", overflow: "hidden" }}>
      <nav
        className="no-print"
        style={{
          ...styles.sidebar,
          height: "100%",
          overflowX: "hidden",
          overflowY: "auto",
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
            placeholder={inGuides ? t("kb.searchPlaceholder") : t("employee.searchPlaceholder")}
            aria-label={inGuides ? t("kb.searchAria") : t("employee.searchAria")}
            title={t("employee.searchShortcutHint")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (inGuides) {
                if (guideId) navigate(guidesListPath);
              } else if (selectedScenario) {
                closeDetail();
              }
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
              ...activeWpOptions.map((w) => ({ value: w.label, label: w.label, hint: w.count })),
            ]}
            value={activeFilterWp}
            onChange={(next) => {
              if (inGuides) {
                setFilterGuideWp(next);
                if (guideId) navigate(guidesListPath);
              } else {
                setFilterWp(next);
                setFilterVerdict(null);
                if (selectedScenario) closeDetail();
              }
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

        <KbSidebarGroup
          items={inGuides ? filteredGuides : publishedGuides}
          activeId={selectedGuideItem?.guide.id ?? null}
          listActive={inGuides && !guideId}
          onOpenList={openGuidesList}
          onOpenGuide={openGuide}
        />

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
            <span style={styles.mobileBarTitle}>{mobileTitle}</span>
          </div>
        ) : null}
        {inGuides ? renderGuides() : renderScenarios()}
      </main>
    </div>
  );
}
