import { getProvider, type Usage } from './provider';
import { KIT_SYSTEM, PROMPT_VERSION, kitUser } from './prompts';
import { studyKitOut, type KitConfig, type StudyKitOut } from './schemas';
import { verifyKit, type VerifyReport } from './verify';

export interface SourceChunk { id: string; resourceId: string; page: number | null; text: string }
export interface Passage { id: string; chunkId?: string; resourceId: string; page: number | null; text: string }

/** Keep the prompt inside a budget while covering the whole document: take evenly spaced chunks. */
export function selectPassages(chunks: SourceChunk[], budgetChars = 48_000): Passage[] {
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  let picked = chunks;
  if (total > budgetChars) {
    const avg = total / chunks.length;
    const want = Math.max(1, Math.floor(budgetChars / avg));
    const step = chunks.length / want;
    picked = Array.from({ length: want }, (_, i) => chunks[Math.min(chunks.length - 1, Math.floor(i * step))]);
  }
  return picked.map((c, i) => ({ id: `c${i + 1}`, chunkId: c.id, resourceId: c.resourceId, page: c.page, text: c.text }));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9À-￿]+/g, ' ').trim();

/** Is `quote` really in `text`? Exact after normalising, or ≥85% of its words appear in order-insensitive form. */
export function quoteSupported(quote: string, text: string): boolean {
  const q = squash(quote);
  if (q.length < 8) return false;
  const t = squash(text);
  if (t.includes(q)) return true;
  const words = q.split(' ');
  const hay = new Set(t.split(' '));
  return words.filter((w) => hay.has(w)).length / words.length >= 0.85;
}

export interface ValidCard {
  concept: string; question: string; answer: string; explanation: string; hint?: string; difficulty: 'easy' | 'medium' | 'hard';
  passage: Passage;
}
export interface ValidQuestion {
  concept: string; type: 'multiple_choice' | 'true_false'; prompt: string; options: string[]; correctIndex?: number; answer?: boolean;
  explanation: string; difficulty: 'easy' | 'medium' | 'hard'; passage: Passage;
}
export interface ValidKit {
  concepts: { name: string; description: string; related: string[] }[];
  cards: ValidCard[];
  questions: ValidQuestion[];
  dropped: { cards: number; questions: number };
}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Server-side validation of model output. Anything malformed, uncited, or whose evidence quote isn't
 * actually in the cited passage is dropped rather than saved.
 */
export function validateKit(out: StudyKitOut, passages: Passage[], config: KitConfig): ValidKit {
  const byId = new Map(passages.map((p) => [p.id, p]));
  const seenQ = new Set<string>();
  let droppedCards = 0, droppedQs = 0;

  const cards: ValidCard[] = [];
  for (const c of out.flashcards) {
    const p = byId.get(c.source);
    const question = clean(c.question, 1000), answer = clean(c.answer, 4000);
    if (!p || !question || !answer || !quoteSupported(c.evidence, p.text) || seenQ.has(squash(question))) { droppedCards++; continue; }
    seenQ.add(squash(question));
    cards.push({ concept: clean(c.concept, 80) || 'General', question, answer, explanation: clean(c.explanation, 4000), hint: c.hint ? clean(c.hint, 500) : undefined, difficulty: c.difficulty, passage: p });
  }

  const questions: ValidQuestion[] = [];
  for (const q of out.questions) {
    const p = byId.get(q.source);
    const prompt = clean(q.prompt, 1000);
    if (!p || !prompt || !quoteSupported(q.evidence, p.text)) { droppedQs++; continue; }
    const base = { concept: clean(q.concept, 80) || 'General', prompt, explanation: clean(q.explanation, 4000), difficulty: q.difficulty, passage: p };
    if (q.type === 'multiple_choice') {
      const options = (q.options ?? []).map((o) => clean(o, 500)).filter(Boolean);
      const distinct = new Set(options.map(squash)).size === options.length;
      if (options.length < 3 || options.length > 5 || !distinct || q.correctIndex === undefined || q.correctIndex < 0 || q.correctIndex >= options.length) { droppedQs++; continue; }
      questions.push({ ...base, type: 'multiple_choice', options, correctIndex: q.correctIndex });
    } else {
      if (typeof q.answer !== 'boolean') { droppedQs++; continue; }
      questions.push({ ...base, type: 'true_false', options: ['True', 'False'], answer: q.answer });
    }
  }

  const names = new Set<string>();
  const concepts = out.concepts.map((c) => ({ name: clean(c.name, 80), description: clean(c.description, 300), related: (c.related ?? []).map((r) => clean(r, 80)) }))
    .filter((c) => c.name && !names.has(c.name.toLowerCase()) && names.add(c.name.toLowerCase()));

  return {
    concepts,
    cards: cards.slice(0, config.cards),
    questions: questions.slice(0, config.questions),
    dropped: { cards: droppedCards, questions: droppedQs },
  };
}

export interface GenerationResult { kit: ValidKit; usage: Usage; provider: string; model: string; promptVersion: string; passages: Passage[]; verify: VerifyReport; structuralDrops: { cards: number; questions: number } }

export async function generateStudyContent(input: { topic: string; goal?: string | null; config: KitConfig; chunks: SourceChunk[] }): Promise<GenerationResult> {
  const provider = getProvider();
  const passages = selectPassages(input.chunks);
  const { data, usage } = await provider.generateJson({
    system: KIT_SYSTEM,
    user: kitUser({ topic: input.topic, goal: input.goal, config: input.config, passages }),
    schema: studyKitOut,
    schemaName: 'study_kit',
    schemaDescription: 'Flashcards, quiz questions and concepts grounded in the supplied passages.',
    maxTokens: 12_000,
  });
  const checked = validateKit(data, passages, input.config);
  // Accuracy gate: an independent pass re-solves every question from the cited passage; disagreements are dropped.
  const v = await verifyKit(checked, passages);
  return { kit: v.kit, usage, provider: provider.name, model: provider.model, promptVersion: PROMPT_VERSION, passages, verify: v.report, structuralDrops: checked.dropped };
}
