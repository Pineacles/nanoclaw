import { useCallback, useState } from 'react';
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

export default function App() {
  const [authVersion, setAuthVersion] = useState(0);
  const [activeView, setActiveView] = useState<View>('sessions');
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

  void authVersion;

  const renderMainContent = () => {
    if (!authenticated) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-10 bg-surface-container rounded-[1rem] border-l-4 border-primary inner-thought-glow max-w-sm">
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
    <div className="h-screen flex bg-surface">
      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        mood={mood}
        sessionList={
          <SessionsPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onCreate={createSession}
            onRename={renameSession}
            onDelete={deleteSession}
          />
        }
      />

      {/* Main Content Canvas */}
      <main className="flex-1 flex flex-col min-w-0 ml-72">
        {/* TopAppBar */}
        <header className="flex justify-between items-center px-8 py-4 w-full sticky top-0 z-50 bg-surface/80 backdrop-blur-lg">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-primary tracking-tight">Seyoung</h1>
            <span className="px-2 py-0.5 rounded-md bg-surface-container-highest text-[10px] text-on-surface-variant border border-outline-variant/10 uppercase tracking-tighter">
              Claude Sonnet 4
            </span>
          </div>
          <div className="flex items-center gap-4">
            {activeView === 'sessions' && (
              <span className="text-sm text-on-surface-variant font-medium">
                {activeSession?.name || 'Seyoung'}
              </span>
            )}
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {renderMainContent()}
        </div>
      </main>
    </div>
  );
}
