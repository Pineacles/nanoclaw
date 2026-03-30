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

export function TasksPage({ tasks, onCreate, onUpdate, onDelete, onTestRun, onActivate, runningTaskIds, taskProgress, taskResults }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState('once');
  const [scheduleValue, setScheduleValue] = useState('');

  const handleCreate = () => {
    if (!prompt.trim()) return;
    onCreate({ prompt: prompt.trim(), schedule_type: scheduleType, schedule_value: scheduleValue });
    setPrompt('');
    setScheduleValue('');
    setShowNew(false);
  };

  const handleTestRun = async (taskId: string) => {
    try {
      await onTestRun(taskId);
    } catch {
      // errors come via WebSocket
    }
  };

  const draftTasks = tasks.filter((t) => t.status === 'draft');
  const activeTasks = tasks.filter((t) => t.status === 'active');
  const otherTasks = tasks.filter((t) => t.status !== 'draft' && t.status !== 'active');

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-8 md:p-12 max-w-6xl mx-auto w-full">
        {/* Hero Header */}
        <section className="mb-6 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3 sm:mb-4 text-on-background">
            Background <span className="text-primary italic">Jobs</span>
          </h1>
          <p className="text-on-surface-variant text-sm sm:text-lg max-w-xl leading-relaxed">
            Scheduled and recurring tasks running in the background. Cron jobs, reviews, and automated workflows.
          </p>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-4 sm:gap-8">
          {/* Active Operations (Large Card) */}
          <div className="col-span-12 md:col-span-8 bg-surface-container rounded-[1rem] p-4 sm:p-8 flex flex-col min-h-[300px] sm:min-h-[400px]">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-0 mb-6 sm:mb-8">
              <div>
                <h2 className="text-2xl font-bold mb-1">Active Operations</h2>
                <p className="text-on-surface-variant text-sm">Currently running tasks</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  {activeTasks.length} Live
                </span>
                <button
                  onClick={() => setShowNew(!showNew)}
                  className="signature-glow text-on-primary-fixed px-5 py-2 rounded-full font-bold text-sm active:scale-95 transition-transform shadow-lg"
                >
                  New Job
                </button>
              </div>
            </div>

            {/* New task form */}
            {showNew && (
              <div className="bg-surface-container-high rounded-xl p-6 mb-6 border border-outline-variant/10 space-y-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What should this job do? Be specific about the task, expected output, and notification behavior."
                  rows={3}
                  className="w-full bg-surface-container-highest text-on-surface text-sm rounded-xl p-4
                    border border-outline-variant/20 focus:outline-none focus:border-primary resize-none leading-relaxed"
                />
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Schedule</label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value)}
                    className="h-9 bg-surface-container-highest text-on-surface text-sm rounded-lg px-4 border border-outline-variant/20 focus:outline-none focus:border-primary"
                  >
                    <option value="once">Run Once</option>
                    <option value="cron">Cron Schedule</option>
                    <option value="interval">Repeating Interval</option>
                  </select>
                  {scheduleType !== 'once' && (
                    <input
                      value={scheduleValue}
                      onChange={(e) => setScheduleValue(e.target.value)}
                      placeholder={scheduleType === 'cron' ? '0 9 * * * (daily at 9am)' : '3600000 (every hour in ms)'}
                      className="flex-1 h-9 bg-surface-container-highest text-on-surface text-sm rounded-lg px-4
                        border border-outline-variant/20 focus:outline-none focus:border-primary"
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCreate}
                    className="signature-glow text-on-primary-fixed font-bold py-2.5 px-6 rounded-xl shadow-lg active:scale-[0.98] transition-transform text-sm"
                  >
                    Create Job
                  </button>
                  <button
                    onClick={() => setShowNew(false)}
                    className="bg-surface-container-highest text-on-surface-variant font-medium py-2.5 px-6 rounded-xl hover:bg-surface-bright transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Active task list */}
            <div className="space-y-4 flex-1">
              {activeTasks.length === 0 && !showNew && (
                <div className="flex-1 flex items-center justify-center py-12">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-on-surface-variant/30 text-5xl mb-3 block">settings_remote</span>
                    <p className="text-on-surface-variant">No active jobs running</p>
                    <p className="text-on-surface-variant/60 text-sm mt-1">Create a new job to get started</p>
                  </div>
                </div>
              )}

              {activeTasks.map((task) => {
                const isRunning = runningTaskIds.has(task.id);
                return (
                  <div key={task.id} className="bg-surface-container-high rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between group hover:bg-surface-bright transition-colors">
                    <div className="flex items-start gap-3 sm:gap-5 flex-1 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {task.schedule_type === 'cron' ? 'schedule' : task.schedule_type === 'interval' ? 'autorenew' : 'play_arrow'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-on-background text-sm leading-relaxed mb-1">{task.prompt}</h3>
                        <p className="text-on-surface-variant text-xs">
                          {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
                          {task.next_run && ` · Next: ${new Date(task.next_run).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 sm:ml-4 flex-wrap">
                      <button
                        onClick={() => handleTestRun(task.id)}
                        disabled={isRunning}
                        className="h-8 bg-surface-container-highest rounded-lg px-4 flex items-center gap-2 text-primary text-xs font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">{isRunning ? 'progress_activity' : 'bolt'}</span>
                        {isRunning ? 'Running...' : 'Run Now'}
                      </button>
                      <button
                        onClick={() => onUpdate(task.id, { status: 'paused' })}
                        className="h-8 bg-surface-container-highest rounded-lg px-4 flex items-center gap-2 text-on-surface-variant text-xs font-medium hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">pause</span>
                        Pause
                      </button>
                      <button
                        onClick={() => onDelete(task.id)}
                        className="h-8 bg-surface-container-highest rounded-lg px-3 text-error hover:bg-error/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Summary Card */}
          <div className="col-span-12 md:col-span-4 bg-surface-container-high rounded-[1rem] p-5 sm:p-8 flex flex-col">
            <h3 className="text-xl font-bold mb-8">System Health</h3>
            <div className="flex-grow space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter font-bold mb-1">Active</div>
                  <div className="text-2xl font-bold text-primary">{activeTasks.length}</div>
                </div>
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter font-bold mb-1">Drafts</div>
                  <div className="text-2xl font-bold text-tertiary-dim">{draftTasks.length}</div>
                </div>
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter font-bold mb-1">Paused</div>
                  <div className="text-2xl font-bold">{otherTasks.filter(t => t.status === 'paused').length}</div>
                </div>
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter font-bold mb-1">Total</div>
                  <div className="text-2xl font-bold">{tasks.length}</div>
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <p className="text-xs leading-relaxed text-on-surface-variant italic">
                "Everything is moving smoothly. I'll notify you if any job requires your direct attention."
              </p>
            </div>
          </div>

          {/* Draft Jobs */}
          {draftTasks.length > 0 && (
            <div className="col-span-12 bg-surface-container rounded-[1rem] p-4 sm:p-8">
              <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">Draft Jobs</h2>
                <span className="bg-tertiary/20 text-tertiary-dim px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  Needs Testing
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftTasks.map((task) => {
                  const result = taskResults[task.id];
                  const isRunning = runningTaskIds.has(task.id);
                  const progress = taskProgress[task.id];
                  return (
                    <div key={task.id} className="bg-surface-container-high rounded-xl p-6 border-l-2 border-tertiary space-y-4">
                      <p className="text-sm text-on-surface leading-relaxed">{task.prompt}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary-dim uppercase tracking-tighter">
                          Draft
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
                        </span>
                        {task.next_run && (
                          <span className="text-[11px] text-on-surface-variant/60 ml-auto">
                            Next: {new Date(task.next_run).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Live progress while running */}
                      {isRunning && (
                        <div className="rounded-xl p-4 text-sm border-l-2 bg-primary/10 border-primary text-primary">
                          <div className="flex items-center gap-2 font-bold mb-1">
                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            Running...
                          </div>
                          {progress && (
                            <p className="opacity-80 text-xs">
                              {progress.tool}{progress.target ? ` — ${progress.target}` : ''}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Result when done */}
                      {!isRunning && result && (
                        <div className={`rounded-xl p-4 text-sm border-l-2 ${
                          result.status === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                            : 'bg-error/10 border-error text-on-error-container'
                        }`}>
                          {result.status === 'success' ? (
                            <>
                              <div className="font-bold mb-1">Test passed</div>
                              {result.result && <p className="opacity-80 leading-relaxed whitespace-pre-wrap">{result.result.replace(/<\/?internal>/g, '').trim().slice(0, 500)}</p>}
                              <span className="text-xs opacity-60">Duration: {(result.duration_ms / 1000).toFixed(1)}s</span>
                            </>
                          ) : (
                            <>
                              <div className="font-bold mb-1">Test failed</div>
                              {result.error && <p className="opacity-80 leading-relaxed">{result.error}</p>}
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleTestRun(task.id)}
                          disabled={isRunning}
                          className="h-9 bg-surface-container-highest rounded-xl px-5 flex items-center gap-2 text-on-surface-variant text-sm font-medium hover:text-on-surface disabled:opacity-50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">{isRunning ? 'progress_activity' : 'play_arrow'}</span>
                          {isRunning ? 'Running...' : 'Test Run'}
                        </button>
                        {!isRunning && result?.status === 'success' && (
                          <button
                            onClick={() => onActivate(task.id)}
                            className="h-9 bg-emerald-500/20 rounded-xl px-5 flex items-center gap-2 text-emerald-400 text-sm font-bold"
                          >
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(task.id)}
                          className="h-9 bg-surface-container-highest rounded-xl px-4 text-error hover:bg-error/10 transition-colors flex items-center gap-2 text-sm"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paused / Completed Jobs */}
          {otherTasks.length > 0 && (
            <div className="col-span-12 bg-surface-container rounded-[1rem] p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Paused &amp; Completed</h2>
              <div className="space-y-3">
                {otherTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-surface-container-high transition-colors">
                    <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined">
                        {task.status === 'paused' ? 'pause_circle' : 'check_circle'}
                      </span>
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="font-bold text-on-background text-sm truncate">{task.prompt}</div>
                      <div className="text-xs text-on-surface-variant">
                        {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                      task.status === 'paused' ? 'bg-tertiary/20 text-tertiary-dim' : 'bg-outline-variant/20 text-on-surface-variant'
                    }`}>
                      {task.status}
                    </span>
                    <div className="flex gap-2">
                      {task.status === 'paused' && (
                        <button
                          onClick={() => onUpdate(task.id, { status: 'active' })}
                          className="h-8 bg-emerald-500/20 rounded-lg px-4 flex items-center gap-2 text-emerald-400 text-xs font-medium"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          Resume
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(task.id)}
                        className="h-8 bg-surface-container-highest rounded-lg px-3 text-error hover:bg-error/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
