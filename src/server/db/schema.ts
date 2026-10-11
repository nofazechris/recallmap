import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────── identity ───────────── */

export const users = pgTable('users', {
  id: id(),
  authProviderId: text('auth_provider_id'),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  emailVerifiedAt: ts('email_verified_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)]);

export interface Prefs {
  publicProfile: boolean;
  showTopics: boolean;
  shareFeed: boolean;
  reduceMotion: boolean;
  remindDaily: boolean;
  notifyBadges: boolean;
  notifyCommunity: boolean;
  typeAnswers: boolean;
}

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url'),
  avatarTone: integer('avatar_tone').notNull().default(0),
  isPublic: boolean('is_public').notNull().default(false),
  timezone: text('timezone').notNull().default('UTC'),
  dailyGoal: integer('daily_goal').notNull().default(20),
  onboarded: boolean('onboarded').notNull().default(false),
  showcase: jsonb('showcase').$type<string[]>().notNull().default([]),
  prefs: jsonb('prefs').$type<Prefs>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('profiles_username_lower_uq').on(sql`lower(${t.username})`)]);

export const passwordResets = pgTable('password_resets', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash)]);

export const emailVerifications = pgTable('email_verifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('email_verifications_token_uq').on(t.tokenHash)]);

/* ───────────── topics & resources ───────────── */

export const topics = pgTable('topics', {
  id: id(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('General'),
  goal: text('goal'),
  targetDate: text('target_date'),
  visibility: text('visibility', { enum: ['private', 'public'] }).notNull().default('private'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: ts('archived_at'),
}, (t) => [index('topics_owner_idx').on(t.ownerId)]);

export const concepts = pgTable('concepts', {
  id: id(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('concepts_topic_name_uq').on(t.topicId, sql`lower(${t.name})`)]);

/** Relationships between concepts — the edges of the learning map. */
export const conceptEdges = pgTable('concept_edges', {
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  fromConceptId: uuid('from_concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  toConceptId: uuid('to_concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('related'),
}, (t) => [primaryKey({ columns: [t.fromConceptId, t.toConceptId] }), check('concept_edges_no_self', sql`${t.fromConceptId} <> ${t.toConceptId}`)]);

export const resources = pgTable('resources', {
  id: id(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storageKey: text('storage_key').notNull(),
  processingStatus: text('processing_status', { enum: ['uploaded', 'processing', 'ready', 'failed'] }).notNull().default('uploaded'),
  processingError: text('processing_error'),
  pageCount: integer('page_count'),
  charCount: integer('char_count'),
  createdAt: createdAt(),
  processedAt: ts('processed_at'),
}, (t) => [index('resources_topic_idx').on(t.topicId), index('resources_owner_idx').on(t.ownerId)]);

export const resourceChunks = pgTable('resource_chunks', {
  id: id(),
  resourceId: uuid('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  pageNumber: integer('page_number'),
  contentHash: text('content_hash').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('chunks_resource_idx_uq').on(t.resourceId, t.chunkIndex)]);

/* ───────────── study content ───────────── */

export const studyKits = pgTable('study_kits', {
  id: id(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceIds: jsonb('resource_ids').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<{ cards: number; questions: number; difficulty: string; report?: { generated: { cards: number; questions: number }; removedUnsupported: number; removedUnverified: number } }>().notNull(),
  status: text('status', { enum: ['queued', 'generating', 'ready', 'approved', 'failed'] }).notNull().default('queued'),
  error: text('error'),
  provider: text('provider'),
  model: text('model'),
  promptVersion: text('prompt_version'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: createdAt(),
  completedAt: ts('completed_at'),
}, (t) => [index('study_kits_topic_idx').on(t.topicId)]);

export const flashcards = pgTable('flashcards', {
  id: id(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  studyKitId: uuid('study_kit_id').references(() => studyKits.id, { onDelete: 'set null' }),
  sourceResourceId: uuid('source_resource_id').references(() => resources.id, { onDelete: 'set null' }),
  conceptId: uuid('concept_id').references(() => concepts.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  referenceAnswer: text('reference_answer').notNull(),
  explanation: text('explanation').notNull().default(''),
  hint: text('hint'),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull().default('medium'),
  sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().notNull().default({}),
  generationVersion: text('generation_version'),
  createdBy: text('created_by', { enum: ['ai', 'user'] }).notNull(),
  status: text('status', { enum: ['draft', 'approved'] }).notNull().default('draft'),
  userEdited: boolean('user_edited').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('flashcards_topic_idx').on(t.topicId, t.status)]);

export const quizzes = pgTable('quizzes', {
  id: id(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  studyKitId: uuid('study_kit_id').references(() => studyKits.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).notNull().default('medium'),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  generationVersion: text('generation_version'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('quizzes_topic_idx').on(t.topicId)]);

export type AnswerKey = { type: 'multiple_choice'; correctIndex: number } | { type: 'true_false'; value: boolean };

export const quizQuestions = pgTable('quiz_questions', {
  id: id(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  conceptId: uuid('concept_id').references(() => concepts.id, { onDelete: 'set null' }),
  questionText: text('question_text').notNull(),
  questionType: text('question_type', { enum: ['multiple_choice', 'true_false'] }).notNull(),
  options: jsonb('options').$type<string[]>().notNull().default([]),
  answerKey: jsonb('answer_key').$type<AnswerKey>().notNull(),
  explanation: text('explanation').notNull().default(''),
  sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().notNull().default({}),
  position: integer('position').notNull(),
  /** Bumped on edit so an attempt can say which version of the question it graded. */
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
}, (t) => [index('quiz_questions_quiz_idx').on(t.quizId, t.position)]);

/* ───────────── study sessions & reviews ───────────── */

export const studySessions = pgTable('study_sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  mode: text('mode', { enum: ['due', 'all', 'weak'] }).notNull().default('due'),
  /** The ordered deck for this session, fixed at start so a refresh resumes the same cards. */
  deck: jsonb('deck').$type<string[]>().notNull().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: ts('completed_at'),
  status: text('status', { enum: ['active', 'completed', 'abandoned'] }).notNull().default('active'),
  cardsPresented: integer('cards_presented').notNull().default(0),
  answersSubmitted: integer('answers_submitted').notNull().default(0),
  /** Set by the server on completion when enough real, rated answers happened for the session to count. */
  qualified: boolean('qualified').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('study_sessions_user_idx').on(t.userId, t.startedAt)]);

export const flashcardResponses = pgTable('flashcard_responses', {
  id: id(),
  sessionId: uuid('session_id').notNull().references(() => studySessions.id, { onDelete: 'cascade' }),
  flashcardId: uuid('flashcard_id').notNull().references(() => flashcards.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  submittedAnswer: text('submitted_answer').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  selfRating: text('self_rating', { enum: ['again', 'hard', 'good', 'easy'] }),
  ratedAt: ts('rated_at'),
  evaluationMetadata: jsonb('evaluation_metadata').$type<Record<string, unknown> | null>(),
}, (t) => [uniqueIndex('responses_session_card_uq').on(t.sessionId, t.flashcardId), index('responses_user_idx').on(t.userId, t.submittedAt)]);

export const reviewSchedules = pgTable('review_schedules', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flashcardId: uuid('flashcard_id').notNull().references(() => flashcards.id, { onDelete: 'cascade' }),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  intervalDays: real('interval_days').notNull().default(0),
  easeFactor: real('ease_factor').notNull().default(2.5),
  reviewCount: integer('review_count').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  /** 0–100: how firmly the card is remembered, derived from the rating history. */
  strength: integer('strength').notNull().default(0),
  lastReviewedAt: ts('last_reviewed_at'),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('review_schedules_user_card_uq').on(t.userId, t.flashcardId), index('review_schedules_due_idx').on(t.userId, t.dueAt)]);

/* ───────────── quiz attempts ───────────── */

export const quizAttempts = pgTable('quiz_attempts', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  /** Frozen question order + version used for this attempt. */
  questionSnapshot: jsonb('question_snapshot').$type<{ id: string; version: number }[]>().notNull().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  submittedAt: ts('submitted_at'),
  score: real('score'),
  totalQuestions: integer('total_questions').notNull().default(0),
  correctAnswers: integer('correct_answers').notNull().default(0),
  status: text('status', { enum: ['in_progress', 'submitted', 'abandoned'] }).notNull().default('in_progress'),
  gradingVersion: text('grading_version').notNull().default('v1'),
}, (t) => [index('quiz_attempts_user_idx').on(t.userId, t.quizId)]);

export const quizAnswers = pgTable('quiz_answers', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => quizAttempts.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => quizQuestions.id, { onDelete: 'cascade' }),
  submittedAnswer: jsonb('submitted_answer').$type<number | boolean | null>(),
  isCorrect: boolean('is_correct'),
  pointsAwarded: real('points_awarded').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('quiz_answers_attempt_question_uq').on(t.attemptId, t.questionId)]);

/* ───────────── XP, achievements, goals ───────────── */

export const xpLedger = pgTable('xp_ledger', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  amount: integer('amount').notNull(),
  relatedActivityId: text('related_activity_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  /** Local calendar day (user timezone) the award counts toward, for daily caps. */
  dayKey: text('day_key').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('xp_ledger_idem_uq').on(t.userId, t.idempotencyKey), index('xp_ledger_user_day_idx').on(t.userId, t.eventType, t.dayKey), check('xp_ledger_positive', sql`${t.amount} > 0`)]);

export const achievements = pgTable('achievements', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull(),
  category: text('category').notNull().default('learning'),
  qualificationRules: jsonb('qualification_rules').$type<Record<string, unknown>>().notNull().default({}),
  ruleVersion: integer('rule_version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [uniqueIndex('achievements_code_uq').on(t.code)]);

export const userAchievements = pgTable('user_achievements', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: uuid('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
  credentialId: uuid('credential_id'),
}, (t) => [uniqueIndex('user_achievements_uq').on(t.userId, t.achievementId)]);

export const learningGoals = pgTable('learning_goals', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
  goalType: text('goal_type', { enum: ['reviews', 'sessions', 'quizzes'] }).notNull(),
  targetValue: integer('target_value').notNull(),
  period: text('period', { enum: ['daily', 'weekly'] }).notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  status: text('status', { enum: ['active', 'completed', 'archived'] }).notNull().default('active'),
  createdAt: createdAt(),
}, (t) => [index('learning_goals_user_idx').on(t.userId, t.status)]);

/* ───────────── community ───────────── */

export const follows = pgTable('follows', {
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followedId: uuid('followed_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.followerId, t.followedId] }), check('follows_no_self', sql`${t.followerId} <> ${t.followedId}`)]);

export const studyCircles = pgTable('study_circles', {
  id: id(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  goal: text('goal').notNull().default(''),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('public'),
  /** Secret code that lets people join a private circle through an invite link. Rotating it revokes old links. */
  inviteCode: text('invite_code'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('study_circles_invite_uq').on(t.inviteCode)]);

export const studyCircleMembers = pgTable('study_circle_members', {
  circleId: uuid('circle_id').notNull().references(() => studyCircles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.circleId, t.userId] })]);

export const challenges = pgTable('challenges', {
  id: id(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  circleId: uuid('circle_id').references(() => studyCircles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  rules: jsonb('rules').$type<{ metric: 'study_days' | 'reviews'; target: number }>().notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  status: text('status', { enum: ['active', 'ended'] }).notNull().default('active'),
});

export const challengeParticipants = pgTable('challenge_participants', {
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  progress: integer('progress').notNull().default(0),
  status: text('status', { enum: ['joined', 'completed'] }).notNull().default('joined'),
  completedAt: ts('completed_at'),
}, (t) => [primaryKey({ columns: [t.challengeId, t.userId] })]);

export const activities = pgTable('activities', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  visibility: text('visibility', { enum: ['private', 'followers', 'public'] }).notNull().default('private'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index('activities_user_idx').on(t.userId, t.createdAt), index('activities_vis_idx').on(t.visibility, t.createdAt)]);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['badge', 'due', 'social', 'verified', 'xp'] }).notNull(),
  html: text('html').notNull(),
  href: text('href').notNull().default('/app'),
  unread: boolean('unread').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)]);

/* ───────────── credentials (Arc) ───────────── */

export const credentials = pgTable('credentials', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: uuid('achievement_id').notNull().references(() => achievements.id),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  credentialType: text('credential_type').notNull(),
  /** The exact canonical payload that was hashed — contains no private learning data. */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  credentialPayloadHash: text('credential_payload_hash').notNull(),
  issuerAddress: text('issuer_address'),
  chainId: integer('chain_id'),
  contractAddress: text('contract_address'),
  transactionHash: text('transaction_hash'),
  onchainCredentialId: text('onchain_credential_id'),
  status: text('status', { enum: ['pending', 'submitted', 'verified', 'failed'] }).notNull().default('pending'),
  error: text('error'),
  issuedAt: ts('issued_at'),
  verifiedAt: ts('verified_at'),
  createdAt: createdAt(),
}, (t) => [index('credentials_user_idx').on(t.userId), uniqueIndex('credentials_hash_uq').on(t.credentialPayloadHash)]);

/* ───────────── infrastructure ───────────── */

export const jobs = pgTable('jobs', {
  id: id(),
  type: text('type', { enum: ['process_resource', 'generate_study_kit', 'issue_credential', 'confirm_credential'] }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  runAfter: timestamp('run_after', { withTimezone: true }).defaultNow().notNull(),
  lockedAt: ts('locked_at'),
  /** Uniqueness of in-flight work: one generation per topic, one process per resource. */
  dedupeKey: text('dedupe_key'),
  createdAt: createdAt(),
  finishedAt: ts('finished_at'),
}, (t) => [index('jobs_runnable_idx').on(t.status, t.runAfter), uniqueIndex('jobs_dedupe_live_uq').on(t.dedupeKey).where(sql`${t.status} in ('queued','running')`)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').notNull(),
  window: bigint('window', { mode: 'number' }).notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.window] })]);

/** Reward + mastery rules live in the database so they can change without a deploy. */
export const configRules = pgTable('config_rules', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable('audit_log', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  event: text('event').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index('audit_log_event_idx').on(t.event, t.createdAt)]);
