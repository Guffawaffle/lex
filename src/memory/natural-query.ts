/**
 * Natural Query Preprocessing
 *
 * Parses conversational queries and extracts semantic information like:
 * - Topic/keywords
 * - Time hints (last week, in November, recently)
 * - Module hints
 * - Question type
 */

export interface TimeRange {
  since?: Date;
  until?: Date;
  description: string; // "last week", "in November", etc.
}

export type QuestionType = "what" | "when" | "why" | "how" | "general";

export interface NaturalQuery {
  originalText: string;
  extractedTopic: string;
  timeHints: TimeRange | null;
  moduleHints: string[];
  questionType: QuestionType;
  isConversational: boolean;
}

/**
 * Detect if a query is conversational (natural language question vs keyword search)
 */
export function isConversationalQuery(text: string): boolean {
  const conversationalPatterns = [
    /^(lex,?\s*)?(what|when|why|how|where|who|which|can you|do you|did|does|should|would|could)/i,
    /\?$/,
    /\b(remember|tell me|show me|find|recall)\b/i,
  ];

  return conversationalPatterns.some((pattern) => pattern.test(text));
}

/**
 * Detect question type from query text
 */
export function detectQuestionType(text: string): QuestionType {
  const lowerText = text.toLowerCase();

  if (/^(lex,?\s*)?what\b/i.test(lowerText)) return "what";
  if (/^(lex,?\s*)?when\b/i.test(lowerText)) return "when";
  if (/^(lex,?\s*)?why\b/i.test(lowerText)) return "why";
  if (/^(lex,?\s*)?how\b/i.test(lowerText)) return "how";

  return "general";
}

/**
 * Extract time hints from query text
 */
export function extractTimeHints(text: string): TimeRange | null {
  const now = new Date();
  const lowerText = text.toLowerCase();

  // "last week"
  if (/\blast\s+week\b/i.test(lowerText)) {
    const since = new Date(now);
    since.setDate(now.getDate() - 7);
    return { since, description: "last week" };
  }

  // "last month"
  if (/\blast\s+month\b/i.test(lowerText)) {
    const since = new Date(now);
    since.setMonth(now.getMonth() - 1);
    return { since, description: "last month" };
  }

  // "recently" - last 7 days
  if (/\brecent(ly)?\b/i.test(lowerText)) {
    const since = new Date(now);
    since.setDate(now.getDate() - 7);
    return { since, description: "recently" };
  }

  // "today"
  if (/\btoday\b/i.test(lowerText)) {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { since, description: "today" };
  }

  // "this week"
  if (/\bthis\s+week\b/i.test(lowerText)) {
    const since = new Date(now);
    since.setDate(now.getDate() - now.getDay()); // Start of week
    since.setHours(0, 0, 0, 0);
    return { since, description: "this week" };
  }

  // Month names (e.g., "in November", "during December")
  const MONTH_NAMES = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthPattern = new RegExp(`\\b(in|during|from)?\\s*(${MONTH_NAMES.join("|")})\\b`, "i");
  const monthMatch = lowerText.match(monthPattern);

  if (monthMatch) {
    const monthName = monthMatch[2];
    const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase());

    const year = now.getFullYear();
    const since = new Date(year, monthIndex, 1);
    const until = new Date(year, monthIndex + 1, 0, 23, 59, 59);

    return {
      since,
      until,
      description: monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + year,
    };
  }

  return null;
}

/**
 * Extract module hints from query text
 * Simple keyword matching for common module-related terms
 */
export function extractModuleHints(text: string): string[] {
  const hints: string[] = [];

  // Common module patterns (case-insensitive)
  const modulePatterns = [
    /\bui\/[\w-]+/gi,
    /\bapi\/[\w-]+/gi,
    /\bauth(entication)?/gi,
    /\blogin/gi,
    /\buser/gi,
    /\badmin/gi,
    /\bdashboard/gi,
  ];

  for (const pattern of modulePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      hints.push(...matches.map((m) => m.toLowerCase()));
    }
  }

  return [...new Set(hints)]; // Remove duplicates
}

/**
 * Clean and extract topic from conversational query
 */
export function cleanQuery(text: string): string {
  // Remove conversational prefixes
  let cleaned = text
    .replace(/^(lex,?\s*)?(what do you |do you |can you |tell me |show me )?/i, "")
    .replace(/^(remember|recall)\s+/i, "")
    .replace(/\?$/, "")
    .trim();

  // Remove "about" prefix
  cleaned = cleaned.replace(/^about\s+/i, "");

  return cleaned;
}

/**
 * Parse natural language query into structured information
 */
export function parseNaturalQuery(text: string): NaturalQuery {
  const isConversational = isConversationalQuery(text);
  const questionType = detectQuestionType(text);
  const timeHints = extractTimeHints(text);
  const cleaned = cleanQuery(text);
  const moduleHints = extractModuleHints(text);

  return {
    originalText: text,
    extractedTopic: cleaned,
    timeHints,
    moduleHints,
    questionType,
    isConversational,
  };
}
