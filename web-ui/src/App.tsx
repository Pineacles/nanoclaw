import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './lib/api';
import { useChat } from './hooks/useChat';
import { useMemory } from './hooks/useMemory';
import { useTasks } from './hooks/useTasks';
import { useWorkflows } from './hooks/useWorkflows';
import { useSessions } from './hooks/useSessions';
import { useMood } from './hooks/useMood';
import { Chat } from './components/Chat';
import { Sidebar, View } from './components/Sidebar';
import { MemoryPage } from './components/MemoryPage';
import { WorkflowsPage } from './components/WorkflowsPage';
import { TasksPage } from './components/TasksPage';
import { SettingsPage } from './components/SettingsPage';
import { ContextPage } from './components/ContextPage';
import { VoiceCallPage } from './components/VoiceCallPage';
import { SessionsPanel } from './components/SessionsPanel';
import { FilesPanel, countAttachments } from './components/FilesPanel';
import { BottomNav } from './components/BottomNav';
import { MoreSheet } from './components/MoreSheet';
import { MOOD_COLORS } from './components/MoodBlob';

export default function App() {
  const [authVersion, setAuthVersion] = useState(0);
  const [activeView, setActiveViewRaw] = useState<View>(() => {
    const saved = localStorage.getItem('nanoclaw_active_view');
    return (saved as View) || 'sessions';
  });
  const setActiveView = useCallback((view: View) => {
    setActiveViewRaw(view);
    localStorage.setItem('nanoclaw_active_view', view);
  }, []);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const authenticated = !!getToken();

  const handleAuthChange = useCallback(() => {
    setAuthVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    api.get<{ features?: Record<string, boolean>; assistant?: { name: string } }>('/api/group-config')
      .then(config => {
        setFeatures(config.features || {});
        if (config.assistant?.name) {
          document.title = config.assistant.name;
        }
      })
      .catch(() => {});
  }, [authenticated]);

  const isEnabled = (key: string) => features[key] !== false;

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    renameSession,
    deleteSession,
    handleSessionRenamed,
  } = useSessions(authenticated);

  const { mood, setMood } = useMood(authenticated);

  const tasks = useTasks(authenticated);

  const { messages, isTyping, toolStatus, isQueued, connected, sendMessage, deleteMessage } =
    useChat(authenticated, activeSessionId, (m) =>
      setMood((prev) => ({ ...prev, current_mood: m.current_mood, energy: m.energy, activity: m.activity })),
      handleSessionRenamed,
      tasks.handleTaskEvent,
    );
  const memory = useMemory(authenticated);
  const wf = useWorkflows(authenticated);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const attachmentCount = useMemo(() => countAttachments(messages), [messages]);

  const moodColor = MOOD_COLORS[mood.current_mood || 'chill'] || MOOD_COLORS.chill;

  // Close more sheet on nav
  const handleViewChange = useCallback((view: View) => {
    setActiveView(view);
    setMoreSheetOpen(false);
  }, []);

  const handleSessionSelect = useCallback((id: string) => {
    setActiveSessionId(id);
    setMoreSheetOpen(false);
  }, [setActiveSessionId]);

  // Close files panel on session switch
  useEffect(() => {
    setShowFilesPanel(false);
  }, [activeSessionId]);

  void authVersion;

  const renderMainContent = () => {
    if (!authenticated) {
      return (
        <div className="flex items-center justify-center h-full px-4">
          <div className="p-8 sm:p-10 bg-surface-container rounded-[1rem] border-l-4 border-primary inner-thought-glow max-w-sm w-full">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/20 mx-auto mb-4">
              <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            </div>
            <h1 className="text-xl font-bold mb-2 text-center">Welcome</h1>
            <p className="text-on-surface-variant text-sm leading-relaxed text-center mb-6">
              Enter your authentication token to begin.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); const input = (e.target as HTMLFormElement).elements.namedItem('token') as HTMLInputElement; if (input.value.trim()) { setToken(input.value.trim()); handleAuthChange(); } }}>
              <input
                name="token"
                type="password"
                placeholder="Auth token..."
                className="w-full bg-surface-container-highest border-none rounded-xl py-3 px-4 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary-dim transition-all text-sm focus:outline-none mb-3"
              />
              <button
                type="submit"
                className="w-full signature-glow text-on-primary-fixed font-bold py-3 px-8 rounded-xl shadow-lg active:scale-[0.98] transition-all text-sm"
              >
                Connect
              </button>
            </form>
          </div>
        </div>
      );
    }

    switch (activeView) {
      case 'sessions':
        return (
          <Chat
            messages={messages}
            isTyping={isTyping}
            toolStatus={toolStatus}
            isQueued={isQueued}
            connected={connected}
            onSend={sendMessage}
            onDelete={deleteMessage}
            readOnly={activeSessionId === 'whatsapp' || activeSessionId?.startsWith('whatsapp-')}
          />
        );
      case 'memory':
        return (
          <MemoryPage
            files={memory.files}
            selectedFile={memory.selectedFile}
            content={memory.content}
            loading={memory.loading}
            onSelect={memory.loadFile}
            onSave={memory.saveFile}
            onCreate={memory.createFile}
            onDelete={memory.deleteFile}
          />
        );
      case 'workflows':
        return (
          <WorkflowsPage
            workflows={wf.workflows}
            selectedWorkflow={wf.selectedWorkflow}
            loading={wf.loading}
            onSelect={wf.loadWorkflow}
            onSave={wf.saveWorkflow}
            onCreate={wf.createWorkflow}
            onDelete={wf.deleteWorkflow}
            onClearSelection={wf.clearSelection}
          />
        );
      case 'tasks':
        return (
          <TasksPage
            tasks={tasks.tasks}
            onCreate={tasks.createTask}
            onUpdate={tasks.updateTask}
            onDelete={tasks.deleteTask}
            onTestRun={tasks.testRun}
            onActivate={tasks.activateTask}
            runningTaskIds={tasks.runningTaskIds}
            taskProgress={tasks.taskProgress}
            taskResults={tasks.taskResults}
          />
        );
      case 'context':
        return <ContextPage authenticated={authenticated} />;
      case 'voice':
        if (!isEnabled('voice_call')) {
          return (
            <Chat
              messages={messages}
              isTyping={isTyping}
              toolStatus={toolStatus}
              isQueued={isQueued}
              connected={connected}
              onSend={sendMessage}
              onDelete={deleteMessage}
              readOnly={activeSessionId === 'whatsapp' || activeSessionId?.startsWith('whatsapp-')}
            />
          );
        }
        return <VoiceCallPage />;
      case 'settings':
        return (
          <SettingsPage
            authenticated={authenticated}
            onAuthChange={handleAuthChange}
          />
        );
    }
  };

  return (
    <div className="h-dvh flex bg-surface">
      {/* Desktop Sidebar — hidden on mobile */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        mood={mood}
        features={features}
        sessionList={
          <SessionsPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSessionSelect}
            onCreate={createSession}
            onRename={renameSession}
            onDelete={deleteSession}
          />
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 lg:ml-72">
        {/* TopAppBar — mobile: minimal with mood dot. Desktop: full */}
        <header className="flex justify-between items-center px-4 sm:px-8 py-2.5 sm:py-4 w-full sticky top-0 z-20 bg-surface/80 backdrop-blur-lg">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            {/* Mobile: mood dot (tapping opens more sheet) */}
            <button
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full transition-colors active:scale-90"
              onClick={() => setMoreSheetOpen(true)}
              title="Menu"
            >
              {isEnabled('mood') && (
                <div
                  className="w-3 h-3 rounded-full transition-colors duration-700 shadow-[0_0_8px_var(--mood-glow)]"
                  style={{
                    background: moodColor,
                    '--mood-glow': moodColor + '60',
                  } as React.CSSProperties}
                />
              )}
            </button>
            {/* Desktop: brand */}
            <h1 className="hidden lg:block text-lg font-bold text-primary tracking-tight">Assistant</h1>
            <span className="hidden lg:inline px-2 py-0.5 rounded-md bg-surface-container-highest text-[10px] text-on-surface-variant border border-outline-variant/10 uppercase tracking-tighter">
              Claude Sonnet 4
            </span>
            {/* Mobile: session name */}
            <span className="lg:hidden text-sm font-semibold text-on-surface truncate max-w-[200px]">
              {activeView === 'sessions' ? (activeSession?.name || 'Chat') : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {activeView === 'sessions' && (
              <>
                {/* Desktop: session name */}
                <span className="hidden lg:block text-sm text-on-surface-variant font-medium">
                  {activeSession?.name || 'Chat'}
                </span>
                <button
                  onClick={() => setShowFilesPanel((v) => !v)}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    showFilesPanel ? 'bg-primary/15 text-primary' : 'text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                  title="Files & attachments"
                >
                  <span className="material-symbols-outlined text-[18px]">folder_open</span>
                  {attachmentCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-primary text-[9px] font-bold text-on-primary-fixed rounded-full px-1">
                      {attachmentCount}
                    </span>
                  )}
                </button>
              </>
            )}
            <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
          </div>
        </header>

        {/* Content — on mobile, reserve space for bottom nav */}
        <div className="flex-1 min-h-0 pb-14 lg:pb-0">
          {renderMainContent()}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeView={activeView}
        onViewChange={handleViewChange}
        onMoreTap={() => setMoreSheetOpen((v) => !v)}
        moreOpen={moreSheetOpen}
      />

      {/* More Sheet (mobile) */}
      <MoreSheet
        open={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        mood={mood}
        features={features}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSessionSelect}
        onCreateSession={createSession}
        onRenameSession={renameSession}
        onDeleteSession={deleteSession}
        onNavigate={handleViewChange}
        attachmentCount={attachmentCount}
        onOpenFiles={() => { setShowFilesPanel(true); setMoreSheetOpen(false); }}
      />

      {/* Files drawer */}
      {showFilesPanel && activeView === 'sessions' && (
        <FilesPanel messages={messages} onClose={() => setShowFilesPanel(false)} />
      )}
    </div>
  );
}
