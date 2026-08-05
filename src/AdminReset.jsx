import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getSupabaseAuth } from "./supabase.js";
import { localePath } from "./utils.js";
import { styles } from "./styles.js";

export default function AdminReset() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = await getSupabaseAuth();
      if (!client || cancelled) return;
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (!data?.session) {
        setError(t("reset.linkExpired"));
      } else {
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 8) return setError(t("reset.tooShort"));
    if (password !== confirm) return setError(t("reset.mismatch"));
    setBusy(true);
    try {
      const client = await getSupabaseAuth();
      if (!client) throw new Error(t("login.supabaseUnavailable"));
      const { error: err } = await client.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      await client.auth.signOut();
      setDone(true);
    } catch (err) {
      setError(err?.message || t("reset.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.loginWrap}>
      <main style={styles.loginBox}>
        <div style={styles.loginIcon}>⚙</div>
        <h2 style={styles.loginTitle}>{t("reset.title")}</h2>
        {done ? (
          <>
            <p style={styles.loginSub}>{t("reset.success")}</p>
            <button
              type="button"
              style={styles.primaryBtn}
              onClick={() => navigate(localePath(lng, "admin", "login"))}
            >
              {t("reset.goSignIn")}
            </button>
          </>
        ) : ready ? (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
            <input
              type="password"
              style={styles.loginInput}
              placeholder={t("reset.newPassword")}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              style={styles.loginInput}
              placeholder={t("reset.confirm")}
              value={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error ? <div style={styles.loginError} role="alert">{error}</div> : null}
            <button type="submit" style={styles.primaryBtn} disabled={busy}>
              {busy ? t("reset.saving") : t("reset.save")}
            </button>
          </form>
        ) : (
          <p style={styles.loginSub}>{error || t("reset.checking")}</p>
        )}
        <button
          type="button"
          style={{ ...styles.ghostBtn, marginTop: "1rem" }}
          onClick={() => navigate(localePath(lng, "admin", "login"))}
          disabled={busy}
        >
          {t("login.back")}
        </button>
      </main>
    </div>
  );
}
