import { Injectable } from '@angular/core';
import { RepoMeta, LanguageBreakdown, FileTreeNode, AuditScore } from '../models/audit.model';

@Injectable({ providedIn: 'root' })
export class AuditEngine {

  generateScores(
    meta: RepoMeta,
    languages: LanguageBreakdown[],
    tree: FileTreeNode[]
  ): AuditScore[] {
    return [
      this.scoreMaintainability(meta, tree),
      this.scoreDocumentation(meta, tree),
      this.scoreSecurity(meta, tree),
      this.scorePerformance(meta, languages, tree),
      this.scoreArchitecture(tree, languages)
    ];
  }

  generateSummary(meta: RepoMeta, scores: AuditScore[]): string {
    const avg = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
    const grade = avg >= 85 ? 'excellent' : avg >= 70 ? 'good' : avg >= 50 ? 'fair' : 'needs improvement';
    const top = scores.reduce((a, s) => (s.score > a.score ? s : a));
    const low = scores.reduce((a, s) => (s.score < a.score ? s : a));

    return `**${meta.fullName}** scores an overall **${avg}/100** (${grade}). ` +
      `Strongest area: **${top.category}** (${top.score}/100). ` +
      `Primary opportunity: **${low.category}** (${low.score}/100) — ${low.suggestions[0] || 'review recommended'}. ` +
      `The repository uses ${meta.language} as its primary language with ${meta.size} KB of source code.`;
  }

  private scoreMaintainability(meta: RepoMeta, tree: FileTreeNode[]): AuditScore {
    let score = 50;
    const suggestions: string[] = [];

    // Check for recent activity
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(meta.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 30) score += 15;
    else if (daysSinceUpdate < 90) score += 8;
    else suggestions.push('Repository hasn\'t been updated in over 90 days');

    // License
    if (meta.license) score += 10;
    else suggestions.push('Add an open-source license (MIT, Apache 2.0, etc.)');

    // Topics/tags
    if (meta.topics.length >= 3) score += 10;
    else suggestions.push('Add at least 3 repository topics for better discoverability');

    // Open issues ratio
    if (meta.openIssues === 0) score += 10;
    else if (meta.openIssues < 5) score += 5;
    else suggestions.push(`${meta.openIssues} open issues — consider triaging or closing stale ones`);

    // Config files
    const hasConfig = this.flatFiles(tree).some(f =>
      /\.(eslintrc|prettierrc|editorconfig|tsconfig)/i.test(f.name)
    );
    if (hasConfig) score += 5;
    else suggestions.push('Add linting/formatting configuration files');

    return { category: 'Maintainability', score: Math.min(100, score), icon: '🔧', detail: `Updated ${daysSinceUpdate} days ago`, suggestions };
  }

  private scoreDocumentation(meta: RepoMeta, tree: FileTreeNode[]): AuditScore {
    let score = 30;
    const suggestions: string[] = [];
    const files = this.flatFiles(tree);

    if (meta.hasReadme) score += 25;
    else suggestions.push('Add a README.md with project description, setup, and usage');

    if (meta.description) score += 10;
    else suggestions.push('Add a repository description');

    if (files.some(f => /changelog|history/i.test(f.name))) score += 10;
    else suggestions.push('Add a CHANGELOG.md to track release history');

    if (files.some(f => /contributing/i.test(f.name))) score += 10;
    else suggestions.push('Add CONTRIBUTING.md to guide contributors');

    if (files.some(f => /license/i.test(f.name))) score += 10;
    else suggestions.push('Add a LICENSE file');

    if (files.some(f => /docs\//i.test(f.path))) score += 5;
    else suggestions.push('Consider adding a docs/ folder for detailed documentation');

    return { category: 'Documentation', score: Math.min(100, score), icon: '📄', detail: meta.hasReadme ? 'README found' : 'No README detected', suggestions };
  }

  private scoreSecurity(meta: RepoMeta, tree: FileTreeNode[]): AuditScore {
    let score = 60;
    const suggestions: string[] = [];
    const files = this.flatFiles(tree);

    if (files.some(f => /\.env\.example/i.test(f.name))) score += 10;
    else suggestions.push('Add .env.example to document environment variables');

    const hasGitignore = files.some(f => f.name === '.gitignore');
    if (hasGitignore) score += 10;
    else suggestions.push('Add a .gitignore file to prevent accidental commits of secrets');

    const hasLockfile = files.some(f => /package-lock|yarn\.lock|pnpm-lock/i.test(f.name));
    if (hasLockfile) score += 10;
    else suggestions.push('Commit a lockfile for reproducible dependency resolution');

    if (files.some(f => /security\.md|\.github\/security/i.test(f.path))) score += 10;
    else suggestions.push('Add a SECURITY.md with vulnerability reporting instructions');

    const hasSensitive = files.some(f => /\.env$|\.pem$|credentials/i.test(f.name));
    if (hasSensitive) {
      score -= 20;
      suggestions.push('Potentially sensitive files detected — ensure secrets are not committed');
    }

    return { category: 'Security', score: Math.min(100, Math.max(0, score)), icon: '🛡️', detail: hasGitignore ? '.gitignore present' : 'No .gitignore found', suggestions };
  }

  private scorePerformance(meta: RepoMeta, languages: LanguageBreakdown[], tree: FileTreeNode[]): AuditScore {
    let score = 60;
    const suggestions: string[] = [];
    const files = this.flatFiles(tree);

    // Size check
    if (meta.size < 500) score += 15;
    else if (meta.size < 5000) score += 8;
    else suggestions.push('Repository is large — consider using .gitattributes or LFS for binary assets');

    // CI/CD
    const hasCI = files.some(f => /\.github\/workflows|\.gitlab-ci|Jenkinsfile|\.circleci/i.test(f.path));
    if (hasCI) score += 15;
    else suggestions.push('Set up CI/CD pipelines (GitHub Actions, GitLab CI, etc.)');

    // Docker
    const hasDocker = files.some(f => /dockerfile|docker-compose/i.test(f.name));
    if (hasDocker) score += 10;
    else suggestions.push('Consider adding Dockerfile for containerized deployments');

    return { category: 'Performance & CI', score: Math.min(100, score), icon: '⚡', detail: `Repo size: ${meta.size} KB`, suggestions };
  }

  private scoreArchitecture(tree: FileTreeNode[], languages: LanguageBreakdown[]): AuditScore {
    let score = 50;
    const suggestions: string[] = [];
    const files = this.flatFiles(tree);

    // Folder structure
    const hasSrcDir = tree.some(n => n.name === 'src' && n.type === 'dir');
    if (hasSrcDir) score += 15;
    else suggestions.push('Organize source code under a src/ directory');

    // Test presence
    const hasTests = files.some(f => /\.spec\.|\.test\.|__tests__|test\//i.test(f.path));
    if (hasTests) score += 15;
    else suggestions.push('Add unit tests — no test files detected');

    // Language diversity (moderate is good)
    if (languages.length >= 2 && languages.length <= 6) score += 10;
    else if (languages.length > 6) suggestions.push('Many languages detected — consider consolidating stack');

    // Config separation
    const hasConfigDir = files.some(f => /config\//i.test(f.path));
    if (hasConfigDir) score += 5;

    // Package manager
    const hasPkg = files.some(f => /package\.json|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml/i.test(f.name));
    if (hasPkg) score += 5;
    else suggestions.push('Add a package manifest (package.json, requirements.txt, etc.)');

    return { category: 'Architecture', score: Math.min(100, score), icon: '🏗️', detail: `${languages.length} language(s) detected`, suggestions };
  }

  private flatFiles(tree: FileTreeNode[]): FileTreeNode[] {
    const result: FileTreeNode[] = [];
    const walk = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    return result;
  }
}
