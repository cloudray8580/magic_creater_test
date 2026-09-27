import { useEffect, useState } from 'react';
export function NumberInput({
  value,
  onCommit,
  min,
  max,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() && Number(text) !== value) onCommit(Number(text));
        setText(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
export function TextInput({
  value,
  onCommit,
  maxLength,
  multiline = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const props = {
    value: text,
    maxLength,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setText(e.target.value),
    onBlur: () => {
      if (text !== value) onCommit(text);
      setText(value);
    },
  };
  return multiline ? (
    <textarea {...props} />
  ) : (
    <input
      {...props}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
