import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const WORD_MS = 26;

export function StreamingMarkdown({
  content,
  animate,
}: {
  content: string;
  /** when true, reveal the text word-by-word; when false, show it all at once */
  animate: boolean;
}) {
  const words = useMemo(() => content.split(/(\s+)/), [content]);
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const [visible, setVisible] = useState(() => (animate ? 0 : words.length));
  const idxRef = useRef(animate ? 0 : words.length);
  const lastRef = useRef(performance.now());

  useEffect(() => {
    if (!animate) {
      idxRef.current = words.length;
      setVisible(words.length);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const len = wordsRef.current.length;
      let advanced = false;
      while (now - lastRef.current >= WORD_MS && idxRef.current < len) {
        idxRef.current += 1;
        lastRef.current += WORD_MS;
        advanced = true;
      }
      if (advanced) setVisible(idxRef.current);
      if (idxRef.current < len) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, content, words.length]);

  const shown = words.slice(0, visible).join("");

  return <ReactMarkdown>{shown}</ReactMarkdown>;
}
