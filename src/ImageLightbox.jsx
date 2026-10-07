import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { styles } from "./styles.js";
import { renderInlineFormatting } from "./richText.jsx";

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.5;

const navBtn = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 48,
  height: 64,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(8, 14, 22, 0.7)",
  color: "#eaf0fb",
  fontSize: "1.6rem",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
};

export default function ImageLightbox({ images, index, onIndexChange, onClose, richCaption = false }) {
  const { t } = useTranslation();
  const labels = {
    dialog: t("employee.imageLightbox"),
    close: t("employee.closeImage"),
    prev: t("employee.prevImage"),
    next: t("employee.nextImage"),
    zoomIn: t("employee.zoomIn"),
    zoomOut: t("employee.zoomOut"),
    zoomReset: t("employee.zoomReset"),
  };
  const [zoom, setZoom] = useState(1);
  const touch = useRef(null);
  const closeRef = useRef(null);
  const count = images.length;
  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < count - 1;

  useEffect(() => {
    setZoom(1);
  }, [index]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      let handled = true;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      else if (e.key === "-" || e.key === "_") setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      else if (e.key === "0") setZoom(1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!current) return null;

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || zoom > 1) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > 70) return;
    if (dx < 0 && hasNext) onIndexChange(index + 1);
    if (dx > 0 && hasPrev) onIndexChange(index - 1);
  };

  return (
    <div
      className="no-print"
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(4, 8, 14, 0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3.5rem 1rem 1rem",
        cursor: "zoom-out",
      }}
    >
      <button
        ref={closeRef}
        type="button"
        style={{ ...styles.ghostBtn, position: "absolute", top: 12, right: 12, padding: "0.5rem 1rem", zIndex: 3 }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        {labels.close}
      </button>
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label={labels.prev}
            disabled={!hasPrev}
            style={{ ...navBtn, left: 10, opacity: hasPrev ? 1 : 0.25, cursor: hasPrev ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              if (hasPrev) onIndexChange(index - 1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.next}
            disabled={!hasNext}
            style={{ ...navBtn, right: 10, opacity: hasNext ? 1 : 0.25, cursor: hasNext ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              if (hasNext) onIndexChange(index + 1);
            }}
          >
            ›
          </button>
        </>
      ) : null}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6rem",
          maxWidth: "min(94vw, 1100px)",
          width: "100%",
          cursor: "default",
        }}
      >
        <div
          style={{
            overflow: "auto",
            maxWidth: "100%",
            maxHeight: "68vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <img
            src={current.url}
            alt={current.caption || ""}
            style={
              zoom > 1
                ? { width: `calc(min(92vw, 1100px) * ${zoom})`, maxWidth: "none", maxHeight: "none", borderRadius: 8 }
                : { maxWidth: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: 8 }
            }
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            style={{ ...styles.ghostBtn, padding: "0.35rem 0.8rem" }}
            disabled={zoom <= ZOOM_MIN}
            aria-label={labels.zoomOut}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          >
            −
          </button>
          <button
            type="button"
            style={{ ...styles.ghostBtn, padding: "0.35rem 0.8rem", minWidth: 60, justifyContent: "center" }}
            aria-label={labels.zoomReset}
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            style={{ ...styles.ghostBtn, padding: "0.35rem 0.8rem" }}
            disabled={zoom >= ZOOM_MAX}
            aria-label={labels.zoomIn}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          >
            +
          </button>
          {count > 1 ? (
            <span style={{ color: "#8899aa", fontSize: "0.85rem", fontWeight: 600, marginLeft: "0.5rem" }}>
              {index + 1} / {count}
            </span>
          ) : null}
        </div>
        {current.title || current.caption ? (
          <div style={{ textAlign: "center", maxWidth: 760 }}>
            {current.title ? (
              <div style={{ color: "#4fa3ff", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {current.title}
              </div>
            ) : null}
            {current.caption ? (
              <div style={{ color: "#eaf0fb", fontSize: richCaption ? "1.05rem" : "0.95rem", lineHeight: 1.5, marginTop: 2 }}>
                {richCaption ? renderInlineFormatting(current.caption) : current.caption}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
