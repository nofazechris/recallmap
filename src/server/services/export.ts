import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import {
  achievements, credentials, flashcardResponses, flashcards, notifications, profiles, quizAnswers, quizAttempts, quizQuestions, quizzes, resources,
  reviewSchedules, studySessions, topics, userAchievements, users, xpLedger,
} from '../db/schema';

/** Everything an account owns, as plain JSON. Password hashes and storage keys are never included. */
export async function exportAccount(db: Db, userId: string) {
  const [u] = await db.select({ id: users.id, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const ts = await db.select().from(topics).where(eq(topics.ownerId, userId));
  const topicIds = ts.map((t) => t.id);
  const some = <T,>(rows: Promise<T[]> | T[]) => Promise.resolve(rows);

  const [res, cards, qz, schedules, sessions, responses, attempts, ledger, badges, creds, notifs] = await Promise.all([
    topicIds.length ? db.select({ id: resources.id, topicId: resources.topicId, filename: resources.originalFilename, mimeType: resources.mimeType, size: resources.fileSize, status: resources.processingStatus, createdAt: resources.createdAt }).from(resources).where(inArray(resources.topicId, topicIds)) : some([]),
    topicIds.length ? db.select().from(flashcards).where(inArray(flashcards.topicId, topicIds)) : some([]),
    topicIds.length ? db.select().from(quizzes).where(inArray(quizzes.topicId, topicIds)) : some([]),
    db.select().from(reviewSchedules).where(eq(reviewSchedules.userId, userId)),
    db.select().from(studySessions).where(eq(studySessions.userId, userId)),
    db.select().from(flashcardResponses).where(eq(flashcardResponses.userId, userId)),
    db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId)),
    db.select().from(xpLedger).where(eq(xpLedger.userId, userId)),
    db.select({ code: achievements.code, name: achievements.name, unlockedAt: userAchievements.unlockedAt }).from(userAchievements).innerJoin(achievements, eq(achievements.id, userAchievements.achievementId)).where(eq(userAchievements.userId, userId)),
    db.select().from(credentials).where(eq(credentials.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
  ]);
  const quizIds = qz.map((q) => q.id);
  const questions = quizIds.length ? await db.select().from(quizQuestions).where(inArray(quizQuestions.quizId, quizIds)) : [];
  const attemptIds = attempts.map((a) => a.id);
  const answers = attemptIds.length ? await db.select().from(quizAnswers).where(inArray(quizAnswers.attemptId, attemptIds)) : [];

  return {
    exportedAt: new Date().toISOString(), account: u, profile, topics: ts, resources: res, flashcards: cards, quizzes: qz, quizQuestions: questions,
    reviewSchedules: schedules, studySessions: sessions, flashcardResponses: responses, quizAttempts: attempts, quizAnswers: answers,
    xpLedger: ledger, achievements: badges, credentials: creds, notifications: notifs,
  };
}
