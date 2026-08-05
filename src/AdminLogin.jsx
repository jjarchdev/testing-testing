import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppData } from "./AppData.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { loginWithEnvCredentials } from "./api.js";
import {
  exchangeForAppSession,
  getSupabaseAuth,
  oauthRedirectUrl,
  passwordResetRedirectUrl,
} from "./supabase.js";
import { localePath } from "./utils.js";
import { styles } from "./styles.js";

export default function AdminLogin() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const {
    serverConfig,
    setAdminSession,
    loadScenariosFromServer,
    loadCategoriesFromServer,
  } = useAppData();

  const envAvailable = !!serverConfig.envLoginAvailable;
  const requireUsername = !!serverConfig.requireUsername;
  const supabaseAvailable = !!serverConfig.supabaseAuthAvailable;
  const anyLogin = envAvailable || supabaseAvailable;
  const showPanelTabs = envAvailable && supabaseAvailable;

  const [panel, setPanel] = useState("credentials"); // credentials | email
  const [emailTab, setEmailTab] = useState("password"); // password | magic | register
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    if (!serverConfig.loaded) return;
    if (envAvailable) setPanel("credentials");
    else if (supabaseAvailable) setPanel("email");
  }, [serverConfig.loaded, envAvailable, supabaseAvailable]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabaseAvailable) return;
      const client = await getSupabaseAuth();
      if (!client || cancelled) return;
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      setExchanging(true);
      try {
        await exchangeForAppSession(token);
        setAdminSession(true);
        await Promise.all([loadScenariosFromServer(), loadCategoriesFromServer()]);
        navigate(localePath(lng, "admin"), { replace: true });
      } catch (err) {
        setError(err?.message || t("login.exchangeFailed"));
      } finally {
        if (!cancelled) setExchanging(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseAvailable]);

  const authErrorMessage = (err) => {
    const msg = String(err?.message || "");
    if (/rate.?limit|over_email/i.test(msg)) return t("login.rateLimited");
    return msg || t("login.failed");
  };

  const clearMsgs = () => {
    setError("");
    setInfo("");
  };

  const finishLogin = async () => {
    setAdminSession(true);
    setPassword("");
    await Promise.all([loadScenariosFromServer(), loadCategoriesFromServer()]);
    navigate(localePath(lng, "admin"), { replace: true });
  };

  const submitEnvLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMsgs();
    setBusy(true);
    try {
      await loginWithEnvCredentials({
        username: requireUsername ? username : "",
        password,
      });
      await finishLogin();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMsgs();
    setBusy(true);
    try {
      const client = await getSupabaseAuth();
      if (!client) throw new Error(t("login.supabaseUnavailable"));
      const { data, error: authError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw new Error(authError.message);
      const token = data?.session?.access_token;
      if (!token) throw new Error(t("login.noSession"));
      await exchangeForAppSession(token);
      await finishLogin();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitMagicLink = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMsgs();
    setBusy(true);
    try {
      const client = await getSupabaseAuth();
      if (!client) throw new Error(t("login.supabaseUnavailable"));
      const { error: authError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: oauthRedirectUrl(lng) },
      });
      if (authError) throw new Error(authError.message);
      setInfo(t("login.magicSent"));
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMsgs();
    setBusy(true);
    try {
      const client = await getSupabaseAuth();
      if (!client) throw new Error(t("login.supabaseUnavailable"));
      const { error: authError } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: oauthRedirectUrl(lng) },
      });
      if (authError) throw new Error(authError.message);
      setInfo(t("login.registerSent"));
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (busy || !email.trim()) {
      setError(t("login.needEmail"));
      return;
    }
    clearMsgs();
    setBusy(true);
    try {
      const client = await getSupabaseAuth();
      if (!client) throw new Error(t("login.supabaseUnavailable"));
      const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectUrl(lng),
      });
      if (authError) throw new Error(authError.message);
      setInfo(t("login.resetSent"));
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activePanel = showPanelTabs
    ? panel
    : envAvailable
      ? "credentials"
      : "email";

  if (!serverConfig.loaded || exchanging) {
    return (
      <div style={styles.loginWrap}>
        <main style={styles.loginBox}>
          <div style={styles.loginIcon}>⚙</div>
          <p style={styles.loginSub}>{exchanging ? t("login.exchanging") : t("login.wait")}</p>
        </main>
      </div>
    );
  }

  if (!anyLogin) {
    return (
      <div style={styles.loginWrap}>
        <main style={styles.loginBox}>
          <div style={styles.loginIcon}>⚙</div>
          <h2 style={styles.loginTitle}>{t("login.title")}</h2>
          <p style={styles.loginSub}>{t("login.disabled")}</p>
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={() => navigate(localePath(lng))}
          >
            {t("login.back")}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div style={styles.loginWrap}>
      <main style={{ ...styles.loginBox, maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LanguageSwitcher />
        </div>
        <div style={styles.loginIcon}>⚙</div>
        <h2 style={styles.loginTitle}>{t("login.title")}</h2>

        {showPanelTabs ? (
          <div style={{ ...styles.tabRow, width: "100%", marginTop: "0.25rem" }} role="tablist" aria-label={t("login.title")}>
            <button
              type="button"
              role="tab"
              aria-selected={activePanel === "credentials"}
              style={{
                ...styles.tabBtn,
                ...(activePanel === "credentials" ? styles.tabBtnActive : {}),
              }}
              onClick={() => {
                setPanel("credentials");
                clearMsgs();
              }}
            >
              {t("login.tabCredentials")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePanel === "email"}
              style={{
                ...styles.tabBtn,
                ...(activePanel === "email" ? styles.tabBtnActive : {}),
              }}
              onClick={() => {
                setPanel("email");
                clearMsgs();
              }}
            >
              {t("login.tabEmail")}
            </button>
          </div>
        ) : null}

        {activePanel === "credentials" && envAvailable ? (
          <>
            <p style={styles.loginSub}>
              {requireUsername ? t("login.userAndPass") : t("login.passwordOnly")}
            </p>
            <form onSubmit={submitEnvLogin} style={loginForm}>
              {requireUsername ? (
                <>
                  <label style={fieldLabel} htmlFor="admin-username">{t("login.username")}</label>
                  <input
                    id="admin-username"
                    type="text"
                    style={styles.loginInput}
                    placeholder={t("login.username")}
                    value={username}
                    disabled={busy}
                    autoComplete="username"
                    aria-label={t("login.username")}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </>
              ) : null}
              <label style={fieldLabel} htmlFor="admin-password">{t("login.password")}</label>
              <div style={{ position: "relative", width: "100%" }}>
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  style={{
                    ...styles.loginInput,
                    width: "100%",
                    boxSizing: "border-box",
                    paddingRight: "4.5rem",
                  }}
                  placeholder={t("login.password")}
                  value={password}
                  disabled={busy}
                  autoComplete="current-password"
                  aria-label={t("login.password")}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={busy}
                  aria-pressed={showPassword}
                  style={showPasswordBtn}
                >
                  {showPassword ? t("login.hidePassword") : t("login.showPassword")}
                </button>
              </div>
              {error ? (
                <div style={styles.loginError} role="alert">
                  {error}
                </div>
              ) : null}
              {info ? (
                <div style={loginInfo} role="status">
                  {info}
                </div>
              ) : null}
              <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                {busy ? t("login.signingIn") : t("login.signIn")}
              </button>
            </form>
          </>
        ) : null}

        {activePanel === "email" && supabaseAvailable ? (
          <>
            {!showPanelTabs ? (
              <p style={styles.loginSub}>{t("login.emailSubtitle")}</p>
            ) : null}
            <div
              style={{
                ...styles.tabRow,
                width: "100%",
                marginTop: showPanelTabs ? 0 : "0.25rem",
              }}
              role="tablist"
              aria-label={t("login.emailSubtitle")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={emailTab === "password"}
                style={{
                  ...styles.tabBtn,
                  ...(emailTab === "password" ? styles.tabBtnActive : {}),
                }}
                onClick={() => {
                  setEmailTab("password");
                  clearMsgs();
                }}
              >
                {t("login.tabPassword")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={emailTab === "magic"}
                style={{
                  ...styles.tabBtn,
                  ...(emailTab === "magic" ? styles.tabBtnActive : {}),
                }}
                onClick={() => {
                  setEmailTab("magic");
                  clearMsgs();
                }}
              >
                {t("login.tabMagic")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={emailTab === "register"}
                style={{
                  ...styles.tabBtn,
                  ...(emailTab === "register" ? styles.tabBtnActive : {}),
                }}
                onClick={() => {
                  setEmailTab("register");
                  clearMsgs();
                }}
              >
                {t("login.tabRegister")}
              </button>
            </div>

            {emailTab === "password" ? (
              <form onSubmit={submitPassword} style={loginForm}>
                <label style={fieldLabel} htmlFor="email-login">{t("login.emailPlaceholder")}</label>
                <input
                  id="email-login"
                  type="email"
                  style={styles.loginInput}
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  disabled={busy}
                  autoComplete="username"
                  aria-label={t("login.emailPlaceholder")}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label style={fieldLabel} htmlFor="email-password">{t("login.password")}</label>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    id="email-password"
                    type={showPassword ? "text" : "password"}
                    style={{
                      ...styles.loginInput,
                      width: "100%",
                      boxSizing: "border-box",
                      paddingRight: "4.5rem",
                    }}
                    placeholder={t("login.password")}
                    value={password}
                    disabled={busy}
                    autoComplete="current-password"
                    aria-label={t("login.password")}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={busy}
                    aria-pressed={showPassword}
                    style={showPasswordBtn}
                  >
                    {showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  </button>
                </div>
                {error ? (
                  <div style={styles.loginError} role="alert">
                    {error}
                  </div>
                ) : null}
                {info ? (
                  <div style={loginInfo} role="status">
                    {info}
                  </div>
                ) : null}
                <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                  {busy ? t("login.signingIn") : t("login.signIn")}
                </button>
                <button
                  type="button"
                  style={{ ...styles.ghostBtn, marginTop: 4, ...(busy ? styles.btnDisabled : {}) }}
                  onClick={forgotPassword}
                  disabled={busy}
                >
                  {t("login.forgot")}
                </button>
              </form>
            ) : emailTab === "magic" ? (
              <form onSubmit={submitMagicLink} style={loginForm}>
                <label style={fieldLabel} htmlFor="magic-email">{t("login.emailPlaceholder")}</label>
                <input
                  id="magic-email"
                  type="email"
                  style={styles.loginInput}
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  disabled={busy}
                  aria-label={t("login.emailPlaceholder")}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {error ? (
                  <div style={styles.loginError} role="alert">
                    {error}
                  </div>
                ) : null}
                {info ? (
                  <div style={loginInfo} role="status">
                    {info}
                  </div>
                ) : null}
                <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                  {busy ? t("login.sending") : t("login.sendMagic")}
                </button>
              </form>
            ) : (
              <form onSubmit={submitRegister} style={loginForm}>
                <label style={fieldLabel} htmlFor="register-email">{t("login.emailPlaceholder")}</label>
                <input
                  id="register-email"
                  type="email"
                  style={styles.loginInput}
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  disabled={busy}
                  aria-label={t("login.emailPlaceholder")}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label style={fieldLabel} htmlFor="register-password">{t("login.password")}</label>
                <input
                  id="register-password"
                  type="password"
                  style={styles.loginInput}
                  placeholder={t("login.password")}
                  value={password}
                  disabled={busy}
                  autoComplete="new-password"
                  aria-label={t("login.password")}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p style={{ fontSize: "0.8rem", color: "#8899aa", margin: 0 }}>
                  {t("login.registerNote")}
                </p>
                {error ? (
                  <div style={styles.loginError} role="alert">
                    {error}
                  </div>
                ) : null}
                {info ? (
                  <div style={loginInfo} role="status">
                    {info}
                  </div>
                ) : null}
                <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
                  {busy ? t("login.working") : t("login.register")}
                </button>
              </form>
            )}
          </>
        ) : null}

        <button
          type="button"
          style={{ ...styles.ghostBtn, marginTop: "1rem" }}
          onClick={() => navigate(localePath(lng))}
          disabled={busy}
        >
          {t("login.back")}
        </button>
      </main>
    </div>
  );
}

const loginForm = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  width: "100%",
};
const fieldLabel = {
  fontSize: "0.8rem",
  color: "#8899aa",
  marginBottom: -4,
};
const loginInfo = {
  padding: "0.5rem 0.75rem",
  background: "rgba(26,107,74,0.15)",
  color: "#1abc9c",
  borderRadius: 6,
  fontSize: "0.85rem",
};
const showPasswordBtn = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  border: "none",
  background: "transparent",
  color: "#4fa3ff",
  fontWeight: 700,
  fontSize: "0.75rem",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: "0.35rem 0.4rem",
};
