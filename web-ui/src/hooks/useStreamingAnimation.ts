import { useEffect, useRef, useState } from 'react';

export function useStreamingAnimation(
  fullContent: string,
  isStreaming: boolean,
): string {
  const [displayedLength, setDisplayedLength] = useState(0);
  const animatedUpTo = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeBlockDepth = useRef(0);

  // When streaming ends, show full content immediately
  useEffect(() => {
    if (!isStreaming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      animatedUpTo.current = fullContent.length;
      setDisplayedLength(fullContent.length);
    }
  }, [isStreaming, fullContent.length]);

  // Animate new content word by word
  useEffect(() => {
    if (!isStreaming) return;

    // Short responses: skip animation
    if (fullContent.split(/\s+/).length < 10 && !isStreaming) {
      animatedUpTo.current = fullContent.length;
      setDisplayedLength(fullContent.length);
      return;
    }

    function animateNext() {
      const current = animatedUpTo.current;
      if (current >= fullContent.length) return;

      const remaining = fullContent.slice(current);

      // Match next word (including leading whitespace)
      const match = remaining.match(/^\s*\S+/);
      if (!match) {
        // Only whitespace left
        animatedUpTo.current = fullContent.length;
        setDisplayedLength(fullContent.length);
        return;
      }

      const word = match[0];
      const newPos = current + word.length;
      animatedUpTo.current = newPos;
      setDisplayedLength(newPos);

      // Check for code block markers in the word
      const backtickMatches = word.match(/```/g);
      if (backtickMatches) {
        codeBlockDepth.current += backtickMatches.length;
      }
      const insideCode = codeBlockDepth.current % 2 === 1;

      // Calculate delay
      let delay: number;
      if (insideCode) {
        delay = 5 + Math.random() * 10; // 5-15ms for code
      } else if (/[.!?;:]/.test(word.trim().slice(-1))) {
        delay = 80 + Math.random() * 40; // 80-120ms after punctuation
      } else {
        delay = 20 + Math.random() * 20; // 20-40ms normal
      }

      timerRef.current = setTimeout(animateNext, delay);
    }

    // Start animating if there's new content beyond what we've shown
    if (animatedUpTo.current < fullContent.length && !timerRef.current) {
      animateNext();
    } else if (
      animatedUpTo.current < fullContent.length &&
      timerRef.current
    ) {
      // Timer already running, it will catch up
    }

    return () => {
      // Don't clear timer on re-render — let animation continue
    };
  }, [fullContent, isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isStreaming) return fullContent;
  return fullContent.slice(0, displayedLength);
}
