export function renderInlineFormatting(text) {
  const source = String(text || "");
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(source))) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      parts.push(<em key={key++}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

export function ParagraphText({ text, baseStyle }) {
  const paras = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!paras.length) return null;
  return (
    <>
      {paras.map((para, i) => {
        const lines = para.split("\n");
        return (
          <p key={i} style={baseStyle}>
            {lines.map((ln, j) => (
              <span key={j}>
                {renderInlineFormatting(ln)}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
