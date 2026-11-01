export interface PracticeGrade {
  score: number;
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
}

export const GRADE_SCALE = 'A: 90–100 · B: 80–89 · C: 70–79 · D: 60–69 · E: below 60';

/** App practice bands, not a teacher's certification or a syllabus level. */
export function practiceGrade(value: number | null): PracticeGrade | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const score = Math.round(value);
  const [letter, label] = score >= 90 ? ['A', 'Strong practice'] as const
    : score >= 80 ? ['B', 'Good progress'] as const
    : score >= 70 ? ['C', 'Developing'] as const
    : score >= 60 ? ['D', 'Keep building'] as const
    : ['E', 'Focus and repeat'] as const;
  return { score, letter, label };
}
