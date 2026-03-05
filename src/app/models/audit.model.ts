export interface RepoInput {
  owner: string;
  repo: string;
}

export interface RepoMeta {
  name: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  size: number;
  createdAt: string;
  updatedAt: string;
  defaultBranch: string;
  license: string | null;
  topics: string[];
  hasReadme: boolean;
  avatarUrl: string;
}

export interface LanguageBreakdown {
  language: string;
  bytes: number;
  percentage: number;
  color: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children?: FileTreeNode[];
}

export interface AuditScore {
  category: string;
  score: number;
  icon: string;
  detail: string;
  suggestions: string[];
}

export interface AuditReport {
  repo: RepoMeta;
  languages: LanguageBreakdown[];
  fileTree: FileTreeNode[];
  scores: AuditScore[];
  overallScore: number;
  summary: string;
  generatedAt: string;
}

export type AuditStatus = 'idle' | 'fetching' | 'analyzing' | 'complete' | 'error';
