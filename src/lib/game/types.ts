export type GameState = 'loading' | 'guessing' | 'revealed' | 'complete';
export interface RoundState {
  trackId: string;
  status: GameState;
  stageIndex: number;
  score: number;
  guesses: string[];
  solved: boolean;
}
export interface SessionState { totalScore: number; played: number; }
