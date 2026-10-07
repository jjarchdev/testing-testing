const ACCENT_PALETTE = [
  "#e74c3c",
  "#e67e22",
  "#3498db",
  "#9b59b6",
  "#1abc9c",
  "#2980b9",
  "#16a085",
  "#c0392b",
  "#8e44ad",
  "#27ae60",
];

const DEFAULT_ACCENT = "#7f8c8d";

export function accentForLabel(label) {
  const s = String(label || "");
  if (!s) return DEFAULT_ACCENT;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function localePath(lng, ...parts) {
  const rest = parts.filter(Boolean).join("/").replace(/^\/+/, "");
  return rest ? `/${lng}/${rest}` : `/${lng}`;
}

export function splitTags(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pressableProps(onActivate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
