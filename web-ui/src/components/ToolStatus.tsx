import { useMemo } from 'react';
import type { ToolStatus as ToolStatusType } from '../hooks/useChat';

interface Props {
  status: ToolStatusType;
}

const TOOL_DISPLAY: Record<string, { icon: string; label: string }> = {
  Read: { icon: 'description', label: 'Reading' },
  Write: { icon: 'edit_document', label: 'Creating' },
  Edit: { icon: 'edit_note', label: 'Updating' },
  Bash: { icon: 'terminal', label: 'Running command' },
  WebSearch: { icon: 'search', label: 'Searching the web' },
  WebFetch: { icon: 'language', label: 'Fetching page' },
  Glob: { icon: 'folder_open', label: 'Finding files' },
  Grep: { icon: 'search', label: 'Searching code' },
};

export function ToolStatus({ status }: Props) {
  const display = useMemo(() => {
    return TOOL_DISPLAY[status.tool] || { icon: 'build', label: 'Working' };
  }, [status.tool]);

  return (
    <div className="flex justify-start ml-1 lg:ml-12 mb-1 lg:mb-2">
      <div className="bg-tertiary/10 border border-tertiary/20 rounded-full px-3 lg:px-4 py-1 lg:py-1.5
        flex items-center gap-2 shadow-sm animate-pulse">
        <span className="material-symbols-outlined text-tertiary-dim text-[14px] lg:text-[16px]">{display.icon}</span>
        <span className="text-tertiary-dim text-[11px] lg:text-xs font-medium">{display.label}</span>
        {status.target && (
          <span className="hidden lg:inline text-on-surface-variant text-xs">{status.target}</span>
        )}
      </div>
    </div>
  );
}
