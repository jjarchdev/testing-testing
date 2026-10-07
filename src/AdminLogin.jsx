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

function LoginField({ id, label, value, onChange, disabled, type = "text", autoComplete }) {
  return (
    <>
      <label style={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        style={styles.loginInput}
        placeholder={label}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function PasswordField({ id, value, onChange, disabled }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <>
      <label style={fieldLabel} htmlFor={id}>
        {t("login.password")}
      </label>
      <div style={{ position: "relative", width: "100%" }}>
        <input
          id={id}
          type={shown ? "text" : "password"}
          style={{ ...styles.loginInput, width: "100%", boxSizing: "border-box", paddingRight: "4.5rem" }}
          placeholder={t("login.password")}
          value={value}
          disabled={disabled}
          autoComplete="current-password"
          aria-label={t("login.password")}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          disabled={disabled}
          aria-pressed={shown}
          style={showPasswordBtn}
        >
          {shown ? t("login.hidePassword") : t("login.showPassword")}
        </button>
      </div>
    </>
  );
}

function Messages({ error, info }) {
  return (
    <>
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
    </>
  );
}

function SubmitButton({ busy, children }) {
  return (
    <button type="submit" style={{ ...styles.primaryBtn, ...(busy ? styles.btnDisabled : {}) }} disabled={busy}>
      {children}
    </button>
  );
}

function TabBar({ tabs, active, onSelect, label, style }) {
  return (
    <div style={{ ...styles.tabRow, width: "100%", ...style }} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          style={{ ...styles.tabBtn, ...(active === tab.key ? styles.tabBtnActive : {}) }}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminLogin() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const {
    serverConfig,
    setAdminSession,
    loadScenariosFromServer,
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
        await loadScenariosFromServer();
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

  const run = async (action) => {
    if (busy) return;
    clearMsgs();
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (action) => (e) => {
    e.preventDefault();
    return run(action);
  };

  const authClient = async () => {
    const client = await getSupabaseAuth();
    if (!client) throw new Error(t("login.supabaseUnavailable"));
    return client;
  };

  const finishLogin = async () => {
    setAdminSession(true);
    setPassword("");
    await loadScenariosFromServer();
    navigate(localePath(lng, "admin"), { replace: true });
  };

  const submitEnvLogin = onSubmit(async () => {
    await loginWithEnvCredentials({ username: requireUsername ? username : "", password });
    await finishLogin();
  });

  const submitPassword = onSubmit(async () => {
    const client = await authClient();
    const { data, error: authError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) throw new Error(authError.message);
    const token = data?.session?.access_token;
    if (!token) throw new Error(t("login.noSession"));
    await exchangeForAppSession(token);
    await finishLogin();
  });

  const submitMagicLink = onSubmit(async () => {
    const client = await authClient();
    const { error: authError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: oauthRedirectUrl(lng) },
    });
    if (authError) throw new Error(authError.message);
    setInfo(t("login.magicSent"));
  });

  const submitRegister = onSubmit(async () => {
    const client = await authClient();
    const { error: authError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: oauthRedirectUrl(lng) },
    });
    if (authError) throw new Error(authError.message);
    setInfo(t("login.registerSent"));
  });

  const forgotPassword = () => {
    if (!email.trim()) {
      setError(t("login.needEmail"));
      return undefined;
    }
    return run(async () => {
      const client = await authClient();
      const { error: authError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetRedirectUrl(lng),
      });
      if (authError) throw new Error(authError.message);
      setInfo(t("login.resetSent"));
    });
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
          <TabBar
            tabs={[
              { key: "credentials", label: t("login.tabCredentials") },
              { key: "email", label: t("login.tabEmail") },
            ]}
            active={activePanel}
            onSelect={(key) => {
              setPanel(key);
              clearMsgs();
            }}
            label={t("login.title")}
            style={{ marginTop: "0.25rem" }}
          />
        ) : null}

        {activePanel === "credentials" && envAvailable ? (
          <>
            <p style={styles.loginSub}>
              {requireUsername ? t("login.userAndPass") : t("login.passwordOnly")}
            </p>
            <form onSubmit={submitEnvLogin} style={loginForm}>
              {requireUsername ? (
                <LoginField
                  id="admin-username"
                  label={t("login.username")}
                  value={username}
                  onChange={setUsername}
                  disabled={busy}
                  autoComplete="username"
                />
              ) : null}
              <PasswordField id="admin-password" value={password} onChange={setPassword} disabled={busy} />
              <Messages error={error} info={info} />
              <SubmitButton busy={busy}>{busy ? t("login.signingIn") : t("login.signIn")}</SubmitButton>
            </form>
          </>
        ) : null}

        {activePanel === "email" && supabaseAvailable ? (
          <>
            {!showPanelTabs ? (
              <p style={styles.loginSub}>{t("login.emailSubtitle")}</p>
            ) : null}
            <TabBar
              tabs={[
                { key: "password", label: t("login.tabPassword") },
                { key: "magic", label: t("login.tabMagic") },
                { key: "register", label: t("login.tabRegister") },
              ]}
              active={emailTab}
              onSelect={(key) => {
                setEmailTab(key);
                clearMsgs();
              }}
              label={t("login.emailSubtitle")}
              style={{ marginTop: showPanelTabs ? 0 : "0.25rem" }}
            />

            {emailTab === "password" ? (
              <form onSubmit={submitPassword} style={loginForm}>
                <LoginField
                  id="email-login"
                  label={t("login.emailPlaceholder")}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={busy}
                  autoComplete="username"
                />
                <PasswordField id="email-password" value={password} onChange={setPassword} disabled={busy} />
                <Messages error={error} info={info} />
                <SubmitButton busy={busy}>{busy ? t("login.signingIn") : t("login.signIn")}</SubmitButton>
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
                <LoginField
                  id="magic-email"
                  label={t("login.emailPlaceholder")}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={busy}
                />
                <Messages error={error} info={info} />
                <SubmitButton busy={busy}>{busy ? t("login.sending") : t("login.sendMagic")}</SubmitButton>
              </form>
            ) : (
              <form onSubmit={submitRegister} style={loginForm}>
                <LoginField
                  id="register-email"
                  label={t("login.emailPlaceholder")}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  disabled={busy}
                />
                <LoginField
                  id="register-password"
                  label={t("login.password")}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  disabled={busy}
                  autoComplete="new-password"
                />
                <p style={{ fontSize: "0.8rem", color: "#8899aa", margin: 0 }}>
                  {t("login.registerNote")}
                </p>
                <Messages error={error} info={info} />
                <SubmitButton busy={busy}>{busy ? t("login.working") : t("login.register")}</SubmitButton>
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
