import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Eye, EyeOff, LogOut, Menu, Search } from "lucide-react";
import clsx from "clsx";
import type { AppNotification, PublicUser } from "@shared/types";
import { api, platform } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { applyRemoteData, useSession } from "@/store/session";
import { useUi } from "@/store/ui";
import { Toaster } from "@/components/ui/Toaster";
import { Sheet } from "@/components/ui/Sheet";
import { PrivateAmounts } from "@/components/ui/primitives";
import { LogoMark } from "@/components/Logo";
import { NotificationIcon } from "@/components/NotificationIcon";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { isActive } from "./nav";
import { navFor, tabItems, useTabs } from "./tabBar";

function NotificationsPopover({ onClose }: { onClose: () => void }) {
  const notifications = useSession((s) => s.notifications);
  const setNotifications = useSession((s) => s.setNotifications);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Toque fora fecha; o próprio sino é ignorado aqui porque ele já alterna (abre/fecha).
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest?.("[data-notifications-toggle]")) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const open = (n: AppNotification) => {
    void api.notifications.markRead(n.id).then(setNotifications);
    navigate(n.link ?? "/alertas");
    onClose();
  };
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 36 }}
      className="no-drag absolute right-0 top-11 w-[380px] max-w-[calc(100vw-1.5rem)] glass border border-line/15 rounded-2xl shadow-2xl overflow-hidden z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-line/10">
        <div className="font-semibold">Notificações</div>
        <button className="text-[13px] text-primary font-semibold inline-flex items-center gap-1" onClick={() => void api.notifications.markRead().then(setNotifications)}>
          <CheckCheck size={15} /> Marcar todas como lidas
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 && <div className="px-4 py-10 text-center text-muted text-[14px]">Nenhuma notificação por enquanto.</div>}
        {notifications.slice(0, 8).map((n) => (
          <button key={n.id} onClick={() => open(n)} className="w-full text-left flex gap-3 px-4 py-3 hover:bg-line/[0.05] border-b border-line/[0.06] last:border-0">
            <NotificationIcon n={n} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className={clsx("text-[13.5px] truncate", n.read ? "font-medium" : "font-semibold")}>{n.title}</div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
              </div>
              <div className="text-[12.5px] text-muted line-clamp-2 mt-0.5">{n.type === "carteira" || n.type === "sistema" ? <PrivateAmounts text={n.message} /> : n.message}</div>
              <div className="text-[11.5px] text-muted/70 mt-1">{relativeTime(n.createdAt)}</div>
            </div>
          </button>
        ))}
      </div>
      <Link to="/alertas" onClick={onClose} className="block text-center text-[13px] font-semibold text-primary py-2.5 border-t border-line/10 hover:bg-line/[0.04]">
        Ver todas
      </Link>
    </motion.div>
  );
}

function TitleBar({ onSearch }: { onSearch: () => void }) {
  const unread = useSession((s) => s.notifications.filter((n) => !n.read).length);
  const [open, setOpen] = useState(false);
  return (
    <header
      className={clsx(
        "drag h-[52px] shrink-0 flex items-center gap-2 relative z-30",
        // No Windows e no Linux os botões nativos da janela ficam à direita.
        platform === "win32" || platform === "linux" ? "pl-4 sm:pl-6 pr-[150px]" : "px-4 sm:px-6"
      )}
    >
      <div className="sm:hidden flex items-center gap-2">
        <LogoMark size={24} />
        <span className="font-bold tracking-tight">Investa</span>
      </div>
      <div className="flex-1" />
      <button
        onClick={onSearch}
        className="no-drag hidden md:flex shrink-0 whitespace-nowrap items-center gap-2 h-9 w-[270px] px-3 rounded-xl bg-line/[0.07] border border-line/10 text-muted text-[13.5px] hover:bg-line/[0.1] transition"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Buscar ativos, páginas…</span>
        <kbd className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-line/10">Ctrl K</kbd>
      </button>
      <PrivacyButton />
      <button onClick={onSearch} className="no-drag md:hidden h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-line/10" aria-label="Buscar">
        <Search size={18} />
      </button>
      <div className="relative no-drag">
        <button
          data-notifications-toggle
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:text-fg hover:bg-line/10 transition"
          aria-label="Notificações"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10.5px] font-bold flex items-center justify-center ring-2 ring-bg">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <AnimatePresence>{open && <NotificationsPopover onClose={() => setOpen(false)} />}</AnimatePresence>
      </div>
    </header>
  );
}

const PRIVACY_KEY = "investa-privacidade";

/** Modo privacidade: esconde os valores pessoais (útil em público). Fica salvo neste aparelho. */
export function applyPrivacy(on: boolean): void {
  document.documentElement.classList.toggle("privacy", on);
}

function PrivacyButton() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    applyPrivacy(on);
    try {
      localStorage.setItem(PRIVACY_KEY, on ? "1" : "0");
    } catch {
      // armazenamento indisponível
    }
  }, [on]);
  return (
    <button
      onClick={() => setOn((v) => !v)}
      className={clsx("no-drag h-9 w-9 rounded-xl flex items-center justify-center hover:bg-line/10 transition", on ? "text-primary" : "text-muted hover:text-fg")}
      aria-label={on ? "Mostrar valores" : "Esconder valores"}
      aria-pressed={on}
      title={on ? "Mostrar valores" : "Esconder valores (modo privacidade)"}
    >
      {on ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

function MobileNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const [more, setMore] = useState(false);
  const tabs = useTabs();
  const main = tabItems(tabs, user);
  const rest = navFor(user).filter((i) => !main.includes(i));
  return (
    <>
      <nav className="sm:hidden glass border-t border-line/10 grid h-[64px] shrink-0" style={{ gridTemplateColumns: `repeat(${main.length + 1}, minmax(0, 1fr))` }}>
        {main.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className={clsx("min-w-0 flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-primary" : "text-muted")}>
              <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
              <span className="max-w-full truncate px-0.5">{item.short ?? item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted">
          <Menu size={21} />
          Mais
        </button>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                onClick={() => {
                  setMore(false);
                  navigate(item.to);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-line/[0.06] py-4 text-[12.5px] font-medium"
              >
                <Icon size={22} className="text-primary" />
                {item.label}
              </button>
            );
          })}
          <button
            onClick={async () => {
              setMore(false);
              await signOut();
            }}
            className="flex flex-col items-center gap-2 rounded-2xl bg-danger/10 text-danger py-4 text-[12.5px] font-medium"
          >
            <LogOut size={22} />
            Sair
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function AppLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const [collapsedPref, setCollapsedPref] = useState(() => {
    try {
      return localStorage.getItem("investa-sidebar") === "1";
    } catch {
      return false;
    }
  });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1080);
  const [palette, setPalette] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const setNotifications = useSession((s) => s.setNotifications);
  const refreshNotifications = useSession((s) => s.refreshNotifications);
  const toast = useUi((s) => s.toast);

  useEffect(() => {
    void refreshNotifications();
    const t = setTimeout(() => void refreshNotifications(), 5_000);
    return () => clearTimeout(t);
  }, [refreshNotifications]);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1080);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const offNew = api.on<AppNotification>("notifications:new", (n) => {
      setNotifications([n, ...useSession.getState().notifications.filter((x) => x.id !== n.id)]);
      if (document.hasFocus()) toast({ title: n.title, message: n.message, tone: n.tone === "negative" ? "error" : n.tone === "positive" ? "success" : "info", action: n.link ? { label: "Ver", to: n.link } : undefined });
    });
    const offNav = api.on<string>("navigate", (path) => navigate(path));
    // Mudanças feitas em outro aparelho chegaram pela nuvem.
    const offData = api.on<PublicUser | null>("data:changed", (user) => {
      if (!user || !useSession.getState().user) return;
      void api.data.getAll().then((data) => applyRemoteData(user, data));
      void useSession.getState().refreshNotifications();
    });
    const offEnded = api.on<string>("session:ended", (message) => {
      void useSession.getState().signOut();
      toast({ title: "Sessão encerrada", message, tone: "error" });
    });
    return () => {
      offNew();
      offNav();
      offData();
      offEnded();
    };
  }, [navigate, setNotifications, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const collapsed = collapsedPref || narrow;

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => {
          const next = !collapsedPref;
          setCollapsedPref(next);
          try {
            localStorage.setItem("investa-sidebar", next ? "1" : "0");
          } catch {
            // armazenamento indisponível
          }
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col relative">
        <div className="pointer-events-none absolute -top-48 right-[-10%] h-[460px] w-[680px] rounded-full bg-primary/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute -top-40 left-[10%] h-[380px] w-[520px] rounded-full bg-secondary/[0.06] blur-3xl" />
        <TitleBar onSearch={() => setPalette(true)} />
        <main ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8 pt-1 pb-16"
          >
            {outlet}
          </motion.div>
        </main>
        <MobileNav />
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
  );
}
