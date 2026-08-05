import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { apiFetchWithAuth } from "./api.js";
import { styles } from "./styles.js";

export default function AdminsPanel({ onBack, currentEmail }) {
  const { t, i18n } = useTranslation();
  const { lng: routeLng } = useParams();
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const load = async () => {
    setError("");
    try {
      const res = await apiFetchWithAuth("/api/admin/admins");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || String(res.status));
      const data = await res.json();
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
    } catch (e) {
      setError(e?.message || t("admins.loadFailed"));
      setAdmins([]);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onBack?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const invite = async (e) => {
    e.preventDefault();
    if (busy || !inviteEmail.trim()) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await apiFetchWithAuth("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          origin: window.location.origin,
          language: (i18n.language || routeLng || "en").slice(0, 2).toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || t("admins.inviteFailed"));
      }
      const status = data?.admin?.email_status;
      if (status === "sent") {
        setInfo(t("admins.inviteSent", { email: inviteEmail.trim() }));
      } else if (status === "existing_user_magic_link") {
        setInfo(t("admins.inviteExisting", { email: inviteEmail.trim() }));
      } else if (status === "failed") {
        setError(
          t("admins.inviteEmailFailed", {
            email: inviteEmail.trim(),
            reason: data?.admin?.email_error || "unknown",
          })
        );
      } else {
        setInfo(t("admins.inviteAdded", { email: inviteEmail.trim() }));
      }
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err?.message || t("admins.inviteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (email) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetchWithAuth(
        `/api/admin/admins/${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || t("admins.revokeFailed"));
      }
      setConfirmRevoke(null);
      await load();
    } catch (err) {
      setError(err?.message || t("admins.revokeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.formWrap}>
      <button type="button" style={styles.detailBack} onClick={onBack}>
        {t("admins.back")}
      </button>
      <h2 style={styles.formTitle}>{t("admins.title")}</h2>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.25rem", fontSize: "0.9rem" }}>
        {t("admins.help")}
      </p>

      <form onSubmit={invite} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="email"
          style={{ ...styles.input, marginBottom: 0, flex: 1 }}
          placeholder={t("admins.emailPlaceholder")}
          value={inviteEmail}
          disabled={busy}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <button type="submit" style={styles.primaryBtn} disabled={busy}>
          {busy ? t("admins.working") : t("admins.invite")}
        </button>
      </form>

      {error ? <div style={styles.formInlineError} role="alert">{error}</div> : null}
      {info ? (
        <div
          style={{
            padding: "0.6rem 0.85rem",
            marginBottom: "0.75rem",
            background: "rgba(26,107,74,0.15)",
            color: "#1abc9c",
            borderRadius: 6,
            fontSize: "0.9rem",
          }}
        >
          {info}
        </div>
      ) : null}

      {admins === null ? (
        <div style={styles.empty}>{t("admins.loading")}</div>
      ) : admins.length === 0 ? (
        <div style={styles.empty}>{t("admins.emptyList")}</div>
      ) : (
        <div style={styles.adminTable}>
          <div style={styles.tableHead}>
            <span style={{ flex: 2 }}>{t("admins.colEmail")}</span>
            <span style={{ flex: 1 }}>{t("admins.colInvitedBy")}</span>
            <span style={{ flex: 1 }}>{t("admins.colStatus")}</span>
            <span style={{ flex: 1, textAlign: "right" }}>{t("admins.colActions")}</span>
          </div>
          {admins.map((a) => {
            const isSelf = currentEmail && currentEmail.toLowerCase() === a.email.toLowerCase();
            return (
              <div key={a.email} style={styles.tableRow}>
                {confirmRevoke === a.email ? (
                  <div style={styles.deleteConfirm}>
                    <span>{t("admins.revokeConfirm", { email: a.email })}</span>
                    <button
                      type="button"
                      style={styles.dangerBtn}
                      disabled={busy}
                      onClick={() => revoke(a.email)}
                    >
                      {busy ? t("admins.working") : t("admins.yesRevoke")}
                    </button>
                    <button
                      type="button"
                      style={styles.cancelBtn}
                      disabled={busy}
                      onClick={() => setConfirmRevoke(null)}
                    >
                      {t("admins.cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <span style={{ flex: 2, fontWeight: 600 }}>
                      {a.email}
                      {isSelf ? <span style={{ marginLeft: 8, color: "#4fa3ff", fontSize: "0.75rem" }}>{t("admins.you")}</span> : null}
                    </span>
                    <span style={{ flex: 1, color: "#8899aa", fontSize: "0.85rem" }}>
                      {a.invited_by || "—"}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: a.is_active ? "#1abc9c" : "#e67e22",
                      }}
                    >
                      {a.is_active ? t("admins.active") : t("admins.revoked")}
                    </span>
                    <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      {a.is_active && !isSelf ? (
                        <button
                          type="button"
                          style={styles.dangerBtn}
                          onClick={() => setConfirmRevoke(a.email)}
                        >
                          {t("admins.revoke")}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
