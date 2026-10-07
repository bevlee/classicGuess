export interface DailyPiece { id: string; audioUrl: string; excerptDuration: number; }
export interface DailyChallenge {
  id: string;
  date: string;
  resetAt: string;
  scoringVersion: number;
  token: string;
  pieces: DailyPiece[];
}
export interface DailyRound { trackId: string; guesses: string[]; }
export interface DailyResult { id: string; name: string; score: number; rank: number; }
export interface Leaderboard {
  date: string;
  entries: DailyResult[];
  totalEntries: number;
}
