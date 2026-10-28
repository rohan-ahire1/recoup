/**
 * Minimal client for TypeSafe's Jev "System One" API (plain REST, no SDK).
 * One call takes a text `state` plus typed questions and returns bounded answers.
 * Docs: https://docs.typesafe.ai/introduction/quickstart
 */

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Option label -> what it means. */
  criteria: Record<string, string>;
}

export type JevQuestion = NoulQuestion | ChoiceQuestion;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export type JevAnswer = NoulAnswer | ChoiceAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
}

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const TIMEOUT_MS = 10_000;

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

export async function askJev(state: string, questions: Record<string, JevQuestion>, opts: { apiKey?: string; model?: string; signal?: AbortSignal } = {}): Promise<JevResponse> {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: opts.model ?? MODEL, questions }),
    signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jev API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as JevResponse;
}

export function asChoice(answer: JevAnswer | undefined, name: string): ChoiceAnswer {
  if (!answer || answer.type !== 'choice' || typeof answer.choice !== 'string') throw new Error(`Jev answer "${name}" is not a choice answer`);
  return answer;
}

export function asNoul(answer: JevAnswer | undefined, name: string): number {
  if (!answer || answer.type !== 'noul' || typeof answer.noul !== 'number') throw new Error(`Jev answer "${name}" is not a noul answer`);
  return answer.noul;
}
