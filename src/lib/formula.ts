/**
 * Tiny, safe formula evaluator: numbers, {Field Name} references, + - * / ( ) and
 * MIN/MAX/AVG/ROUND/IF. No eval, no access to globals. Returns null on missing inputs.
 */
type Tok = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "op"; v: string } | { t: "fn"; v: string } | { t: "(" } | { t: ")" } | { t: "," };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new Error("Unclosed {");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^\d*\.?\d+/)!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z]+/)!;
      const name = m[0].toUpperCase();
      if (!["MIN", "MAX", "AVG", "ROUND", "IF"].includes(name)) throw new Error(`Unknown function ${m[0]}`);
      out.push({ t: "fn", v: name });
      i += m[0].length;
      continue;
    }
    if ("+-*/><=".includes(c)) {
      const two = src.slice(i, i + 2);
      if ([">=", "<="].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") { out.push({ t: "(" }); i++; continue; }
    if (c === ")") { out.push({ t: ")" }); i++; continue; }
    if (c === ",") { out.push({ t: "," }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

export function evaluateFormula(src: string, resolve: (ref: string) => number | null): number | null {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  function primary(): number | null {
    const t = toks[p++];
    if (!t) throw new Error("Unexpected end");
    if (t.t === "num") return t.v;
    if (t.t === "ref") return resolve(t.v);
    if (t.t === "op" && t.v === "-") { const v = primary(); return v == null ? null : -v; }
    if (t.t === "(") { const v = comparison(); if (toks[p++]?.t !== ")") throw new Error("Missing )"); return v; }
    if (t.t === "fn") {
      if (toks[p++]?.t !== "(") throw new Error("Missing (");
      const args: (number | null)[] = [];
      if (peek()?.t !== ")") {
        args.push(comparison());
        while (peek()?.t === ",") { p++; args.push(comparison()); }
      }
      if (toks[p++]?.t !== ")") throw new Error("Missing )");
      if (t.v === "IF") return args[0] == null ? null : args[0] ? args[1] ?? null : args[2] ?? null;
      if (args.some((a) => a == null)) return null;
      const nums = args as number[];
      if (t.v === "MIN") return Math.min(...nums);
      if (t.v === "MAX") return Math.max(...nums);
      if (t.v === "AVG") return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (t.v === "ROUND") return Math.round(nums[0] * 10 ** (nums[1] ?? 0)) / 10 ** (nums[1] ?? 0);
    }
    throw new Error("Unexpected token");
  }
  function term(): number | null {
    let v = primary();
    while (peek()?.t === "op" && ["*", "/"].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      const r = primary();
      v = v == null || r == null ? null : op === "*" ? v * r : r === 0 ? null : v / r;
    }
    return v;
  }
  function expr(): number | null {
    let v = term();
    while (peek()?.t === "op" && ["+", "-"].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = v == null || r == null ? null : op === "+" ? v + r : v - r;
    }
    return v;
  }
  function comparison(): number | null {
    let v = expr();
    while (peek()?.t === "op" && [">", "<", ">=", "<=", "="].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      const r = expr();
      if (v == null || r == null) v = null;
      else v = (op === ">" ? v > r : op === "<" ? v < r : op === ">=" ? v >= r : op === "<=" ? v <= r : v === r) ? 1 : 0;
    }
    return v;
  }
  const v = comparison();
  if (p !== toks.length) throw new Error("Unexpected trailing input");
  return v;
}

export function formulaRefs(src: string) {
  return Array.from(src.matchAll(/\{([^}]+)\}/g)).map((m) => m[1].trim());
}
