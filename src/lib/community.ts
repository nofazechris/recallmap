/** Shapes returned by the community endpoints (shared by the dashboard and the community screen). */
export interface CircleLite { id: string; name: string; goal: string; members: number; joined: boolean; owner: boolean; progress: number; tones: number[]; challengeId: string | null }
export interface ChallengeLite { id: string; title: string; description: string; metric: string; target: number; endsAt: string; participants: number; joined: boolean; progress: number; completed: boolean; circleName: string | null }
export interface FeedLite { id: string; type: string; at: string; who: { username: string; name: string; tone: number }; text: string; mine: boolean }
export interface PersonLite { userId: string; username: string; name: string; tone: number; bio: string }
