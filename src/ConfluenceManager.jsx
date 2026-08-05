import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  connectConfluenceDc,
  disconnectConfluence,
  fetchConfluenceStatus,
  startConfluenceCloudConnect,
} from "./api.js";
import { styles } from "./styles.js";

export default function ConfluenceManager({ onBack, onChanged }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ loading: true, data: null, error: "" });
  const [flavor, setFlavor] = useState("cloud");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("ok");
  const [dcForm, setDcForm] = useState({
    baseUrl: "",
    username: "",
    personalAccessToken: "",
  });

  const showMessage = (text, kind = "ok") => {
    setMessage(text);
    setMessageKind(kind);
  };

  const load = () => {
    setStatus({ loading: true, data: null, error: "" });
    fetchConfluenceStatus()
      .then((data) => setStatus({ loading: false, data, error: "" }))
      .catch((err) =>
        setStatus({ loading: false, data: null, error: err?.message || t("confluence.statusFailed") })
      );
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onMsg = (e) => {
      if (e?.data?.type === "qm-confluence-callback") {
        load();
        onChanged?.();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onChanged]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onBack?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const connectCloud = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const url = await startConfluenceCloudConnect();
      window.location.assign(url);
    } catch (err) {
      showMessage(err?.message || t("confluence.connectFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const connectDc = async () => {
    if (busy) return;
    if (!dcForm.baseUrl.trim() || !dcForm.personalAccessToken.trim()) {
      showMessage(t("confluence.dcNeedFields"), "error");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await connectConfluenceDc(dcForm);
      setDcForm({ baseUrl: "", username: "", personalAccessToken: "" });
      showMessage(t("confluence.connectedOk"), "ok");
      load();
      onChanged?.();
    } catch (err) {
      showMessage(err?.message || t("confluence.connectFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    if (!window.confirm(t("confluence.disconnectConfirm"))) return;
    setBusy(true);
    setMessage("");
    try {
      await disconnectConfluence();
      showMessage(t("confluence.disconnected"), "ok");
      load();
      onChanged?.();
    } catch (err) {
      showMessage(err?.message || t("confluence.disconnectFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const data = status.data || {};
  const connected = !!data.connected;

  return (
    <div style={styles.formWrap}>
      <button type="button" style={styles.detailBack} onClick={onBack}>
        {t("confluence.back")}
      </button>
      <h2 style={styles.formTitle}>{t("confluence.title")}</h2>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.25rem", fontSize: "0.9rem" }}>
        {t("confluence.help")}
      </p>

      {status.loading ? (
        <div style={styles.empty}>{t("confluence.loadingStatus")}</div>
      ) : status.error ? (
        <div style={styles.formInlineError} role="alert">
          {status.error}
          <button type="button" style={{ ...styles.ghostBtn, marginTop: 8 }} onClick={load}>
            {t("employee.retry")}
          </button>
        </div>
      ) : connected ? (
        <div style={styles.confluenceStatusBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#1abc9c", marginBottom: 4 }}>
                {t("confluence.connectedTo", { flavor: data.flavor === "cloud" ? "Cloud" : "Data Center" })}
              </div>
              <div style={{ color: "#eaf0fb" }}>
                {data.display_name || data.base_url}
              </div>
              {data.account_label ? (
                <div style={{ color: "#8899aa", fontSize: "0.85rem", marginTop: 2 }}>
                  {t("confluence.asAccount", { account: data.account_label })}
                </div>
              ) : null}
            </div>
            <button type="button" style={styles.dangerBtn} onClick={disconnect} disabled={busy}>
              {busy ? t("confluence.working") : t("confluence.disconnect")}
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.confluenceStatusBox}>
          <div style={{ color: "#e67e22", fontWeight: 700 }}>{t("confluence.notConnected")}</div>
          <div style={{ color: "#8899aa", fontSize: "0.9rem", marginTop: 4 }}>
            {t("confluence.notConnectedHint")}
          </div>
        </div>
      )}

      {message ? (
        <div
          role={messageKind === "error" ? "alert" : "status"}
          style={{
            ...styles.confluenceStatusBox,
            borderColor: messageKind === "error" ? "#e67e22" : "#1abc9c",
            color: messageKind === "error" ? "#e67e22" : "#1abc9c",
          }}
        >
          {message}
        </div>
      ) : null}

      {!connected ? (
        <>
          <div style={styles.tabRow}>
            <button
              type="button"
              style={{ ...styles.tabBtn, ...(flavor === "cloud" ? styles.tabBtnActive : {}) }}
              onClick={() => setFlavor("cloud")}
            >
              {t("confluence.cloudTab")}
            </button>
            <button
              type="button"
              style={{ ...styles.tabBtn, ...(flavor === "dc" ? styles.tabBtnActive : {}) }}
              onClick={() => setFlavor("dc")}
            >
              {t("confluence.dcTab")}
            </button>
          </div>

          {flavor === "cloud" ? (
            <div>
              <p style={{ color: "#8899aa", fontSize: "0.9rem" }}>
                {t("confluence.cloudBlurb")}
              </p>
              {!data.cloud_available ? (
                <div style={styles.formInlineError}>
                  {t("confluence.cloudNotConfigured")}
                </div>
              ) : null}
              <button
                type="button"
                style={styles.primaryBtn}
                disabled={busy || !data.cloud_available}
                onClick={connectCloud}
              >
                {busy ? t("confluence.working") : t("confluence.connectCloud")}
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: "#8899aa", fontSize: "0.9rem" }}>
                {t("confluence.dcBlurb")}
              </p>
              <label style={styles.label}>{t("confluence.baseUrl")}</label>
              <input
                style={styles.input}
                placeholder="https://confluence.example.com"
                value={dcForm.baseUrl}
                disabled={busy}
                onChange={(e) => setDcForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
              <label style={styles.label}>{t("confluence.usernameOptional")}</label>
              <input
                style={styles.input}
                placeholder="you@example.com"
                value={dcForm.username}
                disabled={busy}
                autoComplete="off"
                onChange={(e) => setDcForm((f) => ({ ...f, username: e.target.value }))}
              />
              <label style={styles.label}>{t("confluence.pat")}</label>
              <input
                style={styles.input}
                type="password"
                placeholder={t("confluence.patPlaceholder")}
                value={dcForm.personalAccessToken}
                disabled={busy}
                autoComplete="off"
                onChange={(e) =>
                  setDcForm((f) => ({ ...f, personalAccessToken: e.target.value }))
                }
              />
              <div style={styles.formActions}>
                <button type="button" style={styles.primaryBtn} disabled={busy} onClick={connectDc}>
                  {busy ? t("confluence.working") : t("confluence.connectDc")}
                </button>
              </div>
              <p style={{ color: "#8899aa", fontSize: "0.8rem", marginTop: "0.75rem" }}>
                {t("confluence.patStorageNote")}
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
