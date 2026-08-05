import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchConfluencePage } from "./api.js";
import { styles } from "./styles.js";

/**
 * Renders a Confluence page fetched from the server proxy. Server has already
 * sanitized the HTML (allowlist tags, javascript: URIs stripped), so injecting
 * it via dangerouslySetInnerHTML is intentional and bounded.
 */
export default function ConfluenceView({ pageId, pageUrl, pageTitle }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true, page: null, error: "" });

  useEffect(() => {
    if (!pageId) {
      setState({ loading: false, page: null, error: "" });
      return;
    }
    let cancelled = false;
    setState({ loading: true, page: null, error: "" });
    fetchConfluencePage(pageId)
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, page: data?.page || null, error: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          page: null,
          error: err?.message || t("confluence.loadFailed"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, t]);

  if (!pageId) return null;

  const displayTitle = state.page?.title || pageTitle || t("confluence.linkedPage");
  const displayUrl = state.page?.url || pageUrl || "";

  return (
    <section style={styles.confluenceBox} aria-label={t("confluence.sectionLabel")}>
      <header style={styles.confluenceHeader}>
        <div>
          <div style={styles.confluenceEyebrow}>{t("confluence.eyebrow")}</div>
          <div style={styles.confluenceTitle}>{displayTitle}</div>
        </div>
        {displayUrl ? (
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={styles.confluenceOpenLink}
          >
            {t("confluence.openInConfluence")} ↗
          </a>
        ) : null}
      </header>
      {state.loading ? (
        <div style={styles.confluenceStatus}>{t("confluence.loading")}</div>
      ) : state.error ? (
        <div style={{ ...styles.confluenceStatus, color: "#e67e22" }}>{state.error}</div>
      ) : state.page ? (
        <div
          className="confluence-body"
          style={styles.confluenceBody}
          // eslint-disable-next-line react/no-danger -- server-sanitized allowlist HTML
          dangerouslySetInnerHTML={{ __html: state.page.html || "" }}
        />
      ) : (
        <div style={styles.confluenceStatus}>{t("confluence.empty")}</div>
      )}
    </section>
  );
}
