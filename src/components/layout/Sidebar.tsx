import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import clsx from "clsx";
import { ROLE_LABEL } from "@shared/types";
import { platform } from "@/lib/api";
import { isManager, useSession } from "@/store/session";
import { Avatar } from "@/components/ui/primitives";
import { LogoMark } from "@/components/Logo";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { isActive, NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./nav";

function NavLink({ item, collapsed, badge }: { item: NavItem; collapsed: boolean; badge?: number }) {
  const { pathname } = useLocation();
  const active = isActive(pathname, item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={clsx(
        "no-drag pressable relative flex items-center gap-3 h-10 rounded-[var(--radius-md)] text-[14px] font-medium tracking-[-0.006em] transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "text-fg" : "text-muted hover:text-fg hover:bg-line/[0.06]"
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-[var(--radius-md)] bg-primary/[0.13] shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.18)]"
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        />
      )}
      <Icon size={19} strokeWidth={active ? 2.3 : 2} className={clsx("relative shrink-0", active && "text-primary")} />
      {!collapsed && <span className="relative truncate">{item.label}</span>}
      {!!badge && (
        <span
          className={clsx(
            "relative ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center",
            collapsed && "absolute -top-0.5 right-1.5 ml-0 min-w-[16px] h-4 text-[10px]"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const unread = useSession((s) => s.notifications.filter((n) => !n.read).length);
  const navigate = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);
  const manager = isManager(user);

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 252 }}
      transition={{ type: "spring", stiffness: 400, damping: 40 }}
      className="hidden sm:flex h-full shrink-0 flex-col material-thick border-r hairline relative z-20"
    >
      <div className={clsx("drag flex items-center h-[64px] shrink-0", collapsed ? "justify-center" : "px-5", platform === "darwin" && "pt-6")}>
        <Link to="/" className="no-drag flex items-center gap-2.5">
          <LogoMark size={30} />
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} className="leading-none">
                <div className="text-[19px] font-bold tracking-tight">Investa</div>
                <div className="text-[8px] tracking-[0.14em] text-muted mt-1 font-semibold whitespace-nowrap">APRENDA · INVISTA · EVOLUA</div>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      <nav className={clsx("flex-1 overflow-y-auto overflow-x-hidden pb-3", collapsed ? "px-3" : "px-3")}>
        {NAV_GROUPS.map((g, gi) => {
          const items = g.items.filter((i) => (!i.managerOnly || manager) && (!i.ownerOnly || user?.role === "dono"));
          if (!items.length) return null;
          return (
            <div key={gi} className={clsx(gi > 0 && "mt-5")}>
              {g.title && !collapsed && <div className="px-3 mb-1.5 t-caption text-muted/70">{g.title}</div>}
              {g.title && collapsed && <div className="mx-3 mb-2 h-px bg-line/10" />}
              <div className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <NavLink key={item.to} item={item} collapsed={collapsed} badge={item.to === "/alertas" ? unread : undefined} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-3 pt-2 border-t hairline flex flex-col gap-1">
        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} />
        {user && (
          <div className={clsx("flex items-center gap-2.5 rounded-xl mt-1", collapsed ? "flex-col py-2" : "px-2 py-2 hover:bg-line/[0.05]")}>
            <button className="no-drag" onClick={() => navigate("/configuracoes")} title={user.name}>
              <Avatar name={user.name} hue={user.avatarHue} size={34} />
            </button>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate">{user.name}</div>
                <div className="text-[12px] text-muted truncate">{ROLE_LABEL[user.role]}</div>
              </div>
            )}
            <button
              onClick={() => setConfirmOut(true)}
              className="no-drag h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut size={17} />
            </button>
          </div>
        )}
        <button
          onClick={onToggle}
          className="no-drag h-8 rounded-lg flex items-center justify-center gap-2 text-[12px] text-muted hover:text-fg hover:bg-line/[0.06] transition"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && "Recolher"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={async () => {
          setConfirmOut(false);
          await signOut();
          navigate("/");
        }}
        title="Sair da conta?"
        message="Você precisará entrar novamente com seu usuário e senha."
        confirmLabel="Sair"
        danger
      />
    </motion.aside>
  );
}

