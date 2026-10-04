import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetchWithAuth, logoutAdmin } from "./api.js";
import { useAppData } from "./AppData.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import AdminsPanel from "./AdminsPanel.jsx";
import ScenarioForm from "./ScenarioForm.jsx";
import { localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { styles } from "./styles.js";
import { VERDICT_CODES, scenarioToEditable, scenarioWpList } from "../shared/scenarioSchema.mjs";

const VERDICT_COLORS = {
  to_be_rejected: "#e74c3c",
  grey_area: "#e67e22",
  acceptable: "#1abc9c",
};

function situationSnippet(situation, preferredLng) {
  const order = [preferredLng, "en", "de", "sq"];
  for (const lng of order) {
    const text = (situation.translations?.[lng]?.scenario || "").replace(/\s+/g, " ").trim();
    if (text) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  return "";
}

function WorkPackageManager({ workPackages, onSave, onDelete, onBack }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [deleteSlug, setDeleteSlug] = useState(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const editingLabel = useMemo(() => {
    if (!editingSlug) return "";
    return workPackages.find((w) => w.slug === editingSlug)?.label || label;
  }, [workPackages, editingSlug, label]);

  const resetForm = () => {
    setLabel("");
    setSortOrder("");
    setEditingSlug(null);
    setFormError("");
  };

  const startEdit = (wp) => {
    setEditingSlug(wp.slug);
    setLabel(wp.label);
    setSortOrder(String(wp.sort_order));
    setFormError("");
    setDeleteSlug(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (editingSlug) resetForm();
      else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingSlug, onBack]);

  const handleSave = async () => {
    if (busy) return;
    if (!label.trim()) {
      setFormError(t("workPackages.labelRequired"));
      return;
    }
    const payload = { label: label.trim() };
    if (sortOrder.trim() !== "" && Number.isFinite(Number(sortOrder))) {
      payload.sort_order = Number(sortOrder);
    }
    setBusy(true);
    try {
      const ok = await onSave(payload, editingSlug);
      if (ok) resetForm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.formWrap}>
      <button type="button" style={styles.detailBack} onClick={onBack}>
        {t("workPackages.back")}
      </button>
      <h2 style={styles.formTitle}>{t("workPackages.title")}</h2>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {t("workPackages.help")}
      </p>

      <div ref={formRef}>
        <h3 style={{ ...styles.formTitle, fontSize: "1.1rem", marginTop: 0, marginBottom: "0.5rem" }}>
          {editingSlug ? t("workPackages.editTitle") : t("workPackages.addTitle")}
        </h3>
        {editingSlug ? (
          <p style={{ color: "#4fa3ff", marginTop: 0, marginBottom: "1rem", fontSize: "0.9rem" }}>
            {t("workPackages.editing", { label: editingLabel })}
          </p>
        ) : null}
        {formError ? (
          <div style={styles.formInlineError} role="alert">
            {formError}
          </div>
        ) : null}
        <label style={styles.label}>{t("workPackages.label")}</label>
        <input
          style={styles.input}
          placeholder={t("workPackages.labelPlaceholder")}
          value={label}
          maxLength={32}
          disabled={busy}
          onChange={(e) => {
            setFormError("");
            setLabel(e.target.value);
          }}
        />
        <label style={styles.label}>{t("workPackages.sortOrder")}</label>
        <input
          style={styles.input}
          type="number"
          placeholder="0"
          value={sortOrder}
          disabled={busy}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <div style={styles.formActions}>
          <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={busy}>
            {busy
              ? t("workPackages.saving")
              : editingSlug
                ? t("workPackages.save")
                : t("workPackages.add")}
          </button>
          {editingSlug ? (
            <button type="button" style={styles.ghostBtn} onClick={resetForm} disabled={busy}>
              {t("workPackages.cancelEdit")}
            </button>
          ) : null}
        </div>
      </div>

      {workPackages.length === 0 ? (
        <div style={{ ...styles.empty, marginTop: "1.5rem", marginBottom: 0 }}>
          {t("workPackages.empty")}
        </div>
      ) : (
        <div style={{ ...styles.adminTable, marginTop: "2rem" }}>
          <div style={styles.tableHead}>
            <span style={{ flex: 2 }}>{t("workPackages.colLabel")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("workPackages.colActions")}</span>
          </div>
          {workPackages.map((wp) => (
            <div key={wp.slug} style={styles.tableRow}>
              {deleteSlug === wp.slug ? (
                <div style={styles.deleteConfirm}>
                  <span>{t("workPackages.deleteConfirm", { label: wp.label })}</span>
                  <button
                    type="button"
                    style={styles.dangerBtn}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const ok = await onDelete(wp.slug);
                        if (ok) setDeleteSlug(null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? t("workPackages.deleting") : t("workPackages.yesDelete")}
                  </button>
                  <button
                    type="button"
                    style={styles.cancelBtn}
                    disabled={busy}
                    onClick={() => setDeleteSlug(null)}
                  >
                    {t("workPackages.cancel")}
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ flex: 2, fontWeight: 600 }}>{wp.label}</span>
                  <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button type="button" style={styles.editBtn} onClick={() => startEdit(wp)}>
                      {t("admin.edit")}
                    </button>
                    <button
                      type="button"
                      style={styles.dangerBtn}
                      onClick={() => setDeleteSlug(wp.slug)}
                    >
                      {t("admin.delete")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminView() {
  const { t, i18n } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const {
    scenarios,
    setScenarios,
    workPackages,
    adminSession,
    setAdminSession,
    adminEmail,
    serverConfig,
    notify,
    loadScenariosFromServer,
    loadWorkPackagesFromServer,
  } = useAppData();

  const [editingScenario, setEditingScenario] = useState(null);
  const [formIntent, setFormIntent] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [showWorkPackageManager, setShowWorkPackageManager] = useState(false);
  const [showAdminsPanel, setShowAdminsPanel] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const [scenarioQuery, setScenarioQuery] = useState("");
  const [scenarioStatusFilter, setScenarioStatusFilter] = useState("all");
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const scenarioList = scenarios ?? [];
  const workPackageList = workPackages || [];
  const listLoading = scenarios === null || workPackages === null;
  const onScenarioList =
    !showAddForm && !editingScenario && !showWorkPackageManager && !showAdminsPanel;
  const goToScenarioList = () => {
    setShowAddForm(false);
    setEditingScenario(null);
    setShowWorkPackageManager(false);
    setShowAdminsPanel(false);
    setNavOpen(false);
  };
  const openNewScenarioForm = () => {
    setEditingScenario(null);
    setFormIntent({});
    setShowAddForm(true);
    setShowWorkPackageManager(false);
    setShowAdminsPanel(false);
    setNavOpen(false);
  };
  const openScenarioEditor = (row, intent = {}) => {
    setEditingScenario(row);
    setFormIntent(intent);
    setShowAddForm(false);
    setShowWorkPackageManager(false);
    setShowAdminsPanel(false);
  };

  const editableById = useMemo(() => {
    const map = new Map();
    for (const row of scenarioList) map.set(row.id, scenarioToEditable(row));
    return map;
  }, [scenarioList]);

  const filteredScenarios = useMemo(() => {
    const q = scenarioQuery.trim().toLowerCase();
    return scenarioList.filter((row) => {
      if (scenarioStatusFilter === "published" && row.is_published === false) return false;
      if (scenarioStatusFilter === "draft" && row.is_published !== false) return false;
      if (!q) return true;
      const verdictLabels = (editableById.get(row.id)?.situations || []).map((s) =>
        VERDICT_CODES.includes(s.verdict) ? t(`verdict.${s.verdict}`) : ""
      );
      const haystack = [row.title, ...scenarioWpList(row), ...verdictLabels, ...(Array.isArray(row.tags) ? row.tags : [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [scenarioList, scenarioQuery, scenarioStatusFilter, editableById, t]);

  useEffect(() => {
    const main = document.getElementById("admin-main");
    if (main) main.scrollTop = 0;
  }, [showAddForm, showWorkPackageManager, showAdminsPanel, editingScenario, listLoading]);

  useEffect(() => {
    if (scenarios == null) return;
    setEditingScenario((prev) => (prev && (scenarios.find((s) => s.id === prev.id) ?? null)) || null);
    setDeleteConfirm((prev) => (prev != null && scenarios.some((s) => s.id === prev) ? prev : null));
  }, [scenarios]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && navOpen) setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const handleAuthFailure = useCallback(
    (res) => {
      if (res.status === 401) {
        setAdminSession(false);
        navigate(localePath(lng, "admin", "login"), { replace: true });
        notify(t("toast.signInAgain"), "error");
        return true;
      }
      return false;
    },
    [lng, navigate, notify, setAdminSession, t]
  );

  const saveScenario = async (data) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return;
    }
    const updating = Boolean(editingScenario) && !data.replaces_legacy_id;
    try {
      const res = updating
        ? await apiFetchWithAuth(`/api/scenarios/${editingScenario.id}`, {
            method: "PUT",
            body: JSON.stringify(data),
          })
        : await apiFetchWithAuth("/api/scenarios", {
            method: "POST",
            body: JSON.stringify(data),
          });
      if (handleAuthFailure(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.saveFailed"), "error");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const saved = payload?.scenario;
      if (saved) {
        setScenarios((prev) =>
          updating
            ? prev.map((s) => (s.id === saved.id ? saved : s))
            : [...prev.filter((s) => s.id !== data.replaces_legacy_id), saved]
        );
      } else {
        await loadScenariosFromServer();
      }
      if (editingScenario) {
        notify(t("toast.saved"));
        setEditingScenario(null);
      } else {
        notify(t("toast.added"));
        setShowAddForm(false);
      }
    } catch {
      notify(t("toast.unreachable"), "error");
    }
  };

  const saveWorkPackage = async (data, editingSlug = null) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return false;
    }
    try {
      const res = editingSlug
        ? await apiFetchWithAuth(`/api/work-packages/${encodeURIComponent(editingSlug)}`, {
            method: "PUT",
            body: JSON.stringify(data),
          })
        : await apiFetchWithAuth("/api/work-packages", {
            method: "POST",
            body: JSON.stringify(data),
          });
      if (handleAuthFailure(res)) return false;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.wpSaveFailed"), "error");
        return false;
      }
      await Promise.all([loadWorkPackagesFromServer(), loadScenariosFromServer()]);
      notify(editingSlug ? t("toast.wpUpdated") : t("toast.wpAdded"));
      return true;
    } catch {
      notify(t("toast.unreachable"), "error");
      return false;
    }
  };

  const deleteWorkPackage = async (slug) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return false;
    }
    try {
      const res = await apiFetchWithAuth(`/api/work-packages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (handleAuthFailure(res)) return false;
      if (res.status === 404) {
        notify(t("toast.wpNotFound"), "error");
        return false;
      }
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.wpInUse"), "error");
        return false;
      }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.deleteFailed"), "error");
        return false;
      }
      await loadWorkPackagesFromServer();
      notify(t("toast.wpDeleted"));
      return true;
    } catch {
      notify(t("toast.unreachable"), "error");
      return false;
    }
  };

  const deleteScenario = async (id) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return;
    }
    try {
      const res = await apiFetchWithAuth(`/api/scenarios/${id}`, { method: "DELETE" });
      if (handleAuthFailure(res)) return;
      if (res.status === 404) {
        notify(t("toast.notFound"), "error");
        return;
      }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.deleteFailed"), "error");
        return;
      }
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
      notify(t("toast.deleted"));
    } catch {
      notify(t("toast.unreachable"), "error");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch {
    }
    setAdminSession(false);
    setShowAddForm(false);
    setEditingScenario(null);
    setShowWorkPackageManager(false);
    setShowAdminsPanel(false);
    loadScenariosFromServer();
    navigate(localePath(lng));
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!serverConfig.loaded) {
    return (
      <div style={styles.root}>
        <div style={styles.empty}>{t("admin.loading")}</div>
      </div>
    );
  }

  if (!adminSession) {
    return <Navigate to={localePath(lng, "admin", "login")} replace />;
  }

  const uiLng = (i18n.language || "en").slice(0, 2);

  return (
    <div style={styles.appWrap}>
      <nav
        style={{
          ...styles.sidebar,
          background: "#0f1923",
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
        aria-label={t("admin.navLabel")}
      >
        <div style={styles.sidebarHeader}>
          <div style={{ ...styles.sidebarLogo, background: "#c0392b" }}>A</div>
          <div>
            <div style={styles.sidebarTitle}>{t("admin.title")}</div>
            <div style={styles.sidebarSub}>{t("admin.subtitle")}</div>
          </div>
        </div>
        <div style={{ padding: "0 1rem 1rem" }}>
          <LanguageSwitcher style={{ width: "100%", justifyContent: "center" }} />
        </div>
        <div style={styles.adminStats}>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{scenarioList.length}</div>
            <div style={styles.statLabel}>{t("admin.totalScenarios")}</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{workPackageList.length}</div>
            <div style={styles.statLabel}>{t("admin.workPackages")}</div>
          </div>
        </div>
        <div style={{ ...styles.sidebarSectionLabel, marginTop: 0 }}>{t("admin.navContent")}</div>
        <button
          type="button"
          style={{
            ...styles.ghostBtn,
            margin: "0 1rem 0.5rem",
            justifyContent: "center",
            ...(onScenarioList ? { borderColor: "#4fa3ff", color: "#4fa3ff" } : {}),
          }}
          onClick={goToScenarioList}
        >
          {t("admin.navScenarios")}
        </button>
        <button
          type="button"
          style={{ ...styles.primaryBtn, margin: "0 1rem 0.5rem" }}
          onClick={openNewScenarioForm}
        >
          {t("admin.addScenario")}
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            setShowWorkPackageManager(true);
            setShowAddForm(false);
            setShowAdminsPanel(false);
            setEditingScenario(null);
            setNavOpen(false);
          }}
        >
          {t("admin.manageWps")}
        </button>
        <div style={styles.sidebarSectionLabel}>{t("admin.navSettings")}</div>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            setShowAdminsPanel(true);
            setShowWorkPackageManager(false);
            setShowAddForm(false);
            setEditingScenario(null);
            setNavOpen(false);
          }}
        >
          {t("admin.manageAdmins")}
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={async () => {
            try {
              const res = await apiFetchWithAuth("/api/admin/export");
              if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || t("admin.exportFailed"));
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `qm-playbook-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (err) {
              notify(err?.message || t("admin.exportFailed"), "error");
            }
          }}
        >
          {t("admin.exportData")}
        </button>
        {adminEmail ? (
          <div style={{ padding: "0 1rem 0.5rem", color: "#8899aa", fontSize: "0.75rem", textAlign: "center", wordBreak: "break-word" }}>
            {adminEmail}
          </div>
        ) : null}
        <button type="button" style={{ ...styles.backBtn, marginTop: "auto" }} onClick={handleLogout}>
          {t("admin.logout")}
        </button>
      </nav>
      {narrow && navOpen ? (
        <button
          type="button"
          aria-label={t("admin.closeMenu")}
          onClick={() => setNavOpen(false)}
          style={styles.navScrim}
        />
      ) : null}

      <main style={styles.main} id="admin-main">
        {narrow ? (
          <div style={styles.mobileBar}>
            <button type="button" style={styles.menuBtn} onClick={() => setNavOpen(true)}>
              {t("admin.menu")}
            </button>
            <span style={styles.mobileBarTitle}>{t("admin.title")}</span>
          </div>
        ) : null}
        {listLoading ? (
          <div style={styles.empty}>{t("admin.loading")}</div>
        ) : showAdminsPanel ? (
          <AdminsPanel
            currentEmail={adminEmail}
            onBack={() => setShowAdminsPanel(false)}
          />
        ) : showWorkPackageManager ? (
          <WorkPackageManager
            workPackages={workPackageList}
            onSave={saveWorkPackage}
            onDelete={deleteWorkPackage}
            onBack={() => setShowWorkPackageManager(false)}
          />
        ) : showAddForm || editingScenario ? (
          <ScenarioForm
            key={editingScenario ? `edit-${editingScenario.id}-${formIntent.focusSituationId || ""}-${formIntent.addSituation ? "add" : ""}` : "new"}
            initial={editingScenario}
            focusSituationId={formIntent.focusSituationId}
            addSituation={formIntent.addSituation}
            onSave={saveScenario}
            onCancel={() => {
              setShowAddForm(false);
              setEditingScenario(null);
            }}
            onManageWps={() => {
              setShowAddForm(false);
              setEditingScenario(null);
              setShowWorkPackageManager(true);
            }}
          />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>{t("admin.manageScenarios")}</h2>
              <span style={styles.mainCount}>
                {scenarioQuery.trim() || scenarioStatusFilter !== "all"
                  ? t("admin.entriesFilteredCount", {
                      count: filteredScenarios.length,
                      total: scenarioList.length,
                    })
                  : t("admin.entriesCount", { count: scenarioList.length })}
              </span>
            </div>
            {workPackageList.length === 0 ? (
              <div style={styles.empty}>
                <div>{t("admin.needWps")}</div>
                <button
                  type="button"
                  style={{ ...styles.primaryBtn, marginTop: "0.75rem" }}
                  onClick={() => setShowWorkPackageManager(true)}
                >
                  {t("admin.needWpsCta")}
                </button>
              </div>
            ) : scenarioList.length === 0 ? (
              <div style={styles.empty}>
                <div>{t("admin.noScenarios")}</div>
                <button
                  type="button"
                  style={{ ...styles.primaryBtn, marginTop: "0.75rem" }}
                  onClick={openNewScenarioForm}
                >
                  {t("admin.noScenariosCta")}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                <input
                  style={{ ...styles.searchInput, margin: 0, flex: "1 1 220px" }}
                  placeholder={t("admin.searchPlaceholder")}
                  value={scenarioQuery}
                  onChange={(e) => setScenarioQuery(e.target.value)}
                  aria-label={t("admin.searchPlaceholder")}
                />
                <select
                  style={{ ...styles.select, marginBottom: 0, width: "auto", flex: "0 0 auto" }}
                  value={scenarioStatusFilter}
                  onChange={(e) => setScenarioStatusFilter(e.target.value)}
                  aria-label={t("admin.colStatus")}
                >
                  <option value="all">{t("admin.filterAll")}</option>
                  <option value="published">{t("admin.live")}</option>
                  <option value="draft">{t("admin.draft")}</option>
                </select>
              </div>
            )}
            {scenarioList.length > 0 && filteredScenarios.length === 0 ? (
              <div style={styles.empty}>
                <div>{t("admin.noResultsMatch")}</div>
                <button
                  type="button"
                  style={{ ...styles.ghostBtn, marginTop: "0.75rem" }}
                  onClick={() => {
                    setScenarioQuery("");
                    setScenarioStatusFilter("all");
                  }}
                >
                  {t("admin.clearFilters")}
                </button>
              </div>
            ) : null}
            <div style={styles.adminTableWrap}>
            <div style={styles.adminTable}>
              {filteredScenarios.length > 0 ? (
                <div style={styles.tableHead}>
                  <span style={{ width: 28 }} />
                  <span style={{ flex: 2 }}>{t("admin.colTitle")}</span>
                  <span style={{ flex: 1 }}>{t("admin.colWps")}</span>
                  <span style={{ flex: 1.4 }}>{t("admin.colSituations")}</span>
                  <span style={{ width: 80 }}>{t("admin.colStatus")}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>{t("admin.colActions")}</span>
                </div>
              ) : null}
              {filteredScenarios.map((row) => {
                const situations = editableById.get(row.id)?.situations || [];
                const expanded = expandedIds.has(row.id);
                const verdictCounts = VERDICT_CODES.map((code) => ({
                  code,
                  count: situations.filter((s) => s.verdict === code).length,
                })).filter((v) => v.count > 0);
                return (
                  <div key={row.id}>
                    <div style={styles.tableRow}>
                      {deleteConfirm === row.id ? (
                        <div style={styles.deleteConfirm}>
                          <span>{t("admin.deleteConfirm", { title: row.title })}</span>
                          <button
                            type="button"
                            style={styles.dangerBtn}
                            onClick={() => deleteScenario(row.id)}
                          >
                            {t("admin.yesDelete")}
                          </button>
                          <button
                            type="button"
                            style={styles.cancelBtn}
                            onClick={() => setDeleteConfirm(null)}
                          >
                            {t("admin.cancel")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.id)}
                            aria-expanded={expanded}
                            aria-label={t("admin.toggleSituations")}
                            title={t("admin.toggleSituations")}
                            style={{
                              width: 28,
                              background: "transparent",
                              border: "none",
                              color: "#4fa3ff",
                              cursor: "pointer",
                              padding: 0,
                              fontFamily: "inherit",
                            }}
                          >
                            {expanded ? "▲" : "▼"}
                          </button>
                          <span style={{ flex: 2, fontWeight: 600, color: "#eaf0fb" }}>{row.title}</span>
                          <span style={{ flex: 1, color: "#8899aa", fontSize: "0.85rem" }}>
                            {scenarioWpList(row).join(", ") || "—"}
                          </span>
                          <span style={{ flex: 1.4, display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            {verdictCounts.length === 0 ? (
                              <span style={{ color: "#8899aa" }}>—</span>
                            ) : (
                              verdictCounts.map((v) => (
                                <span
                                  key={v.code}
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    color: VERDICT_COLORS[v.code],
                                    border: `1px solid ${VERDICT_COLORS[v.code]}`,
                                    borderRadius: 6,
                                    padding: "0.1rem 0.4rem",
                                  }}
                                >
                                  {v.count} · {t(`verdict.${v.code}`)}
                                </span>
                              ))
                            )}
                          </span>
                          <span
                            style={{
                              width: 80,
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: row.is_published === false ? "#e67e22" : "#1abc9c",
                            }}
                          >
                            {row.is_published === false ? t("admin.draft") : t("admin.live")}
                          </span>
                          <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                            <button type="button" style={styles.editBtn} onClick={() => openScenarioEditor(row)}>
                              {t("admin.edit")}
                            </button>
                            <button
                              type="button"
                              style={styles.dangerBtn}
                              onClick={() => setDeleteConfirm(row.id)}
                            >
                              {t("admin.delete")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {expanded && deleteConfirm !== row.id ? (
                      <div
                        style={{
                          padding: "0.5rem 1.25rem 1rem 3.25rem",
                          borderBottom: "1px solid #1a2a3a",
                          background: "#0f1a27",
                        }}
                      >
                        {situations.map((s, i) => (
                          <div
                            key={s.id}
                            style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.35rem 0" }}
                          >
                            <span style={{ color: "#5c7186", fontSize: "0.8rem", fontWeight: 700, width: 20 }}>
                              {i + 1}
                            </span>
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: VERDICT_COLORS[s.verdict],
                                border: `1px solid ${VERDICT_COLORS[s.verdict]}`,
                                borderRadius: 6,
                                padding: "0.1rem 0.4rem",
                              }}
                            >
                              {t(`verdict.${s.verdict}`)}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                color: "#8899aa",
                                fontSize: "0.85rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {situationSnippet(s, uiLng)}
                            </span>
                            <button
                              type="button"
                              style={styles.editBtn}
                              onClick={() => openScenarioEditor(row, { focusSituationId: s.id })}
                            >
                              {t("admin.edit")}
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          style={{ ...styles.ghostBtn, marginTop: "0.5rem", padding: "0.35rem 0.85rem", fontSize: "0.85rem" }}
                          onClick={() => openScenarioEditor(row, { addSituation: true })}
                        >
                          {t("admin.addSituation")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
