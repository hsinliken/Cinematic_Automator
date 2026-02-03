
export enum WorkflowStatus {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  REVIEW = 'REVIEW',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface Scene {
  id: string;
  imagePrompt: string;
  dialogue: string;
  imageUrl?: string;
  videoUrl?: string;
  audioBuffer?: AudioBuffer;
  status: 'pending' | 'processing' | 'completed' | 'error';
}
