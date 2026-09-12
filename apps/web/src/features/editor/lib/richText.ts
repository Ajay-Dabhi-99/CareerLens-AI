import type { JSONContent } from '@tiptap/react';

/**
 * The bridge between the rich-text editor and what we actually store.
 *
 * A resume is plain text as far as everything downstream is concerned: the ATS
 * engine reads strings, the AI prompt sends strings, and an exported PDF gets
 * its styling from the template, not from bold tags a user left in a bullet.
 * Rich formatting inside resume content is an ATS liability, so TipTap is the
 * editing surface and plain text stays the truth.
 *
 * These are pure functions over ProseMirror JSON so they can be tested without
 * a DOM or a live editor.
 */

/** Collects text from a node tree, ignoring marks entirely. */
function textOf(node: JSONContent | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join('');
}

/** A bullet list document from plain strings, one list item per string. */
export function bulletDocFromTexts(texts: string[]): JSONContent {
  const items = texts.map((text) => ({
    type: 'listItem',
    content: [
      // An empty paragraph must still have no `content` key at all; an empty
      // text node is invalid ProseMirror and throws on setContent.
      text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
    ],
  }));

  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        // A bullet list with no items is invalid, so an empty resume section
        // starts with one empty bullet for the user to type into.
        content: items.length > 0 ? items : [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
    ],
  };
}

/**
 * Plain strings back out of a bullet list document.
 *
 * Blank items are dropped: a trailing empty bullet is an artefact of pressing
 * Enter, not a line the user wants on their resume.
 */
export function textsFromBulletDoc(doc: JSONContent | undefined): string[] {
  if (!doc) return [];

  const lists = (doc.content ?? []).filter((node) => node.type === 'bulletList');
  const items = lists.flatMap((list) => list.content ?? []);

  return items
    .map((item) => textOf(item).trim())
    .filter((text) => text.length > 0);
}

/** A single-paragraph document from plain text, for fields like the summary. */
export function paragraphDocFromText(text: string): JSONContent {
  const paragraphs = text.split(/\n+/).filter((line) => line.trim().length > 0);

  return {
    type: 'doc',
    content:
      paragraphs.length > 0
        ? paragraphs.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
        : [{ type: 'paragraph' }],
  };
}

/** Plain text back out, with paragraph breaks preserved as newlines. */
export function textFromParagraphDoc(doc: JSONContent | undefined): string {
  if (!doc) return '';

  return (doc.content ?? [])
    .map((node) => textOf(node).trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
