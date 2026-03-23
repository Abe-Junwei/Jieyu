import { describe, it, expect } from 'vitest';
import { parseTextGrid } from './WebMaService';

describe('WebMaService', () => {
  describe('parseTextGrid', () => {
    it('parses word-level intervals from a standard MAUS TextGrid', () => {
      const textGrid = `
FileType = "ooTextFile"
ObjectClass = "TextGrid"
xmin = 0
xmax = 5.234
tiers? = <exists>
size = 2
item [1]:
    class = "IntervalTier"
    name = "ORT-MAU"
    xmin = 0
    xmax = 5.234
    intervals: size = 4
    intervals [1]:
        xmin = 0
        xmax = 1.2
        text = "hello"
    intervals [2]:
        xmin = 1.2
        xmax = 2.5
        text = "world"
    intervals [3]:
        xmin = 2.5
        xmax = 3.8
        text = "<#>"
    intervals [4]:
        xmin = 3.8
        xmax = 5.234
        text = "<SP>"
item [2]:
    class = "IntervalTier"
    name = "MAU"
    xmin = 0
    xmax = 5.234
    intervals: size = 5
    intervals [1]:
        xmin = 0
        xmax = 0.5
        text = "h"
    intervals [2]:
        xmin = 0.5
        xmax = 0.9
        text = "ɛ"
    intervals [3]:
        xmin = 0.9
        xmax = 1.2
        text = "l"
    intervals [4]:
        xmin = 1.2
        xmax = 2.5
        text = "w"
    intervals [5]:
        xmin = 2.5
        xmax = 3.8
        text = "<#>"
`;
      const { words, phonemes } = parseTextGrid(textGrid);

      expect(words).toHaveLength(2);
      expect(words[0]).toEqual({ text: 'hello', startTime: 0, endTime: 1.2 });
      expect(words[1]).toEqual({ text: 'world', startTime: 1.2, endTime: 2.5 });

      // MAU tier is phonemes
      expect(phonemes).toHaveLength(4);
      expect(phonemes[0]).toEqual({ text: 'h', startTime: 0, endTime: 0.5 });
    });

    it('ignores placeholder markers <#> and <SP>', () => {
      const textGrid = `
FileType = "ooTextFile"
ObjectClass = "TextGrid"
xmin = 0
xmax = 3
tiers? = <exists>
size = 1
item [1]:
    class = "IntervalTier"
    name = "words"
    xmin = 0
    xmax = 3
    intervals: size = 3
    intervals [1]:
        xmin = 0
        xmax = 1
        text = "<#>"
    intervals [2]:
        xmin = 1
        xmax = 2
        text = "real"
    intervals [3]:
        xmin = 2
        xmax = 3
        text = "<SP>"
`;
      const { words } = parseTextGrid(textGrid);
      expect(words).toHaveLength(1);
      expect(words[0]!.text).toBe('real');
    });

    it('handles Chinese text in transcription tier', () => {
      const textGrid = `
FileType = "ooTextFile"
ObjectClass = "TextGrid"
xmin = 0
xmax = 4
tiers? = <exists>
size = 1
item [1]:
    class = "IntervalTier"
    name = "ORT-MAU"
    xmin = 0
    xmax = 4
    intervals: size = 2
    intervals [1]:
        xmin = 0
        xmax = 2.3
        text = "你好"
    intervals [2]:
        xmin = 2.3
        xmax = 4
        text = "世界"
`;
      const { words } = parseTextGrid(textGrid);
      expect(words).toHaveLength(2);
      expect(words[0]).toEqual({ text: '你好', startTime: 0, endTime: 2.3 });
      expect(words[1]).toEqual({ text: '世界', startTime: 2.3, endTime: 4 });
    });

    it('returns empty arrays for empty/invalid TextGrid', () => {
      const { words, phonemes } = parseTextGrid('not a textgrid');
      expect(words).toHaveLength(0);
      expect(phonemes).toHaveLength(0);
    });

    it('handles phoneme tier with KALT name', () => {
      const textGrid = `
FileType = "ooTextFile"
ObjectClass = "TextGrid"
xmin = 0
xmax = 1
tiers? = <exists>
size = 1
item [1]:
    class = "IntervalTier"
    name = "KALT"
    xmin = 0
    xmax = 1
    intervals: size = 2
    intervals [1]:
        xmin = 0
        xmax = 0.5
        text = "a"
    intervals [2]:
        xmin = 0.5
        xmax = 1
        text = "b"
`;
      const { phonemes } = parseTextGrid(textGrid);
      expect(phonemes).toHaveLength(2);
      expect(phonemes[0]!.text).toBe('a');
    });
  });
});
