import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { localePath } from "./utils.js";

const STORAGE_KEY = "qm_cookie_notice_acked";

export default function CookieNotice() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t("cookie.aria")}
      style={{
        position: "fixed",
        bottom: "0.75rem",
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: 640,
        width: "calc(100% - 1.5rem)",
        padding: "0.75rem 1rem",
        background: "#0f1923",
        border: "1px solid #1a2a3a",
        borderRadius: 10,
        color: "#eaf0fb",
        fontSize: "0.85rem",
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "space-between",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        zIndex: 90,
      }}
    >
      <span style={{ flex: "1 1 240px" }}>{t("cookie.body")}</span>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => {
            if (lng) navigate(localePath(lng, "privacy"));
          }}
          style={{
            border: "1px solid #1a2a3a",
            background: "transparent",
            color: "#8899aa",
            padding: "0.35rem 0.75rem",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "0.8rem",
          }}
        >
          {t("cookie.readMore")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            border: "none",
            background: "#4fa3ff",
            color: "#08131f",
            padding: "0.35rem 0.85rem",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "0.8rem",
          }}
        >
          {t("cookie.ok")}
        </button>
      </div>
    </div>
  );
}
