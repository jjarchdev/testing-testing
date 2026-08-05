import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { localePath } from "./utils.js";
import { styles } from "./styles.js";

/**
 * Static privacy notice covering Art 13/14 GDPR. Keep it short and factual —
 * the source of truth is docs/PRIVACY.md at the repo root. Update both when
 * anything changes about processors, retention, or purposes.
 *
 * Deployers MUST edit the {{CONTROLLER}} / {{EMAIL}} placeholders below with
 * their organisation's real contact details before going live.
 */
export default function PrivacyView() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();

  return (
    <div style={styles.homeWrap}>
      <main style={{ ...styles.homeInner, maxWidth: 820, textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <button
            type="button"
            style={styles.backBtn}
            onClick={() => navigate(localePath(lng))}
          >
            {t("privacy.back")}
          </button>
          <LanguageSwitcher />
        </div>

        <h1 style={{ ...styles.homeTitle, fontSize: "2rem", marginBottom: "0.5rem" }}>
          {t("privacy.title")}
        </h1>
        <p style={{ color: "#8899aa", marginTop: 0 }}>
          {t("privacy.updated", { date: "2026-08-05" })}
        </p>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.controllerHeading")}</h2>
          <p style={privacyP}>
            {t("privacy.controllerBody", { org: "{{CONTROLLER}}", email: "{{EMAIL}}" })}
          </p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.whatWeProcessHeading")}</h2>
          <p style={privacyP}>{t("privacy.whatWeProcessLead")}</p>
          <ul style={privacyUl}>
            <li>{t("privacy.wp.admin")}</li>
            <li>{t("privacy.wp.session")}</li>
            <li>{t("privacy.wp.ip")}</li>
            <li>{t("privacy.wp.confluence")}</li>
            <li>{t("privacy.wp.content")}</li>
          </ul>
          <p style={privacyP}>{t("privacy.noEmployeeTracking")}</p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.purposeHeading")}</h2>
          <ul style={privacyUl}>
            <li>{t("privacy.purpose.admin")}</li>
            <li>{t("privacy.purpose.security")}</li>
            <li>{t("privacy.purpose.confluence")}</li>
          </ul>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.legalBasisHeading")}</h2>
          <p style={privacyP}>{t("privacy.legalBasisBody")}</p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.retentionHeading")}</h2>
          <ul style={privacyUl}>
            <li>{t("privacy.retention.session")}</li>
            <li>{t("privacy.retention.ip")}</li>
            <li>{t("privacy.retention.content")}</li>
            <li>{t("privacy.retention.tokens")}</li>
          </ul>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.subprocessorsHeading")}</h2>
          <ul style={privacyUl}>
            <li>{t("privacy.sub.supabase")}</li>
            <li>{t("privacy.sub.render")}</li>
            <li>{t("privacy.sub.atlassian")}</li>
          </ul>
          <p style={privacyP}>{t("privacy.transfersBody")}</p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.cookiesHeading")}</h2>
          <p style={privacyP}>{t("privacy.cookiesBody")}</p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.securityHeading")}</h2>
          <ul style={privacyUl}>
            <li>{t("privacy.sec.https")}</li>
            <li>{t("privacy.sec.encRest")}</li>
            <li>{t("privacy.sec.encTokens")}</li>
            <li>{t("privacy.sec.access")}</li>
          </ul>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.rightsHeading")}</h2>
          <p style={privacyP}>{t("privacy.rightsBody")}</p>
          <ul style={privacyUl}>
            <li>{t("privacy.rights.access")}</li>
            <li>{t("privacy.rights.rectify")}</li>
            <li>{t("privacy.rights.erase")}</li>
            <li>{t("privacy.rights.portability")}</li>
            <li>{t("privacy.rights.object")}</li>
            <li>{t("privacy.rights.complain")}</li>
          </ul>
          <p style={privacyP}>{t("privacy.contactBody", { email: "{{EMAIL}}" })}</p>
        </section>

        <section style={privacySectionStyle}>
          <h2 style={privacyH2}>{t("privacy.breachHeading")}</h2>
          <p style={privacyP}>{t("privacy.breachBody")}</p>
        </section>
      </main>
    </div>
  );
}

const privacySectionStyle = { marginBottom: "1.75rem" };
const privacyH2 = { color: "#4fa3ff", fontSize: "1.05rem", marginBottom: "0.35rem" };
const privacyP = { color: "#eaf0fb", lineHeight: 1.55, margin: "0.35rem 0" };
const privacyUl = { color: "#eaf0fb", lineHeight: 1.55, paddingLeft: "1.2rem", margin: "0.35rem 0" };
