import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
  TextRun,
} from 'docx';
import type { Resume, TemplateId, TemplateSection } from '@career-lens-ai/types';
import {
  formatDateRange,
  sectionHasContent,
  TEMPLATE_SECTION_ORDER,
  TEMPLATE_SKILLS_LAYOUT,
} from '@career-lens-ai/types';

/**
 * Builds a Word document from structured resume data.
 *
 * Generated from the data rather than from a screenshot of the preview, as the
 * spec requires: a DOCX made of images is uneditable, unsearchable, and read by
 * a filter as a blank page. Every word here is real text a recruiter can edit
 * and a parser can read.
 *
 * Section order, skills layout, the empty-section rule and date formatting all
 * come from the shared template definitions the web preview uses, so the file
 * a user downloads matches the page they approved. Only the look — font, sizes,
 * heading treatment — is decided here, because Word and CSS express it
 * differently.
 */

interface DocxLook {
  font: string;
  /** Half-points, as Word measures type. */
  nameSize: number;
  headingSize: number;
  bodySize: number;
  headingColor: string;
  rule: boolean;
  centerHeader: boolean;
}

const LOOKS: Record<TemplateId, DocxLook> = {
  modern: { font: 'Calibri', nameSize: 40, headingSize: 22, bodySize: 21, headingColor: '0F766E', rule: true, centerHeader: false },
  minimal: { font: 'Calibri', nameSize: 34, headingSize: 19, bodySize: 20, headingColor: '737373', rule: false, centerHeader: false },
  professional: { font: 'Georgia', nameSize: 40, headingSize: 22, bodySize: 21, headingColor: '171717', rule: true, centerHeader: true },
  technical: { font: 'Calibri', nameSize: 36, headingSize: 21, bodySize: 21, headingColor: '0F766E', rule: false, centerHeader: false },
  executive: { font: 'Georgia', nameSize: 46, headingSize: 24, bodySize: 22, headingColor: '171717', rule: true, centerHeader: false },
};

const TITLES: Record<TemplateSection, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  certifications: 'Certifications',
};

/** A4 in twentieths of a point, with the same 18mm margins as the preview. */
const PAGE = { width: 11906, height: 16838, margin: 1021 };

const BULLETS = 'resume-bullets';
const MUTED = '525252';

function run(text: string, look: DocxLook, extra: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text,
    font: look.font,
    size: extra.size ?? look.bodySize,
    bold: extra.bold,
    color: extra.color,
  });
}

function heading(section: TemplateSection, look: DocxLook): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 240, after: 80 },
    border: look.rule
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: look.headingColor, space: 2 } }
      : undefined,
    children: [
      run(TITLES[section].toUpperCase(), look, {
        bold: true,
        color: look.headingColor,
        size: look.headingSize,
      }),
    ],
  });
}

/** A line with its content on the left and a date or link pinned to the right margin. */
function entryLine(left: TextRun[], right: string | undefined, look: DocxLook): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 100 },
    children: [
      ...left,
      ...(right
        ? [
            new TextRun({
              font: look.font,
              size: look.bodySize,
              color: MUTED,
              children: [
                new PositionalTab({
                  alignment: PositionalTabAlignment.RIGHT,
                  relativeTo: PositionalTabRelativeTo.MARGIN,
                  leader: PositionalTabLeader.NONE,
                }),
                right,
              ],
            }),
          ]
        : []),
    ],
  });
}

function bullet(text: string, look: DocxLook): Paragraph {
  return new Paragraph({ numbering: { reference: BULLETS, level: 0 }, children: [run(text, look)] });
}

function printable<T extends { text: string }>(items: T[]): T[] {
  return items.filter((item) => item.text.trim().length > 0);
}

function sectionBody(resume: Resume, section: TemplateSection, templateId: TemplateId, look: DocxLook): Paragraph[] {
  switch (section) {
    case 'summary':
      return resume.summary
        .split(/\n+/)
        .filter((line) => line.trim())
        .map((line) => new Paragraph({ children: [run(line.trim(), look)] }));

    case 'experience':
      return resume.experience
        .filter((role) => role.title.trim() || role.company.trim() || printable(role.bullets).length)
        .flatMap((role) => [
          entryLine(
            [
              run(role.title, look, { bold: true }),
              ...(role.company ? [run(`${role.title ? ', ' : ''}${role.company}`, look)] : []),
              ...(role.location ? [run(` · ${role.location}`, look, { color: MUTED })] : []),
            ],
            formatDateRange(role.startDate, role.endDate, role.current) || undefined,
            look,
          ),
          // Unchecked AI wording is marked in the preview only. The exported file
          // is what an employer reads, and a marker there would mean nothing.
          ...printable(role.bullets).map((b) => bullet(b.text, look)),
        ]);

    case 'projects':
      return resume.projects
        .filter((project) => project.name.trim() || project.description?.trim() || printable(project.bullets).length)
        .flatMap((project) => [
          entryLine(
            [
              run(project.name, look, { bold: true }),
              ...(project.description ? [run(` — ${project.description}`, look)] : []),
            ],
            project.link || undefined,
            look,
          ),
          ...(project.technologies?.length
            ? [new Paragraph({ children: [run(project.technologies.join(', '), look, { color: MUTED })] })]
            : []),
          ...printable(project.bullets).map((b) => bullet(b.text, look)),
        ]);

    case 'skills': {
      const groups = resume.skills.filter((group) => group.skills.some((skill) => skill.trim()));

      if (TEMPLATE_SKILLS_LAYOUT[templateId] === 'inline') {
        return [
          new Paragraph({
            children: [
              run(
                groups.flatMap((group) => group.skills).filter((skill) => skill.trim()).join(' · '),
                look,
              ),
            ],
          }),
        ];
      }

      return groups.map(
        (group) =>
          new Paragraph({
            children: [
              run(`${group.category}: `, look, { bold: true }),
              run(group.skills.filter((skill) => skill.trim()).join(', '), look),
            ],
          }),
      );
    }

    case 'education':
      return resume.education
        .filter((entry) => entry.institution.trim() || entry.degree?.trim())
        .map((entry) => {
          const qualification = [entry.degree, entry.fieldOfStudy].filter(Boolean).join(', ');
          return entryLine(
            [
              run(qualification, look, { bold: true }),
              ...(entry.institution ? [run(`${qualification ? ', ' : ''}${entry.institution}`, look)] : []),
              ...(entry.gpa ? [run(` · ${entry.gpa}`, look, { color: MUTED })] : []),
            ],
            formatDateRange(entry.startDate, entry.endDate) || undefined,
            look,
          );
        });

    case 'certifications':
      return resume.certifications
        .filter((certification) => certification.name.trim())
        .map(
          (certification) =>
            new Paragraph({
              children: [
                run(certification.name, look, { bold: true }),
                ...(certification.issuer ? [run(`, ${certification.issuer}`, look)] : []),
                ...(certification.issueDate ? [run(` · ${certification.issueDate}`, look, { color: MUTED })] : []),
              ],
            }),
        );
  }
}

export async function buildResumeDocx(resume: Resume, templateId: TemplateId): Promise<Buffer> {
  const look = LOOKS[templateId];
  const alignment = look.centerHeader ? AlignmentType.CENTER : AlignmentType.LEFT;

  const { email, phone, location, linkedin, github, website } = resume.personal;
  const contact = [email, phone, location, linkedin, github, website]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('  ·  ');

  const children: Paragraph[] = [
    new Paragraph({
      alignment,
      children: [run(resume.personal.fullName, look, { bold: true, size: look.nameSize })],
    }),
    ...(contact
      ? [new Paragraph({ alignment, spacing: { after: 120 }, children: [run(contact, look, { color: MUTED })] })]
      : []),
  ];

  for (const section of TEMPLATE_SECTION_ORDER[templateId]) {
    if (!sectionHasContent(resume, section)) continue;
    children.push(heading(section, look), ...sectionBody(resume, section, templateId, look));
  }

  const document = new Document({
    creator: 'CareerLens AI',
    title: resume.personal.fullName || 'Resume',
    styles: { default: { document: { run: { font: look.font, size: look.bodySize } } } },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/** "Jane Doe - Modern.docx", reduced to characters every filesystem accepts. */
export function docxFileName(resume: Resume, templateId: TemplateId): string {
  const name = resume.personal.fullName.trim() || 'Resume';
  const template = templateId.charAt(0).toUpperCase() + templateId.slice(1);
  return `${name} - ${template}`.replace(/[^\w .-]+/g, '').replace(/\s+/g, ' ').trim() + '.docx';
}
