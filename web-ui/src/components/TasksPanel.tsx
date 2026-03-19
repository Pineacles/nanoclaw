import { useState } from 'react';
import type { Task, TestRunResult } from '../hooks/useTasks';

interface Props {
  tasks: Task[];
  onCreate: (task: {
    prompt: string;
    schedule_type: string;
    schedule_value: string;
  }) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onTestRun: (taskId: string) => Promise<TestRunResult>;
  onActivate: (taskId: string) => void;
}

export function TasksPanel({ tasks, onCreate, onUpdate, onDelete, onTestRun, onActivate }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState('once');
  const [scheduleValue, setScheduleValue] = useState('');
  const [testResults, setTestResults] = useState<Record<string, TestRunResult | null>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const handleCreate = () => {
    if (!prompt.trim()) return;
    onCreate({
      prompt: prompt.trim(),
      schedule_type: scheduleType,
      schedule_value: scheduleValue,
    });
    setPrompt('');
    setScheduleValue('');
    setShowNew(false);
  };

  const handleTestRun = async (taskId: string) => {
    setTesting((prev) => ({ ...prev, [taskId]: true }));
    setTestResults((prev) => ({ ...prev, [taskId]: null }));
    try {
      const result = await onTestRun(taskId);
      setTestResults((prev) => ({ ...prev, [taskId]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [taskId]: { status: 'error', result: null, error: err instanceof Error ? err.message : String(err), duration_ms: 0 },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const draftTasks = tasks.filter((t) => t.status === 'draft');
  const activeTasks = tasks.filter((t) => t.status !== 'draft');

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>settings_remote</span>
        <span className="text-sm font-bold text-on-surface uppercase tracking-widest">Jobs</span>
        <span className="flex-1" />
        <button
          onClick={() => setShowNew(!showNew)}
          className="h-[28px] signature-glow rounded-full px-3 flex items-center gap-1.5
            shadow-[0_2px_10px_rgba(255,144,109,0.2)] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-on-primary-fixed text-[14px]">add</span>
          <span className="text-[11px] font-bold text-on-primary-fixed">New</span>
        </button>
      </div>

      {/* New task form */}
      {showNew && (
        <div className="bg-surface-container-high rounded-xl p-4 space-y-3 border border-outline-variant/10">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should this job do?"
            rows={3}
            className="w-full bg-surface-container-highest text-on-surface text-[12px] rounded-lg p-3
              border border-outline-variant/20 focus:outline-none focus:border-primary resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              className="h-8 bg-surface-container-highest text-on-surface text-[12px] rounded-lg px-3 border border-outline-variant/20 focus:outline-none focus:border-primary appearance-none"
            >
              <option value="once">Once</option>
              <option value="cron">Cron</option>
              <option value="interval">Interval</option>
            </select>
            {scheduleType !== 'once' && (
              <input
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.target.value)}
                placeholder={scheduleType === 'cron' ? '0 9 * * *' : '3600000'}
                className="flex-1 h-8 bg-surface-container-highest text-on-surface text-[12px] rounded-lg px-3
                  border border-outline-variant/20 focus:outline-none focus:border-primary"
              />
            )}
          </div>
          <button
            onClick={handleCreate}
            className="w-full h-9 signature-glow text-on-primary-fixed text-[13px] font-bold rounded-full
              shadow-[0_4px_20px_rgba(255,144,109,0.3)] active:scale-[0.98] transition-transform"
          >
            Create Job
          </button>
        </div>
      )}

      {/* Draft tasks */}
      {draftTasks.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Drafts</span>
            <div className="flex-1 h-px bg-outline-variant/10" />
          </div>
          <div className="space-y-2">
            {draftTasks.map((task) => {
              const result = testResults[task.id];
              const isTesting = testing[task.id];
              return (
                <div
                  key={task.id}
                  className="bg-surface-container-high rounded-xl p-4 border-l-2 border-tertiary space-y-3"
                >
                  <p className="text-[12px] text-on-surface leading-relaxed">{task.prompt}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/20 text-tertiary uppercase tracking-tighter">
                      Draft
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
                    </span>
                    {task.next_run && (
                      <span className="text-[9px] text-on-surface-variant/60 ml-auto">
                        next: {new Date(task.next_run).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Test result */}
                  {result && (
                    <div className={`rounded-lg p-3 text-[11px] border-l-2 ${
                      result.status === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                        : 'bg-error/10 border-error text-on-error-container'
                    }`}>
                      {result.status === 'success' ? (
                        <>
                          <span className="font-bold">Test passed</span>
                          {result.result && (
                            <p className="mt-1 opacity-80 line-clamp-3">{result.result.slice(0, 200)}</p>
                          )}
                          <span className="text-[9px] opacity-60"> ({result.duration_ms}ms)</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold">Test failed</span>
                          {result.error && (
                            <p className="mt-1 opacity-80">{result.error}</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTestRun(task.id)}
                      disabled={isTesting}
                      className="h-7 bg-surface-container-highest rounded-lg px-3 flex items-center gap-1.5 text-on-surface-variant text-[11px] hover:text-on-surface disabled:opacity-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">{isTesting ? 'progress_activity' : 'play_arrow'}</span>
                      {isTesting ? 'Testing...' : 'Test'}
                    </button>
                    {result?.status === 'success' && (
                      <button
                        onClick={() => onActivate(task.id)}
                        className="h-7 bg-emerald-500/20 rounded-lg px-3 flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold"
                      >
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(task.id)}
                      className="h-7 bg-surface-container-highest rounded-lg px-3 flex items-center gap-1.5 text-error text-[11px] hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Active tasks */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Active</span>
        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold">
          {activeTasks.filter(t => t.status === 'active').length} Live
        </span>
        <div className="flex-1 h-px bg-outline-variant/10" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {activeTasks.length === 0 && (
          <div className="text-center text-on-surface-variant text-xs py-6">
            No active jobs
          </div>
        )}

        {activeTasks.map((task) => {
          const isTesting = testing[task.id];
          return (
            <div
              key={task.id}
              className="bg-surface-container-high rounded-xl p-4 hover:bg-surface-bright transition-colors space-y-3"
            >
              <p className="text-[12px] text-on-surface leading-relaxed">{task.prompt}</p>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                    task.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : task.status === 'paused'
                        ? 'bg-tertiary/20 text-tertiary'
                        : 'bg-outline-variant/20 text-on-surface-variant'
                  }`}
                >
                  {task.status}
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  {task.schedule_type}{task.schedule_value ? ` · ${task.schedule_value}` : ''}
                </span>
                {task.status === 'active' && (
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse ml-auto" />
                )}
              </div>
              {task.next_run && task.status === 'active' && (
                <div className="text-[9px] text-on-surface-variant/60">
                  Next run: {new Date(task.next_run).toLocaleString()}
                </div>
              )}
              <div className="flex gap-2">
                {task.status === 'active' && (
                  <>
                    <button
                      onClick={() => onUpdate(task.id, { status: 'paused' })}
                      className="h-7 bg-surface-container-highest rounded-lg px-3 flex items-center gap-1.5 text-on-surface-variant text-[11px] hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">pause</span>
                      Pause
                    </button>
                    <button
                      onClick={() => handleTestRun(task.id)}
                      disabled={isTesting}
                      className="h-7 bg-surface-container-highest rounded-lg px-3 flex items-center gap-1.5 text-primary text-[11px] hover:bg-primary/10 disabled:opacity-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">{isTesting ? 'progress_activity' : 'bolt'}</span>
                      {isTesting ? 'Running...' : 'Run Now'}
                    </button>
                  </>
                )}
                {task.status === 'paused' && (
                  <button
                    onClick={() => onUpdate(task.id, { status: 'active' })}
                    className="h-7 bg-emerald-500/20 rounded-lg px-3 flex items-center gap-1.5 text-emerald-400 text-[11px]"
                  >
                    <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                    Resume
                  </button>
                )}
                <button
                  onClick={() => onDelete(task.id)}
                  className="h-7 bg-surface-container-highest rounded-lg px-3 flex items-center gap-1.5 text-error text-[11px] hover:bg-error/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
