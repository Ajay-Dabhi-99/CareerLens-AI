import { describe, expect, it } from 'vitest';
import {
  bulletDocFromTexts,
  paragraphDocFromText,
  textFromParagraphDoc,
  textsFromBulletDoc,
} from './richText';

describe('bullet documents', () => {
  it('round-trips plain bullets unchanged', () => {
    const texts = ['Led the migration', 'Cut costs by 35%'];
    expect(textsFromBulletDoc(bulletDocFromTexts(texts))).toEqual(texts);
  });

  it('never produces an empty text node, which ProseMirror rejects', () => {
    const doc = bulletDocFromTexts(['']);
    const paragraph = doc.content?.[0]?.content?.[0]?.content?.[0];

    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.content).toBeUndefined();
  });

  it('starts an empty section with one bullet to type into', () => {
    const list = bulletDocFromTexts([]).content?.[0];
    expect(list?.content).toHaveLength(1);
  });

  it('drops the blank bullet left behind by pressing Enter', () => {
    const doc = bulletDocFromTexts(['Real achievement', '', '   ']);
    expect(textsFromBulletDoc(doc)).toEqual(['Real achievement']);
  });

  it('strips formatting rather than storing it, because the ATS reads plain text', () => {
    const formatted = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Reduced latency by ' },
                    { type: 'text', marks: [{ type: 'bold' }], text: '83%' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(textsFromBulletDoc(formatted)).toEqual(['Reduced latency by 83%']);
  });

  it('returns nothing for an absent document instead of throwing', () => {
    expect(textsFromBulletDoc(undefined)).toEqual([]);
  });
});

describe('paragraph documents', () => {
  it('round-trips a single paragraph', () => {
    expect(textFromParagraphDoc(paragraphDocFromText('Staff engineer.'))).toBe('Staff engineer.');
  });

  it('keeps paragraph breaks as newlines', () => {
    const text = 'First paragraph.\nSecond paragraph.';
    expect(textFromParagraphDoc(paragraphDocFromText(text))).toBe(text);
  });

  it('handles empty text without producing an invalid document', () => {
    const doc = paragraphDocFromText('');
    expect(doc.content).toEqual([{ type: 'paragraph' }]);
    expect(textFromParagraphDoc(doc)).toBe('');
  });
});
