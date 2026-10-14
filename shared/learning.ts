import type { LearningState } from "./types";
import { COURSES } from "./courses";

export interface LessonCard {
  title: string;
  body: string;
  highlight?: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  cards: LessonCard[];
  quiz: QuizQuestion[];
}

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  level: "Iniciante" | "Intermediário" | "Avançado";
  lessons: Lesson[];
}

export const XP_PER_CORRECT = 10;
export const XP_COMPLETION = 20;
export const XP_PERFECT = 15;
export const PASS_RATIO = 0.7;

export const LEVELS = [
  { xp: 0, name: "Iniciante" },
  { xp: 150, name: "Aprendiz" },
  { xp: 400, name: "Poupador" },
  { xp: 750, name: "Investidor" },
  { xp: 1150, name: "Analista" },
  { xp: 1550, name: "Estrategista" },
  { xp: 1850, name: "Mestre Investa" },
];

export const BADGES: { id: string; name: string; description: string; icon: string }[] = [
  { id: "primeiro-passo", name: "Primeiro passo", description: "Concluiu a primeira aula", icon: "footprints" },
  { id: "nota-maxima", name: "Nota máxima", description: "Acertou todas as questões de uma aula", icon: "star" },
  { id: "gabaritando", name: "Gabaritando", description: "5 aulas com nota máxima", icon: "medal" },
  { id: "modulo-completo", name: "Módulo concluído", description: "Concluiu um módulo inteiro", icon: "badge-check" },
  { id: "dedicado", name: "Estudante dedicado", description: "Concluiu 3 módulos", icon: "graduation" },
  { id: "em-chamas", name: "Em chamas", description: "Estudou 3 dias seguidos", icon: "flame" },
  { id: "imparavel", name: "Imparável", description: "Estudou 7 dias seguidos", icon: "zap" },
  { id: "meio-caminho", name: "Meio caminho", description: "Concluiu metade da trilha", icon: "milestone" },
  { id: "mestre", name: "Mestre Investa", description: "Zerou a trilha inteira", icon: "trophy" },
];

export const ALL_LESSONS = COURSES.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));
export const TOTAL_LESSONS = ALL_LESSONS.length;

export function levelFor(xp: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const progress = next ? (xp - current.xp) / (next.xp - current.xp) : 1;
  return { index: idx, current, next, progress };
}

export function isApproved(state: LearningState, lessonId: string): boolean {
  return !!state.completed[lessonId]?.approved;
}

/** A trilha é linear: cada aula libera a próxima quando aprovada. */
export function isUnlocked(state: LearningState, lessonId: string): boolean {
  const idx = ALL_LESSONS.findIndex((x) => x.lesson.id === lessonId);
  if (idx <= 0) return true;
  return isApproved(state, ALL_LESSONS[idx - 1].lesson.id);
}

export function nextLesson(state: LearningState) {
  return ALL_LESSONS.find((x) => !isApproved(state, x.lesson.id));
}

export function moduleProgress(state: LearningState, moduleId: string): number {
  const m = COURSES.find((c) => c.id === moduleId);
  if (!m) return 0;
  return m.lessons.filter((l) => isApproved(state, l.id)).length / m.lessons.length;
}

function dayString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface LessonResult {
  state: LearningState;
  gainedXp: number;
  approved: boolean;
  newBadges: string[];
  leveledUp: boolean;
}

export function applyLessonResult(prev: LearningState, lessonId: string, correct: number, total: number): LessonResult {
  const approved = total > 0 && correct / total >= PASS_RATIO;
  const perfect = correct === total;
  const lessonXp = correct * XP_PER_CORRECT + (approved ? XP_COMPLETION : 0) + (perfect ? XP_PERFECT : 0);
  const before = prev.completed[lessonId];
  const gainedXp = Math.max(0, lessonXp - (before?.xp ?? 0));
  const record = {
    score: Math.max(correct, before?.score ?? 0),
    total,
    xp: Math.max(lessonXp, before?.xp ?? 0),
    completedAt: new Date().toISOString(),
    approved: approved || !!before?.approved,
  };

  const today = dayString();
  const yesterday = dayString(new Date(Date.now() - 86_400_000));
  let streak = prev.streak;
  if (streak.lastDate !== today) {
    streak = { count: streak.lastDate === yesterday ? streak.count + 1 : 1, lastDate: today };
  }

  const state: LearningState = {
    xp: prev.xp + gainedXp,
    completed: { ...prev.completed, [lessonId]: record },
    streak,
    badges: [...prev.badges],
  };

  const approvedIds = Object.entries(state.completed).filter(([, r]) => r.approved).map(([id]) => id);
  const perfectCount = Object.values(state.completed).filter((r) => r.score === r.total && r.total > 0).length;
  const modulesDone = COURSES.filter((m) => m.lessons.every((l) => approvedIds.includes(l.id))).length;
  const earn = (id: string, cond: boolean) => {
    if (cond && !state.badges.includes(id)) state.badges.push(id);
  };
  earn("primeiro-passo", approvedIds.length >= 1);
  earn("nota-maxima", perfectCount >= 1);
  earn("gabaritando", perfectCount >= 5);
  earn("modulo-completo", modulesDone >= 1);
  earn("dedicado", modulesDone >= 3);
  earn("em-chamas", streak.count >= 3);
  earn("imparavel", streak.count >= 7);
  earn("meio-caminho", approvedIds.length >= Math.ceil(TOTAL_LESSONS / 2));
  earn("mestre", approvedIds.length >= TOTAL_LESSONS);

  const newBadges = state.badges.filter((b) => !prev.badges.includes(b));
  const leveledUp = levelFor(state.xp).index > levelFor(prev.xp).index;
  return { state, gainedXp, approved, newBadges, leveledUp };
}
