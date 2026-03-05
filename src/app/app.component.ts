import { Component, signal, computed, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass, NgFor, NgIf, DecimalPipe, DatePipe } from '@angular/common';
import { GitHubService } from './services/github.service';
import { AuditEngine } from './services/audit-engine.service';
import {
  AuditReport,
  AuditStatus,
  AuditScore,
  LanguageBreakdown,
  FileTreeNode
} from './models/audit.model';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, NgClass, NgFor, NgIf, DecimalPipe, DatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit {
  @ViewChild('langChart') langChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scoreChart') scoreChartRef!: ElementRef<HTMLCanvasElement>;

  repoUrl = '';
  status = signal<AuditStatus>('idle');
  errorMessage = signal('');
  report = signal<AuditReport | null>(null);
  theme = signal<'dark' | 'light'>('dark');
  summaryCopied = signal(false);

  readonly overallGrade = computed(() => {
    const r = this.report();
    if (!r) return { letter: '—', color: '#6e7681' };
    const s = r.overallScore;
    if (s >= 90) return { letter: 'A+', color: '#22c55e' };
    if (s >= 80) return { letter: 'A', color: '#4ade80' };
    if (s >= 70) return { letter: 'B', color: '#facc15' };
    if (s >= 60) return { letter: 'C', color: '#fb923c' };
    if (s >= 50) return { letter: 'D', color: '#f87171' };
    return { letter: 'F', color: '#ef4444' };
  });

  private langChart: Chart | null = null;
  private scoreChart: Chart | null = null;

  constructor(
    private github: GitHubService,
    private engine: AuditEngine
  ) {}

  ngAfterViewInit(): void {}

  toggleTheme(): void {
    this.theme.update(t => t === 'dark' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', this.theme());
  }

  parseUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    const simple = url.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
    if (simple) return { owner: simple[1], repo: simple[2] };
    return null;
  }

  async runAudit(): Promise<void> {
    const parsed = this.parseUrl(this.repoUrl);
    if (!parsed) {
      this.errorMessage.set('Invalid URL — use format: github.com/owner/repo or owner/repo');
      this.status.set('error');
      return;
    }

    this.status.set('fetching');
    this.errorMessage.set('');
    this.report.set(null);

    try {
      const meta = await this.github.fetchRepoMeta(parsed.owner, parsed.repo);
      this.status.set('analyzing');

      const [languages, fileTree] = await Promise.all([
        this.github.fetchLanguages(parsed.owner, parsed.repo),
        this.github.fetchFileTree(parsed.owner, parsed.repo, meta.defaultBranch)
      ]);

      const scores = this.engine.generateScores(meta, languages, fileTree);
      const overallScore = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
      const summary = this.engine.generateSummary(meta, scores);

      const report: AuditReport = {
        repo: meta,
        languages,
        fileTree,
        scores,
        overallScore,
        summary,
        generatedAt: new Date().toISOString()
      };

      this.report.set(report);
      this.status.set('complete');

      setTimeout(() => this.renderCharts(report), 100);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to fetch repository');
      this.status.set('error');
    }
  }

  getScoreColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#facc15';
    if (score >= 40) return '#fb923c';
    return '#ef4444';
  }

  getFileIcon(node: FileTreeNode): string {
    if (node.type === 'dir') return '📁';
    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return '🔷';
      case 'js': case 'jsx': return '🟨';
      case 'py': return '🐍';
      case 'json': return '📋';
      case 'md': return '📝';
      case 'html': return '🌐';
      case 'css': case 'scss': return '🎨';
      case 'yml': case 'yaml': return '⚙️';
      default: return '📄';
    }
  }

  async copySummary(): Promise<void> {
    const r = this.report();
    if (!r) return;

    const lines = [
      `# SnapAudit Report: ${r.repo.fullName}`,
      `Overall Score: ${r.overallScore}/100 (${this.overallGrade().letter})`,
      '',
      '## Scores',
      ...r.scores.map(s => `- ${s.icon} ${s.category}: ${s.score}/100 — ${s.detail}`),
      '',
      '## Suggestions',
      ...r.scores.flatMap(s => s.suggestions.map(sg => `- ${sg}`)),
      '',
      '## Summary',
      r.summary
    ];

    await navigator.clipboard.writeText(lines.join('\n'));
    this.summaryCopied.set(true);
    setTimeout(() => this.summaryCopied.set(false), 2000);
  }

  trackByCategory(_: number, s: AuditScore): string { return s.category; }
  trackByLang(_: number, l: LanguageBreakdown): string { return l.language; }
  trackByPath(_: number, n: FileTreeNode): string { return n.path; }
  trackBySuggestion(i: number): number { return i; }

  private renderCharts(report: AuditReport): void {
    this.renderLangChart(report.languages);
    this.renderScoreChart(report.scores);
  }

  private renderLangChart(languages: LanguageBreakdown[]): void {
    if (this.langChart) this.langChart.destroy();
    const canvas = this.langChartRef?.nativeElement;
    if (!canvas) return;

    this.langChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: languages.map(l => l.language),
        datasets: [{
          data: languages.map(l => l.percentage),
          backgroundColor: languages.map(l => l.color),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#a0a0a0', padding: 12, font: { size: 11 } }
          }
        },
        cutout: '65%'
      }
    });
  }

  private renderScoreChart(scores: AuditScore[]): void {
    if (this.scoreChart) this.scoreChart.destroy();
    const canvas = this.scoreChartRef?.nativeElement;
    if (!canvas) return;

    this.scoreChart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: scores.map(s => s.category),
        datasets: [{
          label: 'Score',
          data: scores.map(s => s.score),
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          borderColor: '#6366f1',
          borderWidth: 2,
          pointBackgroundColor: scores.map(s => this.getScoreColor(s.score)),
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { stepSize: 20, display: false },
            grid: { color: 'rgba(255,255,255,0.06)' },
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            pointLabels: { color: '#a0a0a0', font: { size: 11 } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}