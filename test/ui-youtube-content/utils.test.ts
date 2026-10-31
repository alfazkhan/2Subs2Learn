import { createUnifiedCues } from '../../entrypoints/ui-youtube.content/index';

describe('createUnifiedCues', () => {
  const source = [
    { start: 0, duration: 5, text: 'Original text' },
    { start: 10, duration: 3, text: 'Second line' }
  ];

  const target = [
    { start: 0, duration: 4, text: 'Trad. texte' },
    { start: 8, duration: 2, text: 'Deuxième ligne' }
  ];

  it('merges overlapping cues correctly', () => {
    const unified = createUnifiedCues(source, target);
    expect(unified).toHaveLength(2);
    const [firstCue, secondCue] = unified;
    expect(firstCue).toBeDefined();
    expect(secondCue).toBeDefined();
    expect(firstCue!.sourceText).toBe('Original text');
    expect(secondCue!.targetText).toBe('Deuxième ligne');
  });

  it('handles source-only cues', () => {
    const sourceOnly = [{ start: 0, duration: 3, text: 'Only source' }];
    const targetOnly: { start: number; duration: number; text: string }[] = [];
    const unified = createUnifiedCues(sourceOnly, targetOnly);
    expect(unified).toHaveLength(1);
    const [cue] = unified;
    expect(cue).toBeDefined();
    expect(cue!.targetText).toBe('');
  });

  it('handles target-only cues', () => {
    const sourceOnly: { start: number; duration: number; text: string }[] = [];
    const targetOnly = [{ start: 0, duration: 3, text: 'Only target' }];
    const unified = createUnifiedCues(sourceOnly, targetOnly);
    expect(unified).toHaveLength(1);
    const [cue] = unified;
    expect(cue).toBeDefined();
    expect(cue!.sourceText).toBe('');
  });

  it('handles empty arrays', () => {
    const unified = createUnifiedCues([], []);
    expect(unified).toHaveLength(0);
  });
});