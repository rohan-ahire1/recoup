import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Claude is mocked: each test queues the JSON it should "write".
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { classifyReply, kindFromChoice, REPLY_CONFIDENCE_THRESHOLD } = await import('../lib/ai');

const claudeSays = (obj: unknown) => create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const jevSays = (choice: string, confidence: number) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ model: 'jev-latest', answers: { kind: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } } } }), { status: 200 })),
  );

beforeEach(() => {
  create.mockReset();
  process.env.TYPESAFE_API_KEY = 'test-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TYPESAFE_API_KEY;
});

describe('kindFromChoice', () => {
  it('keeps confident answers and sends unsure or unknown ones to the owner', () => {
    expect(kindFromChoice({ type: 'choice', choice: 'paid', confidence: 0.97, probabilities: {} })).toEqual({ kind: 'paid', unsure: false });
    expect(kindFromChoice({ type: 'choice', choice: 'paid', confidence: REPLY_CONFIDENCE_THRESHOLD - 0.01, probabilities: {} })).toEqual({ kind: 'other', unsure: true });
    expect(kindFromChoice({ type: 'choice', choice: 'refund', confidence: 0.99, probabilities: {} })).toEqual({ kind: 'other', unsure: true });
  });
});

describe('classifyReply', () => {
  it('uses Jev for the kind and Claude only for the date and summary', async () => {
    jevSays('promise', 0.95);
    claudeSays({ promise_date: '2026-09-04', summary: 'Will pay Friday.' });
    const read = await classifyReply('I will pay on Friday', '2026-09-01');
    expect(read).toEqual({ kind: 'promise', promiseDate: '2026-09-04', summary: 'Will pay Friday.' });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('jev-latest');
    expect(body.questions.kind.type).toBe('choice');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].output_config.format.schema.required).toEqual(['promise_date', 'summary']);
  });

  it('skips Claude entirely for a plan request', async () => {
    jevSays('plan', 0.9);
    const read = await classifyReply('Can I split this into two payments?', '2026-09-01');
    expect(read.kind).toBe('plan');
    expect(create).not.toHaveBeenCalled();
  });

  it('turns a low-confidence read into "other" for the owner to check', async () => {
    jevSays('promise', 0.5);
    claudeSays({ promise_date: '2026-09-04', summary: 'Might pay soon.' });
    const read = await classifyReply('maybe soon', '2026-09-01');
    expect(read.kind).toBe('other');
    expect(read.promiseDate).toBeNull();
    expect(read.summary).toContain('please check');
  });

  it('falls back to the full Claude read when Jev errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    claudeSays({ kind: 'dispute', promise_date: null, summary: 'Says the amount is wrong.' });
    const read = await classifyReply('That amount is wrong', '2026-09-01');
    expect(read).toEqual({ kind: 'dispute', promiseDate: null, summary: 'Says the amount is wrong.' });
    expect(create.mock.calls[0][0].output_config.format.schema.required).toContain('kind');
  });

  it('uses Claude alone when TYPESAFE_API_KEY is missing', async () => {
    delete process.env.TYPESAFE_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    claudeSays({ kind: 'paid', promise_date: null, summary: 'Says they paid by check.' });
    expect((await classifyReply('Sent a check', '2026-09-01')).kind).toBe('paid');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].model).toBe('claude-sonnet-5-5');
  });
});
