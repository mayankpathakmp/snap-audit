import { Injectable } from '@angular/core';
import { RepoMeta, LanguageBreakdown, FileTreeNode } from '../models/audit.model';

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Java: '#b07219',
  Go: '#00add8',
  Rust: '#dea584',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Dart: '#00b4ab',
  Ruby: '#701516',
  PHP: '#4f5d95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  'Jupyter Notebook': '#da5b0b'
};

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly API = 'https://api.github.com';

  async fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
    const res = await fetch(`${this.API}/repos/${owner}/${repo}`);
    if (!res.ok) throw new Error(`Repository not found (${res.status})`);
    const data = await res.json();

    let hasReadme = false;
    try {
      const readmeRes = await fetch(`${this.API}/repos/${owner}/${repo}/readme`);
      hasReadme = readmeRes.ok;
    } catch { /* no readme */ }

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description || 'No description provided',
      language: data.language || 'Unknown',
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      size: data.size,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      defaultBranch: data.default_branch,
      license: data.license?.spdx_id || null,
      topics: data.topics || [],
      hasReadme,
      avatarUrl: data.owner?.avatar_url || ''
    };
  }

  async fetchLanguages(owner: string, repo: string): Promise<LanguageBreakdown[]> {
    const res = await fetch(`${this.API}/repos/${owner}/${repo}/languages`);
    if (!res.ok) return [];
    const data: Record<string, number> = await res.json();
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    return Object.entries(data).map(([language, bytes]) => ({
      language,
      bytes,
      percentage: Math.round((bytes / total) * 1000) / 10,
      color: LANG_COLORS[language] || '#6e7681'
    }));
  }

  async fetchFileTree(owner: string, repo: string, branch: string): Promise<FileTreeNode[]> {
    const res = await fetch(
      `${this.API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: { path: string; type: string; size?: number }[] = data.tree || [];

    const root: FileTreeNode[] = [];
    const map = new Map<string, FileTreeNode>();

    for (const item of items.slice(0, 200)) {
      const parts = item.path.split('/');
      const name = parts[parts.length - 1];
      const node: FileTreeNode = {
        name,
        path: item.path,
        type: item.type === 'tree' ? 'dir' : 'file',
        size: item.size
      };
      if (node.type === 'dir') node.children = [];
      map.set(item.path, node);

      if (parts.length === 1) {
        root.push(node);
      } else {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = map.get(parentPath);
        if (parent?.children) parent.children.push(node);
      }
    }
    return root;
  }
}
