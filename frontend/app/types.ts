export interface FileItem {
  name: string;
  size: number;
  path: string;
}

export interface ModelItem {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export type StepType = 'Analyze' | 'Understand' | 'Code' | 'Execute' | 'Answer' | 'Files' | 'text';

export interface Step {
  id: string;
  type: StepType;
  content: string;
  status: 'pending' | 'executing' | 'done' | 'error';
  timestamp: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  steps?: Step[];
}
