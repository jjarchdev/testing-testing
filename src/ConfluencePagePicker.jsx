import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchConfluenceStatus, searchConfluencePages } from "./api.js";
import { styles } from "./styles.js";

export default function ConfluencePagePicker({ value, onPick, onClear }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState({ loading: true, connected: false });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchConfluenceStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus({ loading: false, connected: !!data?.connected });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ loading: false, connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status.connected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await searchConfluencePages(query);
        setResults(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        setError(err?.message || t("confluence.searchFailed"));
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, status.connected, t]);

  if (status.loading) return null;

  if (!status.connected) {
    return (
      <div style={{ ...styles.confluenceStatusBox, marginTop: "0.5rem" }}>
        <div style={{ color: "#8899aa", fontSize: "0.85rem" }}>
          {t("confluence.pickerNoConnection")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      {value?.id ? (
        <div style={styles.confluencePicked}>
          <div>
            <div style={{ fontWeight: 700, color: "#eaf0fb" }}>
              {value.title || t("confluence.linkedPage")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#8899aa" }}>
              {t("confluence.pageIdLabel", { id: value.id })}
            </div>
            {value.url ? (
              <a
                href={value.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ fontSize: "0.85rem", color: "#4fa3ff" }}
              >
                {t("confluence.openInConfluence")} ↗
              </a>
            ) : null}
          </div>
          <button type="button" style={styles.cancelBtn} onClick={onClear}>
            {t("confluence.unlink")}
          </button>
        </div>
      ) : (
        <>
          <input
            style={styles.input}
            placeholder={t("confluence.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error ? <div style={styles.formInlineError}>{error}</div> : null}
          {searching ? (
            <div style={{ color: "#8899aa", fontSize: "0.85rem", padding: "0.5rem 0" }}>
              {t("confluence.searching")}
            </div>
          ) : null}
          {!searching && query.trim() && results.length === 0 && !error ? (
            <div style={{ color: "#8899aa", fontSize: "0.85rem", padding: "0.5rem 0" }}>
              {t("confluence.noResults")}
            </div>
          ) : null}
          {results.length > 0 ? (
            <div style={styles.confluenceResults}>
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  style={styles.confluenceResult}
                  onClick={() =>
                    onPick({
                      id: r.id,
                      url: r.url || "",
                      title: r.title || "",
                    })
                  }
                >
                  <span style={{ fontWeight: 600 }}>{r.title || "(untitled)"}</span>
                  {r.space ? (
                    <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "#8899aa" }}>
                      {r.space}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
