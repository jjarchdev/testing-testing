const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "sub", "sup", "small", "mark",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "col", "colgroup",
  "dl", "dt", "dd",
  "section", "article", "header", "footer", "nav",
  "time", "abbr",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "col"]);

const ALLOWED_ATTRS = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "alt", "title", "width", "height"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  time: new Set(["datetime"]),
  abbr: new Set(["title"]),
};

const GLOBAL_ATTRS = new Set(["id", "class", "title", "lang", "dir"]);

const SAFE_URL_RE = /^(https?:|mailto:|\/|#)/i;

function escapeText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = String(url).trim();
  if (!trimmed) return false;
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false;
  return SAFE_URL_RE.test(trimmed);
}

function renderAttrs(tag, attrs) {
  const parts = [];
  for (const [name, valueRaw] of Object.entries(attrs)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || lower === "style") continue;
    const perTag = ALLOWED_ATTRS[tag];
    const allowed = GLOBAL_ATTRS.has(lower) || (perTag && perTag.has(lower));
    if (!allowed) continue;
    let value = String(valueRaw ?? "");
    if (lower === "href" || lower === "src") {
      if (!isSafeUrl(value)) continue;
    }
    if (lower === "target") {
      value = "_blank";
    }
    parts.push(`${lower}="${escapeText(value)}"`);
  }
  if (tag === "a" && !("rel" in Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), v])))) {
    parts.push('rel="noopener noreferrer nofollow"');
  }
  if (tag === "a" && attrs.href && /^https?:/i.test(String(attrs.href)) && !attrs.target) {
    parts.push('target="_blank"');
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function* tokenize(html) {
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      yield { type: "text", value: html.slice(i) };
      return;
    }
    if (lt > i) yield { type: "text", value: html.slice(i, lt) };
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const end = html.indexOf(">", lt);
    if (end < 0) {
      yield { type: "text", value: html.slice(lt) };
      return;
    }
    const raw = html.slice(lt + 1, end).trim();
    i = end + 1;
    if (!raw) continue;
    if (raw.startsWith("/")) {
      yield { type: "close", name: raw.slice(1).split(/\s/)[0].toLowerCase() };
      continue;
    }
    const spaceIdx = raw.search(/\s/);
    const nameRaw = spaceIdx < 0 ? raw : raw.slice(0, spaceIdx);
    const attrStr = spaceIdx < 0 ? "" : raw.slice(spaceIdx + 1);
    const selfClose = attrStr.endsWith("/") || VOID_TAGS.has(nameRaw.toLowerCase());
    const attrs = parseAttrs(selfClose ? attrStr.replace(/\/\s*$/, "") : attrStr);
    yield { type: "open", name: nameRaw.toLowerCase(), attrs, selfClose };
  }
}

function parseAttrs(s) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    out[key] = val;
  }
  return out;
}

export function sanitizeHtml(input) {
  if (typeof input !== "string" || !input) return "";
  const out = [];
  const stack = [];
  const dropStack = [];
  let scriptDepth = 0;

  for (const tok of tokenize(input)) {
    if (tok.type === "text") {
      if (scriptDepth > 0) continue;
      out.push(escapeText(tok.value));
      continue;
    }
    if (tok.type === "open") {
      if (tok.name === "script" || tok.name === "style") {
        scriptDepth += 1;
        continue;
      }
      if (!ALLOWED_TAGS.has(tok.name)) {
        dropStack.push(tok.name);
        continue;
      }
      const attrStr = renderAttrs(tok.name, tok.attrs);
      if (tok.selfClose || VOID_TAGS.has(tok.name)) {
        out.push(`<${tok.name}${attrStr}>`);
      } else {
        out.push(`<${tok.name}${attrStr}>`);
        stack.push(tok.name);
      }
      continue;
    }
    if (tok.type === "close") {
      if (tok.name === "script" || tok.name === "style") {
        if (scriptDepth > 0) scriptDepth -= 1;
        continue;
      }
      if (!ALLOWED_TAGS.has(tok.name)) {
        const idx = dropStack.lastIndexOf(tok.name);
        if (idx >= 0) dropStack.splice(idx, 1);
        continue;
      }
      const idx = stack.lastIndexOf(tok.name);
      if (idx < 0) continue;
      while (stack.length > idx) {
        const t = stack.pop();
        out.push(`</${t}>`);
      }
    }
  }
  while (stack.length) {
    out.push(`</${stack.pop()}>`);
  }
  return out.join("");
}
