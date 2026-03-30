import { useCallback, useEffect, useMemo, useState } from 'react';
import { getToken } from './lib/api';
import { useChat } from './hooks/useChat';
import { useMemory } from './hooks/useMemory';
import { useTasks } from './hooks/useTasks';
import { useSessions } from './hooks/useSessions';
import { useMood } from './hooks/useMood';
import { Chat } from './components/Chat';
import { Sidebar, View } from './components/Sidebar';
import { MemoryPage } from './components/MemoryPage';
import { TasksPage } from './components/TasksPage';
import { QuickActionsPage } from './components/QuickActionsPage';
import { SettingsPage } from './components/SettingsPage';
import { SessionsPanel } from './components/SessionsPanel';
import { FilesPanel, countAttachments } from './components/FilesPanel';

export default function App() {
  const [authVersion, setAuthVersion] = useState(0);
  const [activeView, setActiveView] = useState<View>('sessions');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const authenticated = !!getToken();

  const handleAuthChange = useCallback(() => {
    setAuthVersion((v) => v + 1);
  }, []);

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

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const attachmentCount = useMemo(() => countAttachments(messages), [messages]);

  // Close sidebar on navigation (mobile)
  const handleViewChange = useCallback((view: View) => {
    setActiveView(view);
    setSidebarOpen(false);
  }, []);

  // Close sidebar when selecting a session (mobile)
  const handleSessionSelect = useCallback((id: string) => {
    setActiveSessionId(id);
    setSidebarOpen(false);
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
          <div className="text-center p-8 sm:p-10 bg-surface-container rounded-[1rem] border-l-4 border-primary inner-thought-glow max-w-sm w-full">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/20 mx-auto mb-4">
              <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Welcome</h1>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              Enter your authentication token in the Settings panel to begin your intimate digital experience.
            </p>
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
            readOnly={activeSessionId === 'whatsapp'}
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
      case 'actions':
        return (
          <QuickActionsPage
            onSend={(prompt) => {
              sendMessage(prompt);
              setActiveView('sessions');
            }}
            authenticated={authenticated}
          />
        );
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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        mood={mood}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
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

      {/* Main Content Canvas */}
      <main className="flex-1 flex flex-col min-w-0 lg:ml-72">
        {/* TopAppBar */}
        <header className="flex justify-between items-center px-4 sm:px-8 py-3 sm:py-4 w-full sticky top-0 z-20 bg-surface/80 backdrop-blur-lg">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors -ml-1"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined text-on-surface-variant">menu</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-primary tracking-tight">Assistant</h1>
            <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-surface-container-highest text-[10px] text-on-surface-variant border border-outline-variant/10 uppercase tracking-tighter">
              Claude Sonnet 4
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {activeView === 'sessions' && (
              <>
                <span className="text-xs sm:text-sm text-on-surface-variant font-medium truncate max-w-[120px] sm:max-w-none">
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

        {/* Content */}
        <div className="flex-1 min-h-0">
          {renderMainContent()}
        </div>
      </main>

      {/* Files drawer */}
      {showFilesPanel && activeView === 'sessions' && (
        <FilesPanel messages={messages} onClose={() => setShowFilesPanel(false)} />
      )}
    </div>
  );
}
