import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, CircleCheck, CircleX, Lightbulb, RotateCcw, Sparkles, Star, Trophy, X } from "lucide-react";
import clsx from "clsx";
import { ALL_LESSONS, applyLessonResult, BADGES, isUnlocked, PASS_RATIO, XP_PER_CORRECT, type LessonResult } from "@shared/learning";
import { platform } from "@/lib/api";
import { useSession } from "@/store/session";
import { iconFor } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { ProgressBar, ProgressRing } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/Toaster";

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.8 + Math.random() * 1.4,
        rot: Math.random() * 720 - 360,
        color: `rgb(var(--chart-${[1, 2, 3, 4, 7][i % 5]}))`,
        w: 6 + Math.random() * 6,
      })),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-[-20px] rounded-[2px]"
          style={{ left: `${p.x}%`, width: p.w, height: p.w * 0.45, background: p.color }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", rotate: p.rot, opacity: [1, 1, 0.8, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

export function Aula() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const learning = useSession((s) => s.data.learning);
  const update = useSession((s) => s.update);
  const entry = ALL_LESSONS.find((x) => x.lesson.id === lessonId);
  const [phase, setPhase] = useState<"cards" | "quiz" | "result">("cards");
  const [cardIndex, setCardIndex] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<LessonResult | null>(null);
  const [xpSession, setXpSession] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/aulas");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (!entry) return <Navigate to="/aulas" replace />;
  if (!isUnlocked(learning, entry.lesson.id)) return <Navigate to="/aulas" replace />;

  const { lesson, module } = entry;
  const total = lesson.cards.length + lesson.quiz.length;
  const step = phase === "cards" ? cardIndex : phase === "quiz" ? lesson.cards.length + qIndex + (checked ? 1 : 0) : total;
  const question = lesson.quiz[qIndex];
  const Icon = iconFor(module.icon);
  const idx = ALL_LESSONS.findIndex((x) => x.lesson.id === lesson.id);
  const nextEntry = ALL_LESSONS[idx + 1];

  const restart = () => {
    setPhase("cards");
    setCardIndex(0);
    setQIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrect(0);
    setResult(null);
    setXpSession(0);
  };

  const check = () => {
    if (selected === null) return;
    setChecked(true);
    if (selected === question.answer) {
      setCorrect((c) => c + 1);
      setXpSession((x) => x + XP_PER_CORRECT);
    }
  };

  const advance = () => {
    if (qIndex < lesson.quiz.length - 1) {
      setQIndex((i) => i + 1);
      setSelected(null);
      setChecked(false);
      return;
    }
    const r = applyLessonResult(learning, lesson.id, correct, lesson.quiz.length);
    update("learning", r.state);
    setResult(r);
    setPhase("result");
  };

  const isRight = checked && selected === question?.answer;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className={clsx("drag h-[52px] shrink-0 flex items-center gap-4 px-5", (platform === "win32" || platform === "linux") && "pr-[160px]")}>
        <button onClick={() => navigate("/aulas")} className="pressable no-drag h-9 w-9 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-separator/10" aria-label="Sair da aula">
          <X size={20} />
        </button>
        <div className="flex-1 max-w-2xl mx-auto">
          <ProgressBar value={step / total} height={10} />
        </div>
        <div className="no-drag flex items-center gap-1.5 text-footnote font-semibold text-warning tabular">
          <Sparkles size={15} /> {xpSession} XP
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-6 py-6">
          <AnimatePresence mode="wait">
            {phase === "cards" && (
              <motion.div key={`c${cardIndex}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="h-9 w-9 rounded-chip flex items-center justify-center" style={{ background: module.color }}>
                    <Icon size={18} className="text-white" />
                  </div>
                  <div className="text-footnote text-muted">
                    {module.title} · <span className="text-fg font-medium">{lesson.title}</span>
                  </div>
                </div>
                <h1 className="text-large-title">{lesson.cards[cardIndex].title}</h1>
                <div className="prose-investa mt-5 text-[16.5px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.cards[cardIndex].body}</ReactMarkdown>
                </div>
                {lesson.cards[cardIndex].highlight && (
                  <div className="mt-6 flex gap-3 rounded-card px-4 py-3.5 border" style={{ background: `${module.color}14`, borderColor: `${module.color}40` }}>
                    <Lightbulb size={20} style={{ color: module.color }} className="shrink-0 mt-0.5" />
                    <div className="text-callout">{lesson.cards[cardIndex].highlight}</div>
                  </div>
                )}
              </motion.div>
            )}

            {phase === "quiz" && question && (
              <motion.div key={`q${qIndex}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}>
                <div className="text-caption uppercase text-primary mb-2 tabular">
                  Questão {qIndex + 1} de {lesson.quiz.length}
                </div>
                <h2 className="text-[24px] font-bold tracking-[-0.02em] leading-snug">{question.q}</h2>
                <div className="grid gap-2.5 mt-6">
                  {question.options.map((o, i) => {
                    const state = !checked ? (selected === i ? "selected" : "idle") : i === question.answer ? "right" : selected === i ? "wrong" : "idle";
                    return (
                      <motion.button
                        key={i}
                        whileTap={!checked ? { scale: 0.98 } : undefined}
                        disabled={checked}
                        onClick={() => setSelected(i)}
                        animate={state === "wrong" ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                        className={clsx(
                          "flex items-center gap-3 rounded-control border-2 px-4 py-3.5 text-left text-body font-medium transition-colors duration-150",
                          state === "idle" && "border-separator/15 hover:bg-separator/[0.05]",
                          state === "selected" && "border-primary bg-primary/10",
                          state === "right" && "border-success bg-success/10",
                          state === "wrong" && "border-danger bg-danger/10"
                        )}
                      >
                        <span
                          className={clsx(
                            "h-7 w-7 rounded-chip border-2 flex items-center justify-center text-caption shrink-0",
                            state === "selected" ? "border-primary text-primary" : state === "right" ? "border-success bg-success text-white" : state === "wrong" ? "border-danger bg-danger text-white" : "border-separator/25 text-muted"
                          )}
                        >
                          {state === "right" ? <Check size={15} strokeWidth={3} /> : state === "wrong" ? <X size={15} strokeWidth={3} /> : String.fromCharCode(65 + i)}
                        </span>
                        {o}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {phase === "result" && result && (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }} className="text-center pt-6">
                {result.approved && <Confetti />}
                <div className="flex justify-center">
                  <ProgressRing value={correct / lesson.quiz.length} size={140} stroke={12} color={result.approved ? undefined : "rgb(var(--warning))"}>
                    <div>
                      <div className="text-[34px] font-bold tabular tracking-[-0.02em]">
                        {correct}/{lesson.quiz.length}
                      </div>
                      <div className="text-caption uppercase text-muted">acertos</div>
                    </div>
                  </ProgressRing>
                </div>
                <h1 className="text-large-title mt-6">{result.approved ? (correct === lesson.quiz.length ? "Perfeito!" : "Aprovado!") : "Quase lá!"}</h1>
                <p className="text-body text-muted mt-2">
                  {result.approved
                    ? nextEntry
                      ? "Você desbloqueou a próxima aula."
                      : "Você concluiu toda a trilha do Investa!"
                    : `Você precisa acertar pelo menos ${Math.round(PASS_RATIO * 100)}% para avançar. Revise e tente de novo.`}
                </p>
                <div className="flex justify-center gap-3 mt-6 flex-wrap">
                  <div className="rounded-card bg-warning/10 text-warning px-5 py-3">
                    <div className="text-[22px] font-bold tabular tracking-[-0.02em]">+{result.gainedXp} XP</div>
                    <div className="text-footnote font-medium">{result.gainedXp === 0 ? "Você já tinha esse XP" : "ganhos nesta aula"}</div>
                  </div>
                  {result.leveledUp && (
                    <div className="rounded-card bg-primary/10 text-primary px-5 py-3">
                      <div className="text-[22px] font-bold tracking-[-0.02em] flex items-center gap-1.5">
                        <Trophy size={20} /> Subiu de nível!
                      </div>
                      <div className="text-footnote font-medium">continue assim</div>
                    </div>
                  )}
                </div>
                {result.newBadges.length > 0 && (
                  <div className="mt-6">
                    <div className="text-caption uppercase text-muted mb-2">Novas conquistas</div>
                    <div className="flex justify-center gap-3 flex-wrap">
                      {result.newBadges.map((id) => {
                        const b = BADGES.find((x) => x.id === id)!;
                        const BIcon = iconFor(b.icon);
                        return (
                          <motion.div key={id} initial={{ scale: 0.6, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.3 }} className="flex items-center gap-2.5 rounded-card surface px-4 py-3">
                            <div className="h-10 w-10 rounded-chip flex items-center justify-center" style={{ background: "rgb(var(--warning))" }}>
                              <BIcon size={20} className="text-white" />
                            </div>
                            <div className="text-left">
                              <div className="text-callout font-semibold">{b.name}</div>
                              <div className="text-footnote text-muted">{b.description}</div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {phase === "quiz" && checked && question && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className={clsx("border-t px-6 py-4", isRight ? "bg-success/10 border-success/25" : "bg-danger/10 border-danger/25")}
          >
            <div className="max-w-[680px] mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex gap-3 flex-1">
                {isRight ? <CircleCheck size={26} className="text-success shrink-0" /> : <CircleX size={26} className="text-danger shrink-0" />}
                <div>
                  <div className={clsx("text-headline", isRight ? "text-success" : "text-danger")}>{isRight ? `Correto! +${XP_PER_CORRECT} XP` : `Resposta certa: ${question.options[question.answer]}`}</div>
                  <div className="text-callout mt-0.5">{question.explain}</div>
                </div>
              </div>
              <Button size="lg" variant={isRight ? "success" : "danger"} iconRight={ArrowRight} onClick={advance} className={isRight ? "" : "!bg-danger !text-white"}>
                Continuar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!(phase === "quiz" && checked) && (
        <div className="border-t border-separator/10 px-6 py-4">
          <div className="max-w-[680px] mx-auto flex items-center justify-between gap-3">
            {phase === "cards" && (
              <>
                <Button variant="ghost" disabled={cardIndex === 0} onClick={() => setCardIndex((i) => i - 1)}>
                  Voltar
                </Button>
                <Button
                  size="lg"
                  iconRight={ArrowRight}
                  onClick={() => {
                    if (cardIndex < lesson.cards.length - 1) setCardIndex((i) => i + 1);
                    else setPhase("quiz");
                  }}
                >
                  {cardIndex < lesson.cards.length - 1 ? "Continuar" : "Ir para o quiz"}
                </Button>
              </>
            )}
            {phase === "quiz" && (
              <>
                <span className="text-footnote text-muted">Escolha uma resposta</span>
                <Button size="lg" disabled={selected === null} onClick={check}>
                  Verificar
                </Button>
              </>
            )}
            {phase === "result" && result && (
              <>
                <Button variant="secondary" icon={RotateCcw} onClick={restart}>
                  Refazer
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => navigate("/aulas")}>
                    Voltar à trilha
                  </Button>
                  {result.approved && nextEntry && (
                    <Button
                      size="lg"
                      iconRight={ArrowRight}
                      onClick={() => {
                        restart();
                        navigate(`/aula/${nextEntry.lesson.id}`);
                      }}
                    >
                      Próxima aula
                    </Button>
                  )}
                  {result.approved && !nextEntry && (
                    <Button size="lg" icon={Star} onClick={() => navigate("/aulas")}>
                      Ver conquistas
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}
