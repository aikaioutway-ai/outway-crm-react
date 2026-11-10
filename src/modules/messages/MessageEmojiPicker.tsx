import React, { useRef } from 'react';
import { Smile } from 'lucide-react';

const emojis = ['😊', '😂', '❤️', '👍', '🙏', '👋', '👌', '✅', '🎉', '🔥', '😅', '🤔', '🙌', '🙂', '😢', '👀'];

export default function MessageEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const picker = useRef<HTMLDetailsElement>(null);
  return <details ref={picker} className="msg-emoji-picker">
    <summary aria-label="Добавить эмодзи" title="Добавить эмодзи"><Smile size={19} aria-hidden="true" /></summary>
    <div className="msg-emoji-grid" role="group" aria-label="Эмодзи">
      {emojis.map(emoji => <button key={emoji} type="button" onClick={() => {
        if (picker.current) picker.current.open = false;
        onSelect(emoji);
      }}>{emoji}</button>)}
    </div>
  </details>;
}
