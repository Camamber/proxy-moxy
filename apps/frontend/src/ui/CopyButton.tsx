import { useState } from 'react';

interface Props {
  text: string;
  label?: string;
}

export function CopyButton({ text, label = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable outside secure contexts; the text is still selectable.
    }
  };

  return (
    <button className="copy" onClick={copy} disabled={!text}>
      {copied ? 'Copied' : label}
    </button>
  );
}
