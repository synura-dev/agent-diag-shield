/**
 * Agent Diag Shield
 * Zero-Token Deterministic Error Diagnostic Engine & Prompt-Injection Firewall
 */

export interface SanitizationResult {
  cleanText: string;
  threats: string[];
  safe: boolean;
}

export interface ErrorDiagnostic {
  summary: string;
  location?: {
    file: string;
    line: number;
    col?: number;
  };
  rule: string;
  hint: string;
  tokenCost: 0;
}

/**
 * Module A: Prompt-Injection Firewall
 * Cleans stealth unicode/hidden HTML and detects jailbreak/prompt injection patterns.
 */
export function scanAndSanitizeInput(rawInput: string): SanitizationResult {
  const threats: string[] = [];
  let cleanText = rawInput;

  // 1. Invisible unicode & Zero-width characters & Bidirectional override
  const zeroWidthRegex = /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g;
  if (zeroWidthRegex.test(rawInput)) {
    threats.push("zero-width-character");
    cleanText = cleanText.replace(zeroWidthRegex, "");
  }

  // 2. Hidden HTML elements and styles
  const styleTagRegex = /<style[^>]*>.*?<\/style>/gis;
  const hiddenElementRegex = /<[^>]+style=["'][^"']*(?:display:\s*none|opacity:\s*0|font-size:\s*0|visibility:\s*hidden)[^"']*["'][^>]*>.*?<\/[^>]+>/gis;

  let hasHiddenHtml = false;
  if (styleTagRegex.test(cleanText)) {
    hasHiddenHtml = true;
    cleanText = cleanText.replace(styleTagRegex, "");
  }
  if (hiddenElementRegex.test(cleanText)) {
    hasHiddenHtml = true;
    cleanText = cleanText.replace(hiddenElementRegex, "");
  }
  if (hasHiddenHtml) {
    threats.push("hidden-html-element");
  }

  // 3. Prompt injection & jailbreak patterns
  const injectionPatterns: RegExp[] = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    /system\s+prompt\s+override/i,
    /disregard\s+all\s+(prior|previous)\s+rules/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /bypass\s+safety\s+guardrails/i
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(rawInput)) {
      threats.push("prompt-injection-pattern");
      break;
    }
  }

  return {
    cleanText,
    threats,
    safe: threats.length === 0
  };
}

/**
 * Module B: Zero-Token Deterministic Diagnostic Engine
 * Parses raw stack traces, identifies first relevant project file (supporting paths with spaces),
 * and maps to deterministic remediation hints.
 */
export function extractDeterministicDiagnostics(rawErrorOutput: string): ErrorDiagnostic {
  // 1. Strip ANSI escape codes
  const plainText = rawErrorOutput.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");

  // 2. Extract first project-relevant location (excluding node_modules / internal runtimes)
  const lines = plainText.split(/\r?\n/);
  let location: { file: string; line: number; col?: number } | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.includes("node_modules") ||
      trimmedLine.includes("node:internal") ||
      trimmedLine.includes("bun:internal")
    ) {
      continue;
    }

    // Stack traces typically format as:
    // - "    at Object.<anonymous> (E:\11. Agents\services\runner.ts:104:22)"
    // - "    at transformData (src/pipeline.ts:42:15)"
    // - "    at E:\11. Agents\services\runner.ts:104:22"
    // - "src/pipeline.ts:42:15"
    let target = trimmedLine;
    const parenMatch = trimmedLine.match(/\((.*?)\)$/);
    if (parenMatch) {
      target = parenMatch[1];
    } else if (target.startsWith("at ")) {
      target = target.slice(3).trim();
    }

    const locMatch = target.match(/^([a-zA-Z]:\\[^:\r\n]+|\/[^:\r\n]+|.+?):(\d+)(?::(\d+))?$/);
    if (locMatch) {
      const filePath = locMatch[1].trim();
      if (!filePath.startsWith("node:") && !filePath.startsWith("bun:")) {
        location = {
          file: filePath,
          line: parseInt(locMatch[2], 10),
          col: locMatch[3] ? parseInt(locMatch[3], 10) : undefined
        };
        break;
      }
    }
  }

  // 3. Extract summary line
  const firstNonEmptyLine = lines.find((l) => l.trim().length > 0) || "Unknown error";
  const summary = firstNonEmptyLine.trim();

  // 4. Deterministic Rule Matching
  let rule = "unclassified-runtime-error";
  let hint = "[HINT] Inspect stack trace at the referenced file location.";

  if (/(Cannot read property|is not a function|null|undefined|TypeError)/i.test(plainText)) {
    rule = "null-or-undefined-dereference";
    hint = "[HINT] Check optional chaining (?.) or ensure variable is initialized before access.";
  } else if (/(EACCES|permission denied|Access is denied)/i.test(plainText)) {
    rule = "permission-denied";
    hint = "[HINT] Process lacks filesystem or sandbox permissions. Verify folder integrity and ACL.";
  } else if (/(Cannot find module|Module not found|ERR_MODULE_NOT_FOUND)/i.test(plainText)) {
    rule = "module-not-found";
    hint = "[HINT] Missing dependency or incorrect import path. Run dependency install or verify file path.";
  } else if (/(SyntaxError|Unexpected token)/i.test(plainText)) {
    rule = "syntax-error";
    hint = "[HINT] Malformed code syntax. Verify closing brackets, quotes, or TypeScript types.";
  }

  return {
    summary,
    location,
    rule,
    hint,
    tokenCost: 0
  };
}
