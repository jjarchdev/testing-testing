import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, fetchAdminSession } from "./api.js";
import i18n from "./i18n/index.js";
import { styles } from "./styles.js";

const AppDataContext = createContext(null);

const EMPTY_SERVER_CONFIG = {
  loaded: false,
  authConfigured: true,
  requireUsername: false,
  envLoginAvailable: false,
  supabaseAuthAvailable: false,
  supabaseUrl: null,
  supabaseAnonKey: null,
  privacyControllerName: null,
  privacyControllerEmail: null,
};

async function fetchList(path, key) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(String(res.status));
  const list = (await res.json())?.[key];
  if (!Array.isArray(list)) throw new Error("bad response");
  return list;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData outside provider");
  return ctx;
}

export function AppDataProvider({ children }) {
  const [scenarios, setScenarios] = useState(null);
  const [workPackages, setWorkPackages] = useState(null);
  const [guides, setGuides] = useState(null);
  const [guidesLoadError, setGuidesLoadError] = useState(null);
  const [scenariosLoadError, setScenariosLoadError] = useState(null);
  const [serverConfig, setServerConfig] = useState(EMPTY_SERVER_CONFIG);
  const [adminSession, setAdminSession] = useState(false);
  const [adminEmail, setAdminEmail] = useState(null);
  const [notification, setNotification] = useState(null);
  const notifyTimerRef = useRef(null);

  const notify = useCallback((msg, type = "success") => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    setNotification({ msg, type });
    notifyTimerRef.current = setTimeout(() => {
      setNotification(null);
      notifyTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    },
    []
  );

  const loadWorkPackagesFromServer = useCallback(async () => {
    try {
      setWorkPackages(await fetchList("/api/work-packages", "workPackages"));
    } catch {
      setWorkPackages([]);
    }
  }, []);

  const loadScenariosFromServer = useCallback(async () => {
    setScenariosLoadError(null);
    try {
      setScenarios(await fetchList("/api/scenarios", "scenarios"));
    } catch {
      setScenarios([]);
      setScenariosLoadError(i18n.t("employee.loadError"));
    }
  }, []);

  const loadGuidesFromServer = useCallback(async () => {
    setGuidesLoadError(null);
    try {
      setGuides(await fetchList("/api/guides", "guides"));
    } catch {
      setGuides([]);
      setGuidesLoadError(i18n.t("kb.loadError"));
    }
  }, []);

  useEffect(() => {
    loadScenariosFromServer();
    loadWorkPackagesFromServer();
    loadGuidesFromServer();
  }, [loadScenariosFromServer, loadWorkPackagesFromServer, loadGuidesFromServer]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch("/api/config").then((res) => res.json()), fetchAdminSession()])
      .then(([data, sessionInfo]) => {
        if (cancelled) return;
        setServerConfig({
          loaded: true,
          authConfigured: data?.authConfigured !== false,
          requireUsername: !!data?.requireUsername,
          envLoginAvailable: !!data?.envLoginAvailable,
          supabaseAuthAvailable: !!data?.supabaseAuthAvailable,
          supabaseUrl: data?.supabaseUrl || null,
          supabaseAnonKey: data?.supabaseAnonKey || null,
          privacyControllerName: data?.privacyControllerName || null,
          privacyControllerEmail: data?.privacyControllerEmail || null,
        });
        const isAdmin = !!(sessionInfo && sessionInfo.admin);
        setAdminSession(isAdmin);
        setAdminEmail(sessionInfo?.email || null);
      })
      .catch(() => {
        if (cancelled) return;
        setServerConfig({ ...EMPTY_SERVER_CONFIG, loaded: true, authConfigured: false });
        setAdminSession(false);
        setAdminEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      scenarios,
      setScenarios,
      workPackages,
      setWorkPackages,
      guides,
      setGuides,
      guidesLoadError,
      scenariosLoadError,
      serverConfig,
      adminSession,
      setAdminSession,
      adminEmail,
      setAdminEmail,
      notify,
      loadScenariosFromServer,
      loadWorkPackagesFromServer,
      loadGuidesFromServer,
    }),
    [
      scenarios,
      workPackages,
      guides,
      guidesLoadError,
      scenariosLoadError,
      serverConfig,
      adminSession,
      adminEmail,
      notify,
      loadScenariosFromServer,
      loadWorkPackagesFromServer,
      loadGuidesFromServer,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>
      {notification ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...styles.notification,
            background: notification.type === "error" ? "#c0392b" : "#1a6b4a",
          }}
        >
          {notification.msg}
        </div>
      ) : null}
      {children}
    </AppDataContext.Provider>
  );
}
