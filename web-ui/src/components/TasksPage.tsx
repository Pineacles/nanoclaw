import { useState } from 'react';
import type { Task, TestRunResult, TaskProgress } from '../hooks/useTasks';

interface Props {
  tasks: Task[];
  onCreate: (task: {
    prompt: string;
    schedule_type: string;
    schedule_value: string;
  }) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onTestRun: (taskId: string) => Promise<void>;
  onActivate: (taskId: string) => void;
  runningTaskIds: Set<string>;
  taskProgress: Record<string, TaskProgress>;
  taskResults: Record<string, TestRunResult>;
}

function TaskCard({ task, isRunning, progress, onRun, onPause, onResume, onDelete, expanded, onToggle }: {
  task: Task;
  isRunning: boolean;
  progress?: TaskProgress;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isActive = task.status === 'active';
  const isPaused = task.status === 'paused';

  return (
    <div className="bg-surface-container-high rounded-xl overflow-hidden">
      {/* Header — always visible, clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-bright/50 transition-colors"
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isActive ? 'bg-primary/20 text-primary' : 'bg-surface-container-highest text-on-surface-variant'
        }`}>
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {task.schedule_type === 'cron' ? 'schedule' : task.schedule_type === 'interval' ? 'autorenew' : 'play_arrow'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-on-surface text-sm truncate">{task.title || 'Untitled Job'}</h3>
          <p className="text-[11px] text-on-surface-variant">
            {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
            {task.next_run && ` · Next: ${new Date(task.next_run).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning && (
            <span className="material-symbols-outlined text-primary text-[16px] animate-spin">progress_activity</span>
          )}
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${
            isActive ? 'bg-primary/15 text-primary' : isPaused ? 'bg-tertiary/20 text-tertiary-dim' : 'bg-outline-variant/20 text-on-surface-variant'
          }`}>
            {task.status}
          </span>
          <span className={`material-symbols-outlined text-on-surface-variant/50 text-[18px] transition-transform ${expanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Prompt in a box */}
          <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/10">
            <p className="text-[11px] text-on-surface-variant/50 uppercase tracking-wider font-bold mb-2">Instructions</p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
          </div>

          {/* Running progress */}
          {isRunning && progress && (
            <div className="bg-primary/10 rounded-xl p-3 border-l-2 border-primary">
              <div className="flex items-center gap-2 text-primary text-sm font-medium">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Running...
              </div>
              <p className="text-xs text-primary/70 mt-1">{progress.tool}{progress.target ? ` — ${progress.target}` : ''}</p>
            </div>
          )}

          {/* Last result */}
          {task.last_result && (
            <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/10">
              <p className="text-[11px] text-on-surface-variant/50 uppercase tracking-wider font-bold mb-1">Last Result</p>
              <p className="text-xs text-on-surface-variant leading-relaxed truncate">{task.last_result.slice(0, 200)}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              disabled={isRunning}
              className="h-8 bg-surface-container-highest rounded-lg px-4 flex items-center gap-1.5 text-primary text-xs font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">{isRunning ? 'progress_activity' : 'bolt'}</span>
              {isRunning ? 'Running' : 'Run Now'}
            </button>
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onPause(); }}
                className="h-8 bg-surface-container-highest rounded-lg px-4 flex items-center gap-1.5 text-on-surface-variant text-xs font-medium hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">pause</span>
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={(e) => { e.stopPropagation(); onResume(); }}
                className="h-8 bg-emerald-500/15 rounded-lg px-4 flex items-center gap-1.5 text-emerald-400 text-xs font-medium"
              >
                <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                Resume
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="h-8 bg-surface-container-highest rounded-lg px-3 text-error hover:bg-error/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TasksPage({ tasks, onCreate, onUpdate, onDelete, onTestRun, runningTaskIds, taskProgress }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState('cron');
  const [scheduleValue, setScheduleValue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!prompt.trim()) return;
    onCreate({ prompt: prompt.trim(), schedule_type: scheduleType, schedule_value: scheduleValue });
    setPrompt('');
    setScheduleValue('');
    setShowNew(false);
  };

  const activeTasks = tasks.filter((t) => t.status === 'active');
  const pausedTasks = tasks.filter((t) => t.status === 'paused');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-4xl mx-auto w-full">
        {/* Header */}
        <section className="mb-6 sm:mb-10">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3 sm:mb-4 text-on-background">
            Background <span className="text-primary italic">Jobs</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
              {activeTasks.length} Active
            </span>
            {pausedTasks.length > 0 && (
              <span className="bg-tertiary/20 text-tertiary-dim px-3 py-1 rounded-full text-xs font-bold">
                {pausedTasks.length} Paused
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setShowNew(!showNew)}
              className="h-9 signature-glow text-on-primary-fixed px-5 rounded-full font-bold text-sm active:scale-95 transition-transform shadow-lg flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Job
            </button>
          </div>
        </section>

        {/* New task form */}
        {showNew && (
          <div className="bg-surface-container rounded-xl p-5 mb-6 border border-outline-variant/10 space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should this job do? Be specific."
              rows={3}
              className="w-full bg-surface-container-highest text-on-surface text-sm rounded-xl p-4 border border-outline-variant/20 focus:outline-none focus:border-primary resize-none leading-relaxed"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
                className="h-9 bg-surface-container-highest text-on-surface text-sm rounded-lg px-4 border border-outline-variant/20 focus:outline-none focus:border-primary"
              >
                <option value="cron">Cron</option>
                <option value="interval">Interval</option>
                <option value="once">Once</option>
              </select>
              {scheduleType !== 'once' && (
                <input
                  value={scheduleValue}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  placeholder={scheduleType === 'cron' ? '0 9 * * * (daily 9am)' : '3600000 (ms)'}
                  className="flex-1 h-9 bg-surface-container-highest text-on-surface text-sm rounded-lg px-4 border border-outline-variant/20 focus:outline-none focus:border-primary min-w-[200px]"
                />
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} className="h-9 signature-glow text-on-primary-fixed font-bold px-6 rounded-xl shadow-lg active:scale-[0.98] text-sm">
                Create
              </button>
              <button onClick={() => setShowNew(false)} className="h-9 bg-surface-container-highest text-on-surface-variant font-medium px-6 rounded-xl text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="space-y-2">
          {tasks.length === 0 && (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-on-surface-variant/20 text-6xl mb-3 block">settings_remote</span>
              <p className="text-on-surface-variant">No background jobs yet</p>
            </div>
          )}

          {/* Active first, then paused */}
          {[...activeTasks, ...pausedTasks].map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isRunning={runningTaskIds.has(task.id)}
              progress={taskProgress[task.id]}
              onRun={() => onTestRun(task.id)}
              onPause={() => onUpdate(task.id, { status: 'paused' })}
              onResume={() => onUpdate(task.id, { status: 'active' })}
              onDelete={() => onDelete(task.id)}
              expanded={expandedId === task.id}
              onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
