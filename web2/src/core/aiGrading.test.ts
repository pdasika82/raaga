import { describe, expect, it, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
import { overallAIGrade, parseAIGrade, requestAIGrade, RUBRICS } from './aiGrading';

const response = (art: 'raaga' | 'kuchipudi') => ({ summary: 'A measured practice review.', criteria: RUBRICS[art].map(name => ({ name, score: 80, evidence: 'Evidence at the marked point.', timestamps: [1] })), strengths: ['A steady position.'], improvements: ['Repeat the phrase.'], limitations: ['Limited evidence.'] });
describe('AI recording reviews', () => {
  it('validates the rubric and abstains from an overall grade when any criterion lacks evidence', () => {
    const data = response('kuchipudi');
    expect(overallAIGrade(parseAIGrade(JSON.stringify(data), 'kuchipudi', 2, 'test'))).toBe(80);
    const partial = { ...data, criteria: data.criteria.map((item, i) => ({ ...item, score: i === 0 ? null : 80 })) };
    expect(overallAIGrade(parseAIGrade(JSON.stringify(partial), 'kuchipudi', 2, 'test'))).toBeNull();
    for (const invalid of [
      { ...data, criteria: [] },
      { ...data, criteria: data.criteria.map(item => ({ ...item, score: 120 })) },
      { ...data, criteria: data.criteria.map(item => ({ ...item, timestamps: [5] })) },
      { ...data, criteria: data.criteria.map(item => ({ ...item, name: 'invented criterion' })) },
    ]) expect(() => parseAIGrade(JSON.stringify(invalid), 'kuchipudi', 2, 'test')).toThrow();
  });

  it('sends actual image evidence and uses the API reply rather than manufacturing a grade', async () => {
    create.mockResolvedValue({ model: 'test-model', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(response('kuchipudi')) }] });
    const signal = new AbortController().signal;
    const report = await requestAIGrade('test-key', { art: 'kuchipudi', lesson: 'Alignment', instructions: 'Observe stance', teacherNote: '', duration: 2 }, null, [{ seconds: 1, jpeg: 'fixture-image' }], signal);
    expect(report.model).toBe('test-model');
    expect(create.mock.calls.at(-1)![0].messages[0].content).toContainEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'fixture-image' } });
    expect(create.mock.calls.at(-1)![1].signal).toBe(signal);
    create.mockResolvedValue({ stop_reason: 'max_tokens', content: [] });
    await expect(requestAIGrade('test-key', { art: 'raaga', lesson: 'Sa', instructions: '', teacherNote: '', duration: 2 }, {}, [], signal)).rejects.toThrow('could not complete');
  });
});
