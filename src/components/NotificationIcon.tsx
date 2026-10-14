import { Bell, Info, Landmark, Lightbulb, Newspaper, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { AppNotification } from "@shared/types";
import { IconTile } from "@/components/ui/primitives";

export function NotificationIcon({ n, size = 36 }: { n: AppNotification; size?: number }) {
  if (n.type === "dica") return <IconTile icon={Lightbulb} color="warning" size={size} />;
  if (n.type === "noticia") return <IconTile icon={Newspaper} color="chart-6" size={size} />;
  if (n.type === "sistema") return <IconTile icon={Info} color="secondary" size={size} />;
  if (n.type === "mercado") return <IconTile icon={Landmark} color="primary" size={size} />;
  if (n.tone === "positive") return <IconTile icon={TrendingUp} color="success" size={size} />;
  if (n.tone === "negative") return <IconTile icon={TrendingDown} color="danger" size={size} />;
  if (n.type === "carteira") return <IconTile icon={Wallet} color="primary" size={size} />;
  return <IconTile icon={Bell} color="primary" size={size} />;
}
