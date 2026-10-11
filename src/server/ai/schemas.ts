import { z } from 'zod';

const difficulty = z.enum(['easy', 'medium', 'hard']);
const chunkRef = z.string().describe('The id of the source passage this item is based on, exactly as given, e.g. "c3".');
const evidence = z.string().describe('A short passage (under 200 characters) copied VERBATIM from the cited source passage that supports the answer.');

export const flashcardOut = z.object({
  concept: z.string().describe('The concept or subtopic this card belongs to (1–4 words).'),
  question: z.string().describe('A question that requires recalling something, not recognising it.'),
  answer: z.string().describe('The reference answer, concise and grounded in the source.'),
  explanation: z.string().describe('One or two sentences of context from the source.'),
  hint: z.string().optional().describe('An optional nudge that does not give the answer away.'),
  difficulty,
  source: chunkRef,
  evidence,
});

export const questionOut = z.object({
  concept: z.string(),
  type: z.enum(['multiple_choice', 'true_false']),
  prompt: z.string(),
  options: z.array(z.string()).optional().describe('For multiple_choice only: 3–5 distinct options.'),
  correctIndex: z.number().int().optional().describe('For multiple_choice only: zero-based index of the single correct option.'),
  answer: z.boolean().optional().describe('For true_false only: whether the statement is true.'),
  explanation: z.string().describe('Why the answer is correct, drawing on the source.'),
  difficulty,
  source: chunkRef,
  evidence,
});

export const conceptOut = z.object({
  name: z.string(),
  description: z.string().describe('One sentence defining the concept.'),
  related: z.array(z.string()).optional().describe('Names of other concepts in this list that this one connects to.'),
});

export const studyKitOut = z.object({
  concepts: z.array(conceptOut).max(24),
  flashcards: z.array(flashcardOut).max(40),
  questions: z.array(questionOut).max(30),
});
export type StudyKitOut = z.infer<typeof studyKitOut>;

export const kitConfig = z.object({
  cards: z.number().int().min(0).max(30).default(12),
  questions: z.number().int().min(0).max(20).default(8),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
});
export type KitConfig = z.infer<typeof kitConfig>;

export const feedbackOut = z.object({
  similarity: z.enum(['close', 'partial', 'miss']),
  feedback: z.string().describe('One or two encouraging sentences comparing the learner’s answer with the reference answer.'),
  suggestedRating: z.enum(['again', 'hard', 'good', 'easy']),
});
export type FeedbackOut = z.infer<typeof feedbackOut>;
