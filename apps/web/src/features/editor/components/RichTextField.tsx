import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '@/lib/utils';
import {
  bulletDocFromTexts,
  paragraphDocFromText,
  textFromParagraphDoc,
  textsFromBulletDoc,
} from '@/features/editor/lib/richText';

/**
 * StarterKit minus everything a resume should not contain.
 *
 * Headings, blockquotes, code blocks and horizontal rules are structure the
 * template owns, not the content. Leaving them enabled would let a user build
 * layout inside a field and then lose it at export, which is worse than never
 * offering it. History stays on: undo/redo is the point.
 */
const RESUME_STARTER_KIT = {
  heading: false as const,
  blockquote: false as const,
  codeBlock: false as const,
  code: false as const,
  horizontalRule: false as const,
  strike: false as const,
};

export function RichTextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ ...RESUME_STARTER_KIT, bulletList: false, orderedList: false, listItem: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: paragraphDocFromText(value),
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'outline-none min-h-[4.5rem]',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(textFromParagraphDoc(instance.getJSON()));
    },
  });

  /*
   * Only reset the document when the incoming value genuinely differs from what
   * is on screen. Without this guard, every keystroke round-trips through the
   * parent, resets the content and puts the caret back at the start.
   */
  useEffect(() => {
    if (!editor) return;
    if (textFromParagraphDoc(editor.getJSON()) === value) return;
    editor.commands.setContent(paragraphDocFromText(value), false);
  }, [editor, value]);

  return (
    <div
      className={cn(
        'rounded-lg border border-input bg-background px-3 py-2 text-sm',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * A bullet list bound to plain strings.
 *
 * Kept in this file because it shares the restricted schema above: the two
 * editing surfaces on a resume should not drift apart in what they allow.
 */
export function BulletListField({
  bullets,
  onChange,
  ariaLabel,
  placeholder,
}: {
  bullets: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure(RESUME_STARTER_KIT),
      Placeholder.configure({ placeholder: placeholder ?? 'Describe what you did and what changed' }),
    ],
    content: bulletDocFromTexts(bullets),
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(textsFromBulletDoc(instance.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = textsFromBulletDoc(editor.getJSON());
    if (current.length === bullets.length && current.every((text, i) => text === bullets[i])) return;
    editor.commands.setContent(bulletDocFromTexts(bullets), false);
  }, [editor, bullets]);

  return (
    <div className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
      <EditorContent editor={editor} />
    </div>
  );
}
