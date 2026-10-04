import { useEffect, useId, useMemo, useRef, useState } from "react";
import { styles } from "./styles.js";

const SEARCH_THRESHOLD = 6;

export default function Dropdown({
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "",
  summary,
  searchPlaceholder = "",
  emptyText = "",
  ariaLabel,
  disabled = false,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selectedValues = multiple ? value : [value];
  const selectedOptions = options.filter((o) => selectedValues.includes(o.value));
  const searchable = options.length > SEARCH_THRESHOLD;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    const firstSelected = options.findIndex((o) => selectedValues.includes(o.value));
    setQuery("");
    setActiveIndex(firstSelected >= 0 ? firstSelected : 0);
    setOpen(true);
  };

  const closeMenu = (refocus) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (option) => {
    if (multiple) {
      onChange(
        selectedValues.includes(option.value)
          ? selectedValues.filter((v) => v !== option.value)
          : [...selectedValues, option.value]
      );
      return;
    }
    onChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) closeMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) (searchRef.current || listRef.current)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const move = (delta) => {
    if (!visible.length) return;
    setActiveIndex((i) => (i + delta + visible.length) % visible.length);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.target === triggerRef.current && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(visible.length - 1, 0));
    } else if (e.key === "Enter" || (e.key === " " && e.target !== searchRef.current)) {
      e.preventDefault();
      if (visible[activeIndex]) choose(visible[activeIndex]);
    }
  };

  const label = selectedOptions.length
    ? summary
      ? summary(selectedOptions)
      : selectedOptions.map((o) => o.label).join(", ")
    : placeholder;

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        style={{
          ...styles.select,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          textAlign: "left",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          border: `1px solid ${open ? "#4fa3ff" : "#1a2a3a"}`,
          boxShadow: open ? "0 0 0 3px rgba(79, 163, 255, 0.18)" : "none",
          color: selectedOptions.length ? "#eaf0fb" : "#8899aa",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span aria-hidden="true" style={{ color: "#4fa3ff", fontSize: "0.7rem", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <div
          onMouseDown={(e) => {
            if (e.target !== searchRef.current) e.preventDefault();
          }}
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#0f1923",
            border: "1px solid #1a2a3a",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.5)",
            padding: 6,
          }}
        >
          {searchable ? (
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={visible.length ? `${listId}-${activeIndex}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#111e2c",
                border: "1px solid #1a2a3a",
                borderRadius: 8,
                padding: "0.5rem 0.7rem",
                marginBottom: 6,
                color: "#eaf0fb",
                fontSize: "0.9rem",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          ) : null}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-multiselectable={multiple || undefined}
            aria-label={ariaLabel}
            aria-activedescendant={!searchable && visible.length ? `${listId}-${activeIndex}` : undefined}
            style={{ maxHeight: 240, overflowY: "auto", outline: "none" }}
          >
            {visible.length === 0 ? (
              <div style={{ padding: "0.6rem 0.7rem", color: "#8899aa", fontSize: "0.85rem" }}>{emptyText}</div>
            ) : (
              visible.map((o, i) => {
                const isSelected = selectedValues.includes(o.value);
                const isActive = i === activeIndex;
                return (
                  <div
                    key={o.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(o)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "0.5rem 0.7rem",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? "#eaf0fb" : "#b7c4d4",
                      background: isActive ? "rgba(79, 163, 255, 0.14)" : "transparent",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {o.hint != null ? (
                        <span style={{ color: "#5c7186", fontSize: "0.78rem", fontWeight: 600 }}>{o.hint}</span>
                      ) : null}
                      <span
                        aria-hidden="true"
                        style={{ width: 14, color: "#4fa3ff", visibility: isSelected ? "visible" : "hidden" }}
                      >
                        ✓
                      </span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
