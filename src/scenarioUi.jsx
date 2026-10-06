import { VERDICT_CODES } from "../shared/scenarioSchema.mjs";
import { renderInlineFormatting, ParagraphText } from "./richText.jsx";
import { styles } from "./styles.js";

export const VERDICT_ORDER = ["to_be_rejected", "grey_area", "acceptable"];

export const VERDICT_COLORS = {
  to_be_rejected: "#e74c3c",
  grey_area: "#e67e22",
  acceptable: "#1abc9c",
};

export function truncateAtWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export function verdictBadgeStyle(code) {
  const color = VERDICT_COLORS[code] || VERDICT_COLORS.grey_area;
  return { color, borderColor: color };
}

export function VerdictBadge({ code, t }) {
  if (!VERDICT_CODES.includes(code)) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "0.15rem 0.5rem",
        borderRadius: 6,
        border: "1px solid",
        ...verdictBadgeStyle(code),
      }}
    >
      {t(`verdict.${code}`)}
    </span>
  );
}

export function parseSolutionBlocks(solution) {
  const text = String(solution || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const NUM_RE = /^\s*(\d+)\.\s*(.+)$/;
  const blocks = [];
  let paraBuf = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    const joined = paraBuf.join("\n").trim();
    if (joined) blocks.push({ type: "para", text: joined, key: `p-${blocks.length}` });
    paraBuf = [];
  };

  const pushSteps = (steps) => {
    if (steps.length < 2) {
      for (const s of steps) paraBuf.push(`${s.num}. ${s.text}`);
      return;
    }
    flushPara();
    blocks.push({ type: "steps", steps, key: `s-${blocks.length}` });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      flushPara();
      i += 1;
      continue;
    }
    const m = line.match(NUM_RE);
    if (m) {
      const run = [];
      while (i < lines.length) {
        if (lines[i].trim() === "") {
          if (i + 1 < lines.length && NUM_RE.test(lines[i + 1])) {
            i += 1;
            continue;
          }
          break;
        }
        const nm = lines[i].match(NUM_RE);
        if (!nm) break;
        run.push({
          key: `${i}-${nm[2].slice(0, 24)}`,
          num: nm[1],
          text: nm[2].trim(),
        });
        i += 1;
      }
      pushSteps(run);
      continue;
    }
    paraBuf.push(line);
    i += 1;
  }
  flushPara();
  return blocks;
}

export function parseParagraphBlocks(solution) {
  const text = String(solution || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ type: "para", text: p, key: `p-${i}` }));
}

export function prefixBlockKeys(blocks, prefix) {
  return blocks.map((b) =>
    b.type === "steps"
      ? {
          ...b,
          key: `${prefix}${b.key}`,
          steps: b.steps.map((s) => ({ ...s, key: `${prefix}${s.key}` })),
        }
      : { ...b, key: `${prefix}${b.key}` }
  );
}

export function totalStepCount(blocks) {
  return blocks.reduce((n, b) => n + (b.type === "steps" ? b.steps.length : 0), 0);
}

export function SolutionBlockList({ blocks, checked, onToggle, markLabel }) {
  return blocks.map((block) =>
    block.type === "steps" ? (
      <ol key={block.key} style={styles.stepList}>
        {block.steps.map((step) => {
          const isChecked = !!checked[step.key];
          return (
            <li key={step.key} style={styles.stepItem}>
              <label
                className="no-print"
                style={{ display: "flex", alignItems: "center", marginRight: "0.25rem" }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  aria-label={markLabel}
                  onChange={(e) => onToggle(step.key, e.target.checked)}
                />
              </label>
              <span
                style={{
                  ...styles.stepNum,
                  opacity: isChecked ? 0.55 : 1,
                }}
              >
                {step.num}
              </span>
              <span
                style={{
                  ...styles.stepText,
                  textDecoration: isChecked ? "line-through" : "none",
                  opacity: isChecked ? 0.65 : 1,
                }}
              >
                {renderInlineFormatting(step.text)}
              </span>
            </li>
          );
        })}
      </ol>
    ) : (
      <ParagraphText key={block.key} text={block.text} baseStyle={styles.detailBody} />
    )
  );
}
