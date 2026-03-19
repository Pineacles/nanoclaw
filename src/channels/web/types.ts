// WebSocket protocol types

// Client → Server
export type ClientMessage =
  | { type: 'chat'; content: string; images?: string[]; sessionId?: string }
  | { type: 'ping' };

// Server → Client
export type ServerMessage =
  | { type: 'message'; id: string; content: string; done: boolean }
  | { type: 'typing'; isTyping: boolean }
  | { type: 'tool_use'; tool: string; target?: string }
  | { type: 'connected' }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'mood'; current_mood: string; energy: number; activity: string }
  | { type: 'session_renamed'; sessionId: string; name: string };
