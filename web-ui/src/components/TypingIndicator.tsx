export function TypingIndicator() {
  return (
    <div className="flex gap-4 items-center pl-4 sm:pl-12 opacity-60">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
      </div>
      <span className="text-xs text-on-surface-variant italic font-light">Thinking...</span>
    </div>
  );
}
