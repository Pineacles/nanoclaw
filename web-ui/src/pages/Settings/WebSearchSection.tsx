import { SettingsCard } from './SettingsCard';
import { NCToggle } from './NCToggle';

interface WebSearchSectionProps {
  enabled: boolean;
  onToggle: () => void;
  span?: number;
}

export function WebSearchSection({ enabled, onToggle, span = 5 }: WebSearchSectionProps) {
  return (
    <SettingsCard title="Web search" span={span}>
      <p className="text-[12.5px] text-nc-text-muted leading-[1.5] m-0">
        Use Perplexity when Seyoung needs to look something up.
      </p>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-nc-text">Enabled</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle web search"
          onClick={onToggle}
          className="nc-press cursor-pointer border-none bg-transparent p-0"
        >
          <NCToggle on={enabled} />
        </button>
      </div>
    </SettingsCard>
  );
}
