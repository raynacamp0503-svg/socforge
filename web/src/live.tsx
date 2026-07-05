import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface AlertToast {
  id: number;
  caseId: number;
  title: string;
  severity: string;
  scenario: string;
}

interface LiveCtx {
  refreshKey: number; // bumps whenever the server broadcasts a change
}

const Ctx = createContext<LiveCtx>({ refreshKey: 0 });
export const useLive = () => useContext(Ctx);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  const nav = useNavigate();
  const idRef = useRef(0);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('alert', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, ...data }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 12000);
      setRefreshKey((k) => k + 1);
    });
    es.addEventListener('case', () => setRefreshKey((k) => k + 1));
    return () => es.close();
  }, []);

  return (
    <Ctx.Provider value={{ refreshKey }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            onClick={() => {
              setToasts((x) => x.filter((y) => y.id !== t.id));
              nav(`/cases/${t.caseId}`);
            }}
          >
            <div className="toast-title">
              🚨 New {t.severity.toUpperCase()} alert
            </div>
            <div className="toast-sub">{t.title}</div>
            <div className="toast-sub faint">Click to open case #{t.caseId}</div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
