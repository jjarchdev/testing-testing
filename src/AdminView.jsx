import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useBlocker, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetchWithAuth, logoutAdmin, uploadImageFile } from "./api.js";
import { useAppData } from "./AppData.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import AdminsPanel from "./AdminsPanel.jsx";
import ConfluenceManager from "./ConfluenceManager.jsx";
import ConfluencePagePicker from "./ConfluencePagePicker.jsx";
import { localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { styles } from "./styles.js";

const MAX_SCENARIO_IMAGES = 8;

function scenarioImageUrls(scenario) {
  if (Array.isArray(scenario?.image_urls) && scenario.image_urls.length) {
    return scenario.image_urls.filter((u) => typeof u === "string" && u.trim());
  }
  if (typeof scenario?.image_url === "string" && scenario.image_url.trim()) {
    return [scenario.image_url.trim()];
  }
  return [];
}

function sameUrlList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((url, i) => url === b[i]);
}

function CategoryManager({ categories, onSave, onDelete, onBack }) {
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
    return categories.find((c) => c.slug === editingSlug)?.label || label;
  }, [categories, editingSlug, label]);

  const resetForm = () => {
    setLabel("");
    setSortOrder("");
    setEditingSlug(null);
    setFormError("");
  };

  const startEdit = (cat) => {
    setEditingSlug(cat.slug);
    setLabel(cat.label);
    setSortOrder(String(cat.sort_order));
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
      setFormError(t("categories.labelRequired"));
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
        {t("categories.back")}
      </button>
      <h2 style={styles.formTitle}>{t("categories.title")}</h2>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {t("categories.help")}
      </p>

      <div ref={formRef}>
        <h3 style={{ ...styles.formTitle, fontSize: "1.1rem", marginTop: 0, marginBottom: "0.5rem" }}>
          {editingSlug ? t("categories.editTitle") : t("categories.addTitle")}
        </h3>
        {editingSlug ? (
          <p style={{ color: "#4fa3ff", marginTop: 0, marginBottom: "1rem", fontSize: "0.9rem" }}>
            {t("categories.editing", { label: editingLabel })}
          </p>
        ) : null}
        {formError ? (
          <div style={styles.formInlineError} role="alert">
            {formError}
          </div>
        ) : null}
        <label style={styles.label}>{t("categories.label")}</label>
        <input
          style={styles.input}
          placeholder={t("categories.labelPlaceholder")}
          value={label}
          disabled={busy}
          onChange={(e) => {
            setFormError("");
            setLabel(e.target.value);
          }}
        />
        <label style={styles.label}>{t("categories.sortOrder")}</label>
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
              ? t("categories.saving")
              : editingSlug
                ? t("categories.save")
                : t("categories.add")}
          </button>
          {editingSlug ? (
            <button type="button" style={styles.ghostBtn} onClick={resetForm} disabled={busy}>
              {t("categories.cancelEdit")}
            </button>
          ) : null}
        </div>
      </div>

      {categories.length === 0 ? (
        <div style={{ ...styles.empty, marginTop: "1.5rem", marginBottom: 0 }}>
          {t("categories.empty")}
        </div>
      ) : (
        <div style={{ ...styles.adminTable, marginTop: "2rem" }}>
          <div style={styles.tableHead}>
            <span style={{ flex: 2 }}>{t("categories.colLabel")}</span>
            <span style={{ flex: 1 }}>{t("categories.colSlug")}</span>
            <span style={{ width: 70 }}>{t("categories.colOrder")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("categories.colActions")}</span>
          </div>
          {categories.map((cat) => (
            <div key={cat.slug} style={styles.tableRow}>
              {deleteSlug === cat.slug ? (
                <div style={styles.deleteConfirm}>
                  <span>{t("categories.deleteConfirm", { label: cat.label })}</span>
                  <button
                    type="button"
                    style={styles.dangerBtn}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const ok = await onDelete(cat.slug);
                        if (ok) setDeleteSlug(null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? t("categories.deleting") : t("categories.yesDelete")}
                  </button>
                  <button
                    type="button"
                    style={styles.cancelBtn}
                    disabled={busy}
                    onClick={() => setDeleteSlug(null)}
                  >
                    {t("categories.cancel")}
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ flex: 2, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ flex: 1, color: "#8899aa", fontSize: "0.85rem" }}>{cat.slug}</span>
                  <span style={{ width: 70, color: "#8899aa" }}>{cat.sort_order}</span>
                  <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button type="button" style={styles.editBtn} onClick={() => startEdit(cat)}>
                      {t("admin.edit")}
                    </button>
                    <button
                      type="button"
                      style={styles.dangerBtn}
                      onClick={() => setDeleteSlug(cat.slug)}
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

function ScenarioForm({ initial, categories, onSave, onCancel }) {
  const { t } = useTranslation();
  const defaultCategory = categories[0]?.label || "";
  const baseline = useMemo(
    () => ({
      category: initial?.category || defaultCategory,
      title: initial?.title || "",
      scenario: initial?.scenario || "",
      solution: initial?.solution || "",
      tags: initial?.tags?.join(", ") || "",
      image_urls: scenarioImageUrls(initial),
      confluence_page_id: initial?.confluence_page_id || "",
      confluence_page_url: initial?.confluence_page_url || "",
      confluence_page_title: initial?.confluence_page_title || "",
      is_published: initial?.is_published !== false,
    }),
    [initial, defaultCategory]
  );
  const [form, setForm] = useState(baseline);
  const [urlDraft, setUrlDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageUrlsRef = useRef(baseline.image_urls);
  imageUrlsRef.current = form.image_urls;

  useEffect(() => {
    setForm(baseline);
    setUrlDraft("");
    setFormError("");
  }, [baseline]);

  const dirty = useMemo(
    () =>
      form.category !== baseline.category ||
      form.title !== baseline.title ||
      form.scenario !== baseline.scenario ||
      form.solution !== baseline.solution ||
      form.tags !== baseline.tags ||
      !sameUrlList(form.image_urls, baseline.image_urls) ||
      form.confluence_page_id !== baseline.confluence_page_id ||
      form.confluence_page_url !== baseline.confluence_page_url ||
      form.confluence_page_title !== baseline.confluence_page_title ||
      form.is_published !== baseline.is_published,
    [form, baseline]
  );

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

  const requestCancel = useCallback(() => {
    if (dirty && !window.confirm(t("scenarioForm.unsavedConfirm"))) return;
    onCancel();
  }, [dirty, onCancel, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") requestCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestCancel]);

  const patch = (k, v) => {
    setFormError("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  const atImageCap = form.image_urls.length >= MAX_SCENARIO_IMAGES;

  const appendImageUrls = (urls) => {
    setFormError("");
    setForm((f) => {
      const seen = new Set(f.image_urls);
      const next = [...f.image_urls];
      for (const url of urls) {
        const clean = String(url || "").trim();
        if (!clean || seen.has(clean)) continue;
        if (next.length >= MAX_SCENARIO_IMAGES) break;
        seen.add(clean);
        next.push(clean);
      }
      return { ...f, image_urls: next };
    });
  };

  const removeImageAt = (index) => {
    setFormError("");
    setForm((f) => ({
      ...f,
      image_urls: f.image_urls.filter((_, i) => i !== index),
    }));
  };

  const moveImage = (index, delta) => {
    setFormError("");
    setForm((f) => {
      const next = [...f.image_urls];
      const target = index + delta;
      if (target < 0 || target >= next.length) return f;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return { ...f, image_urls: next };
    });
  };

  const setCoverImage = (index) => {
    if (index <= 0) return;
    setFormError("");
    setForm((f) => {
      if (index >= f.image_urls.length) return f;
      const next = [...f.image_urls];
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return { ...f, image_urls: next };
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
    try {
      const uploaded = [];
      for (const file of toUpload) {
        uploaded.push(await uploadImageFile(file));
      }
      appendImageUrls(uploaded);
      if (files.length > slots) {
        setFormError(t("scenarioForm.maxImages", { max: MAX_SCENARIO_IMAGES }));
      }
    } catch (err) {
      setFormError(err?.message || t("scenarioForm.uploadFailed"));
    } finally {
      setUploading(false);
    }
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

  const handleSave = async () => {
    if (busy) return;
    if (!form.category) {
      setFormError(t("scenarioForm.needCategory"));
      return;
    }
    if (!form.title.trim() || !form.scenario.trim() || !form.solution.trim()) {
      setFormError(t("scenarioForm.fieldsRequired"));
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.formWrap}>
      <h2 style={styles.formTitle}>
        {initial ? t("scenarioForm.editTitle") : t("scenarioForm.addTitle")}
      </h2>

      {formError ? (
        <div id="scenario-form-error" style={styles.formInlineError} role="alert">
          {formError}
        </div>
      ) : null}

      <label style={styles.label}>{t("scenarioForm.category")}</label>
      <select
        style={styles.select}
        value={form.category}
        onChange={(e) => patch("category", e.target.value)}
        disabled={categories.length === 0 || busy}
      >
        {categories.length === 0 ? (
          <option value="">{t("scenarioForm.noCategories")}</option>
        ) : (
          categories.map((c) => (
            <option key={c.slug} value={c.label}>
              {c.label}
            </option>
          ))
        )}
      </select>

      <label style={styles.label}>{t("scenarioForm.title")}</label>
      <input
        style={styles.input}
        placeholder={t("scenarioForm.title")}
        value={form.title}
        disabled={busy}
        onChange={(e) => patch("title", e.target.value)}
      />

      <label style={styles.label}>{t("scenarioForm.scenario")}</label>
      <textarea
        style={{ ...styles.input, height: 100 }}
        placeholder={t("scenarioForm.situationPlaceholder")}
        value={form.scenario}
        disabled={busy}
        onChange={(e) => patch("scenario", e.target.value)}
      />

      <label style={styles.label}>{t("scenarioForm.solution")}</label>
      <textarea
        style={{ ...styles.input, height: 200 }}
        placeholder={t("scenarioForm.solutionPlaceholder")}
        value={form.solution}
        disabled={busy}
        onChange={(e) => patch("solution", e.target.value)}
      />

      <label style={styles.label}>{t("scenarioForm.tags")}</label>
      <input
        style={styles.input}
        placeholder={t("scenarioForm.tagsPlaceholder")}
        value={form.tags}
        disabled={busy || uploading}
        onChange={(e) => patch("tags", e.target.value)}
      />

      <label style={styles.label}>{t("scenarioForm.images")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
        <input
          style={{ ...styles.input, flex: "1 1 220px", marginBottom: 0 }}
          placeholder={t("scenarioForm.imageUrlPlaceholder")}
          value={urlDraft}
          disabled={busy || uploading || atImageCap}
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
          disabled={busy || uploading || atImageCap || !urlDraft.trim()}
          onClick={handleAddUrl}
        >
          {t("scenarioForm.addImageUrl")}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
        <label
          style={{
            ...styles.ghostBtn,
            cursor: busy || uploading || atImageCap ? "default" : "pointer",
            opacity: atImageCap ? 0.55 : 1,
          }}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            hidden
            disabled={busy || uploading || atImageCap}
            onChange={async (e) => {
              const list = e.target.files;
              e.target.value = "";
              await handleUploadFiles(list);
            }}
          />
          {uploading ? t("scenarioForm.uploading") : t("scenarioForm.uploadImages")}
        </label>
        <span style={{ color: "#8899aa", fontSize: "0.85rem" }}>
          {t("scenarioForm.imageCount", {
            count: form.image_urls.length,
            max: MAX_SCENARIO_IMAGES,
          })}
        </span>
      </div>
      {form.image_urls.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.85rem",
          }}
        >
          {form.image_urls.map((url, index) => (
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
                alt=""
                style={{
                  display: "block",
                  width: "100%",
                  height: 110,
                  objectFit: "cover",
                }}
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                <button
                  type="button"
                  style={{ ...styles.ghostBtn, flex: 1, borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                  disabled={busy || uploading || index === 0}
                  onClick={() => moveImage(index, -1)}
                  title={t("scenarioForm.moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  style={{ ...styles.ghostBtn, flex: 1, borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                  disabled={busy || uploading || index === form.image_urls.length - 1}
                  onClick={() => moveImage(index, 1)}
                  title={t("scenarioForm.moveDown")}
                >
                  ↓
                </button>
              </div>
              {index > 0 ? (
                <button
                  type="button"
                  style={{ ...styles.ghostBtn, width: "100%", borderRadius: 0, fontSize: "0.75rem", padding: "0.35rem" }}
                  disabled={busy || uploading}
                  onClick={() => setCoverImage(index)}
                >
                  {t("scenarioForm.setCover")}
                </button>
              ) : null}
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
                disabled={busy || uploading}
                onClick={() => removeImageAt(index)}
              >
                {t("scenarioForm.removeImage")}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <label style={styles.label}>{t("scenarioForm.confluencePage")}</label>
      <ConfluencePagePicker
        value={{
          id: form.confluence_page_id,
          url: form.confluence_page_url,
          title: form.confluence_page_title,
        }}
        onPick={(picked) => {
          setFormError("");
          setForm((f) => ({
            ...f,
            confluence_page_id: picked.id || "",
            confluence_page_url: picked.url || "",
            confluence_page_title: picked.title || "",
          }));
        }}
        onClear={() => {
          setFormError("");
          setForm((f) => ({
            ...f,
            confluence_page_id: "",
            confluence_page_url: "",
            confluence_page_title: "",
          }));
        }}
      />

      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={form.is_published}
          disabled={busy || uploading}
          onChange={(e) => patch("is_published", e.target.checked)}
        />
        {t("scenarioForm.published")}
      </label>

      <div style={styles.formActions}>
        <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={busy || uploading}>
          {busy
            ? t("scenarioForm.saving")
            : initial
              ? t("scenarioForm.saveChanges")
              : t("scenarioForm.addScenario")}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={requestCancel} disabled={busy || uploading}>
          {t("scenarioForm.cancel")}
        </button>
      </div>
    </div>
  );
}

export default function AdminView() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const {
    scenarios,
    setScenarios,
    categories,
    adminSession,
    setAdminSession,
    adminEmail,
    adminIsBootstrap,
    serverConfig,
    notify,
    loadScenariosFromServer,
    loadCategoriesFromServer,
  } = useAppData();

  const [editingScenario, setEditingScenario] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showConfluenceManager, setShowConfluenceManager] = useState(false);
  const [showAdminsPanel, setShowAdminsPanel] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);

  const scenarioList = scenarios ?? [];
  const categoryList = categories || [];
  const listLoading = scenarios === null || categories === null;
  const distinctCategoryCount = categoryList.length;

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  useEffect(() => {
    const main = document.getElementById("admin-main");
    if (main) main.scrollTop = 0;
  }, [showAddForm, showCategoryManager, showConfluenceManager, showAdminsPanel, editingScenario, listLoading]);

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
    const tags = data.tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const body = {
      category: data.category,
      title: data.title,
      scenario: data.scenario,
      solution: data.solution,
      tags,
      is_published: data.is_published !== false,
      image_urls: Array.isArray(data.image_urls) ? data.image_urls : [],
      image_url:
        (Array.isArray(data.image_urls) && data.image_urls[0]) ||
        data.image_url ||
        "",
      confluence_page_id: data.confluence_page_id || "",
      confluence_page_url: data.confluence_page_url || "",
      confluence_page_title: data.confluence_page_title || "",
    };
    try {
      const res = editingScenario
        ? await apiFetchWithAuth(`/api/scenarios/${editingScenario.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : await apiFetchWithAuth("/api/scenarios", {
            method: "POST",
            body: JSON.stringify(body),
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
          editingScenario ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]
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

  const saveCategory = async (data, editingSlug = null) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return false;
    }
    try {
      const res = editingSlug
        ? await apiFetchWithAuth(`/api/categories/${encodeURIComponent(editingSlug)}`, {
            method: "PUT",
            body: JSON.stringify(data),
          })
        : await apiFetchWithAuth("/api/categories", {
            method: "POST",
            body: JSON.stringify(data),
          });
      if (handleAuthFailure(res)) return false;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.categorySaveFailed"), "error");
        return false;
      }
      await Promise.all([loadCategoriesFromServer(), loadScenariosFromServer()]);
      notify(editingSlug ? t("toast.categoryUpdated") : t("toast.categoryAdded"));
      return true;
    } catch {
      notify(t("toast.unreachable"), "error");
      return false;
    }
  };

  const deleteCategory = async (slug) => {
    if (!adminSession) {
      notify(t("toast.notSignedIn"), "error");
      return false;
    }
    try {
      const res = await apiFetchWithAuth(`/api/categories/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (handleAuthFailure(res)) return false;
      if (res.status === 404) {
        notify(t("toast.categoryNotFound"), "error");
        return false;
      }
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.categoryInUse"), "error");
        return false;
      }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || t("toast.deleteFailed"), "error");
        return false;
      }
      await loadCategoriesFromServer();
      notify(t("toast.categoryDeleted"));
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
      /* clear local */
    }
    setAdminSession(false);
    setShowAddForm(false);
    setEditingScenario(null);
    setShowCategoryManager(false);
    setShowConfluenceManager(false);
    setShowAdminsPanel(false);
    loadScenariosFromServer();
    navigate(localePath(lng));
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
            <div style={styles.statNum}>{distinctCategoryCount}</div>
            <div style={styles.statLabel}>{t("admin.categories")}</div>
          </div>
        </div>
        <button
          type="button"
          style={{ ...styles.primaryBtn, margin: "0 1rem 0.5rem" }}
          onClick={() => {
            setShowAddForm(true);
            setEditingScenario(null);
            setShowCategoryManager(false);
            setShowConfluenceManager(false);
            setShowAdminsPanel(false);
            setNavOpen(false);
          }}
        >
          {t("admin.addScenario")}
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            setShowCategoryManager(true);
            setShowAddForm(false);
            setShowConfluenceManager(false);
            setShowAdminsPanel(false);
            setEditingScenario(null);
            setNavOpen(false);
          }}
        >
          {t("admin.manageCategories")}
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            setShowConfluenceManager(true);
            setShowCategoryManager(false);
            setShowAdminsPanel(false);
            setShowAddForm(false);
            setEditingScenario(null);
            setNavOpen(false);
          }}
        >
          {t("admin.manageConfluence")}
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            setShowAdminsPanel(true);
            setShowConfluenceManager(false);
            setShowCategoryManager(false);
            setShowAddForm(false);
            setEditingScenario(null);
            setNavOpen(false);
          }}
        >
          {t("admin.manageAdmins")}
        </button>
        {adminEmail ? (
          <div style={{ padding: "0 1rem 0.5rem", color: "#8899aa", fontSize: "0.75rem", textAlign: "center", wordBreak: "break-word" }}>
            {adminIsBootstrap ? t("admin.bootstrapSession") : adminEmail}
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
        ) : showConfluenceManager ? (
          <ConfluenceManager
            onBack={() => setShowConfluenceManager(false)}
            onChanged={() => {
              loadScenariosFromServer();
            }}
          />
        ) : showCategoryManager ? (
          <CategoryManager
            categories={categoryList}
            onSave={saveCategory}
            onDelete={deleteCategory}
            onBack={() => setShowCategoryManager(false)}
          />
        ) : showAddForm || editingScenario ? (
          <ScenarioForm
            initial={editingScenario}
            categories={categoryList}
            onSave={saveScenario}
            onCancel={() => {
              setShowAddForm(false);
              setEditingScenario(null);
            }}
          />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>{t("admin.manageScenarios")}</h2>
              <span style={styles.mainCount}>
                {t("admin.entriesCount", { count: scenarioList.length })}
              </span>
            </div>
            {categoryList.length === 0 ? (
              <div style={styles.empty}>{t("admin.needCategories")}</div>
            ) : scenarioList.length === 0 ? (
              <div style={styles.empty}>{t("admin.noScenarios")}</div>
            ) : null}
            <div style={styles.adminTable}>
              {scenarioList.length > 0 ? (
                <div style={styles.tableHead}>
                  <span style={{ flex: 2 }}>{t("admin.colTitle")}</span>
                  <span style={{ flex: 1 }}>{t("admin.colCategory")}</span>
                  <span style={{ width: 80 }}>{t("admin.colStatus")}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>{t("admin.colActions")}</span>
                </div>
              ) : null}
              {scenarioList.map((row) => (
                <div key={row.id} style={styles.tableRow}>
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
                      <span style={{ flex: 2, fontWeight: 600, color: "#eaf0fb" }}>{row.title}</span>
                      <span style={{ flex: 1, color: "#8899aa" }}>{row.category}</span>
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
                        <button
                          type="button"
                          style={styles.editBtn}
                          onClick={() => {
                            setEditingScenario(row);
                            setShowAddForm(false);
                            setShowCategoryManager(false);
                            setShowConfluenceManager(false);
                            setShowAdminsPanel(false);
                          }}
                        >
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
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
