import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Check, Flame, Lock, Medal, Play, Search, Star, Trophy, Zap } from "lucide-react";
import clsx from "clsx";
import { COURSES } from "@shared/courses";
import { GLOSSARY } from "@shared/glossary";
import { BADGES, isApproved, isUnlocked, levelFor, LEVELS, moduleProgress, nextLesson, TOTAL_LESSONS } from "@shared/learning";
import { num } from "@/lib/format";
import { iconFor } from "@/lib/icons";
import { useUserData } from "@/store/session";
import { Badge, Card, IconTile, PageHeader, ProgressBar, ProgressRing } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/form";

type Tab = "trilha" | "conquistas" | "glossario";

const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];

function Trail() {
  const learning = useUserData("learning");
  const navigate = useNavigate();
  const next = nextLesson(learning);
  let globalIndex = 0;
  return (
    <div className="space-y-6">
      {COURSES.map((m) => {
        const Icon = iconFor(m.icon);
        const progress = moduleProgress(learning, m.id);
        const unlocked = isUnlocked(learning, m.lessons[0].id);
        return (
          <Card key={m.id} padded={false} className={clsx("overflow-hidden", !unlocked && "opacity-70")}>
            <div className="flex items-center gap-4 p-5" style={{ background: `linear-gradient(135deg, ${m.color}26, transparent 70%)` }}>
              <div className="h-12 w-12 rounded-control flex items-center justify-center shrink-0" style={{ background: m.color, boxShadow: `0 10px 24px -10px ${m.color}` }}>
                <Icon size={24} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-headline">{m.title}</h3>
                  <Badge tone={m.level === "Iniciante" ? "success" : m.level === "Intermediário" ? "primary" : "secondary"}>{m.level}</Badge>
                  {progress === 1 && <Badge tone="success" icon={Check}>Concluído</Badge>}
                </div>
                <p className="text-footnote text-muted mt-0.5">{m.description}</p>
              </div>
              <ProgressRing value={progress} size={52} stroke={5} color={m.color}>
                <span className="text-caption tabular">{Math.round(progress * 100)}%</span>
              </ProgressRing>
            </div>
            <div className="flex flex-col items-center py-6 gap-5 [--zig:0.35] sm:[--zig:1]">
              {m.lessons.map((l) => {
                const offset = OFFSETS[globalIndex++ % OFFSETS.length];
                const done = isApproved(learning, l.id);
                const open = isUnlocked(learning, l.id);
                const current = next?.lesson.id === l.id;
                const rec = learning.completed[l.id];
                return (
                  <div key={l.id} className="flex flex-col items-center" style={{ transform: `translateX(calc(var(--zig) * ${offset}px))` }}>
                    <motion.button
                      whileHover={open ? { scale: 1.06 } : undefined}
                      whileTap={open ? { scale: 0.94 } : undefined}
                      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                      disabled={!open}
                      onClick={() => navigate(`/aula/${l.id}`)}
                      className={clsx("relative h-[68px] w-[68px] rounded-full flex items-center justify-center", !open && "cursor-not-allowed")}
                      style={{
                        background: done ? `linear-gradient(135deg, ${m.color}, rgb(var(--secondary)))` : open ? m.color : "rgb(var(--separator) / 0.14)",
                        boxShadow: open ? `0 6px 0 0 ${done ? "rgb(var(--secondary) / 0.7)" : `${m.color}99`}, 0 16px 30px -12px ${m.color}` : "0 6px 0 0 rgb(var(--separator) / 0.12)",
                      }}
                      aria-label={l.title}
                    >
                      {current && <span className="absolute inset-[-8px] rounded-full border-[3px] animate-pulse" style={{ borderColor: `${m.color}88` }} />}
                      {done ? <Check size={30} strokeWidth={3} className="text-white" /> : open ? <Play size={26} fill="white" className="text-white ml-1" /> : <Lock size={24} className="text-muted" />}
                      {done && rec && rec.score === rec.total && (
                        <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-warning flex items-center justify-center ring-4 ring-surface">
                          <Star size={12} fill="white" className="text-white" />
                        </span>
                      )}
                    </motion.button>
                    <div className="mt-3 text-center max-w-[200px]">
                      <div className={clsx("text-footnote font-semibold", !open && "text-muted")}>{l.title}</div>
                      <div className="text-footnote text-muted tabular">
                        {l.minutes} min · {l.quiz.length} questões{rec ? ` · ${rec.score}/${rec.total}` : ""}
                      </div>
                      {current && (
                        <Button size="sm" className="mt-2" onClick={() => navigate(`/aula/${l.id}`)}>
                          {rec ? "Tentar de novo" : "Começar"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Achievements() {
  const learning = useUserData("learning");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {BADGES.map((b) => {
        const earned = learning.badges.includes(b.id);
        const Icon = iconFor(b.icon);
        return (
          <Card key={b.id} className={clsx(!earned && "opacity-60")}>
            <div className="flex items-center gap-4">
              <div
                className="h-14 w-14 rounded-control flex items-center justify-center shrink-0"
                style={earned ? { background: "linear-gradient(135deg, rgb(var(--warning)), rgb(var(--chart-8)))", boxShadow: "0 10px 24px -10px rgb(var(--chart-8))" } : { background: "rgb(var(--separator) / 0.12)" }}
              >
                {earned ? <Icon size={26} className="text-white" /> : <Lock size={22} className="text-muted" />}
              </div>
              <div>
                <div className="text-headline">{b.name}</div>
                <div className="text-footnote text-muted">{b.description}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Glossary() {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return GLOSSARY.filter((g) => !t || g.term.toLowerCase().includes(t) || g.definition.toLowerCase().includes(t));
  }, [q]);
  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-10" placeholder="Buscar termo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((g) => (
          <Card key={g.term}>
            <div className="text-headline text-primary">{g.term}</div>
            <p className="text-callout mt-1">{g.definition}</p>
            {g.example && <p className="text-footnote text-muted mt-2">Exemplo: {g.example}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Aulas() {
  const learning = useUserData("learning");
  const [tab, setTab] = useState<Tab>("trilha");
  const navigate = useNavigate();
  const lvl = levelFor(learning.xp);
  const done = Object.values(learning.completed).filter((c) => c.approved).length;
  const next = nextLesson(learning);

  return (
    <div>
      <PageHeader
        title="Aulas"
        subtitle="Uma trilha do zero ao avançado. Passe nas aulas, ganhe XP, suba de nível e desbloqueie conquistas."
        actions={
          next && (
            <Button icon={Play} onClick={() => navigate(`/aula/${next.lesson.id}`)}>
              {done ? "Continuar trilha" : "Começar agora"}
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Card className="sm:col-span-2">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-control bg-ink text-ink-contrast flex items-center justify-center">
              <Trophy size={26} className="text-ink-contrast" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-footnote text-muted">Nível {lvl.index + 1} de {LEVELS.length}</div>
              <div className="text-title">{lvl.current.name}</div>
              <ProgressBar value={lvl.progress} className="mt-2" />
              <div className="text-footnote text-muted mt-1 tabular">{lvl.next ? `${num(learning.xp, 0)} / ${num(lvl.next.xp, 0)} XP para ${lvl.next.name}` : "Nível máximo alcançado!"}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <IconTile icon={Flame} color="warning" size={44} className="rounded-control" />
            <div>
              <div className="text-[22px] font-bold tabular tracking-[-0.02em]">{learning.streak.count}</div>
              <div className="text-footnote text-muted">dias seguidos</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <IconTile icon={BookOpen} color="success" size={44} className="rounded-control" />
            <div>
              <div className="text-[22px] font-bold tabular tracking-[-0.02em]">
                {done}/{TOTAL_LESSONS}
              </div>
              <div className="text-footnote text-muted">aulas aprovadas</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "trilha", label: "Trilha", icon: Zap },
            { value: "conquistas", label: "Conquistas", icon: Medal },
            { value: "glossario", label: "Glossário", icon: BookOpen },
          ]}
        />
        <div className="text-footnote text-muted tabular">
          {learning.badges.length}/{BADGES.length} conquistas
        </div>
      </div>

      {tab === "trilha" && <Trail />}
      {tab === "conquistas" && <Achievements />}
      {tab === "glossario" && <Glossary />}
    </div>
  );
}
