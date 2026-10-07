import { useTranslation } from "react-i18next";
import { styles } from "./styles.js";

export default function PreviewDialog({ onClose, children }) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("scenarioForm.previewTitle")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(4, 8, 14, 0.85)",
        display: "flex",
        justifyContent: "center",
        overflowY: "auto",
        padding: "2rem 1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0d1520",
          border: "1px solid #1a2a3a",
          borderRadius: 12,
          padding: "1.5rem",
          width: "100%",
          maxWidth: 1180,
          height: "fit-content",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ color: "#8899aa", fontSize: "0.85rem" }}>{t("scenarioForm.previewNote")}</span>
          <button type="button" style={styles.ghostBtn} onClick={onClose}>
            {t("scenarioForm.closePreview")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
