import { describe, expect, it } from 'vitest';
import { detectSections, matchSectionHeading } from '../services/parser/sectionDetection.js';
import {
  extractPersonalInfo,
  parseCertifications,
  parseEducation,
  parseExperience,
  parseProjects,
  parseResumeText,
  parseSkills,
} from '../services/parser/resumeParser.js';
import { normalizeExtractedText } from '../services/parser/textExtraction.js';

const SAMPLE_CV = `JANE DOE
Senior Software Engineer
jane.doe@example.com | +1 555 0100 | London, UK
linkedin.com/in/janedoe | github.com/janedoe

SUMMARY
Senior engineer with 8 years building payment systems at scale.

EXPERIENCE
Staff Engineer, Monzo - London
Jan 2021 - Present
- Led migration of ledger service handling 4M daily transactions
- Reduced p99 latency from 800ms to 120ms

Backend Engineer, Revolut - London
Jun 2018 - Dec 2020
- Built fraud detection pipeline processing 2TB daily

EDUCATION
BSc Computer Science, University of Manchester
2014 - 2018

SKILLS
Languages: TypeScript, Go, Python
Infrastructure: Kubernetes, Terraform, AWS

PROJECTS
OpenLedger - open-source double-entry ledger in Go
- Used by 40 companies

CERTIFICATIONS
AWS Certified Solutions Architect, 2022`;

describe('normalizeExtractedText', () => {
  it('normalizes bullets, quotes, dashes and whitespace', () => {
    const messy = 'Name\r\n\r\n\r\n•  Did a thing\n“quoted”   text – here';
    const result = normalizeExtractedText(messy);

    expect(result).toContain('- Did a thing');
    expect(result).toContain('"quoted" text - here');
    expect(result).not.toMatch(/\r/);
    expect(result).not.toMatch(/\n{3,}/);
  });
});

describe('matchSectionHeading', () => {
  it.each([
    ['SUMMARY', 'summary'],
    ['Professional Summary', 'summary'],
    ['Work Experience', 'experience'],
    ['EMPLOYMENT HISTORY', 'experience'],
    ['Education', 'education'],
    ['Technical Skills', 'skills'],
    ['Projects:', 'projects'],
    ['Certifications', 'certifications'],
  ])('recognises %s', (line, expected) => {
    expect(matchSectionHeading(line)).toBe(expected);
  });

  it.each([
    'Technical Skills & Tools',
    'Core Competencies',
    'Areas of Expertise',
    'IT Skills',
    'Computer Skills',
    'Technical Proficiencies',
    'Tools & Technologies',
    'Skills Summary',
    'Professional Skills',
  ])('recognises the skills section written as %s', (heading) => {
    // Real resumes phrase this a dozen ways; an exact-match list missed most of
    // them and dropped the whole section.
    expect(matchSectionHeading(heading)).toBe('skills');
  });

  it.each([
    ['Employment History', 'experience'],
    ['Career History', 'experience'],
    ['Educational Qualifications', 'education'],
    ['Licenses & Certifications', 'certifications'],
    ['Career Objective', 'summary'],
  ])('recognises %s as %s', (heading, expected) => {
    expect(matchSectionHeading(heading)).toBe(expected);
  });

  it.each([
    'Experience building distributed systems across three teams',
    'Led the skills matrix rollout for the platform group',
    'Responsible for education and onboarding of new joiners.',
    '- Built a fraud detection pipeline processing 2TB daily',
  ])('does not treat body text as a heading: %s', (line) => {
    expect(matchSectionHeading(line)).toBeNull();
  });

  it.each([
    'React.js Developer | Scalelot Technologies',
    'Senior Engineer | Acme Solutions Pvt. Ltd.',
    'Software Engineer | Vagaro Technologies Pvt. Ltd.',
    'Jun 2023 - Mar 2024 | Surat, India',
  ])('does not mistake the role line %s for a heading', (line) => {
    // Employers are routinely named "… Technologies" or "… Solutions". Without
    // guards the job title line was read as a skills heading and swallowed the
    // entire role beneath it.
    expect(matchSectionHeading(line)).toBeNull();
  });

  it('ignores unrelated lines', () => {
    expect(matchSectionHeading('Jane Doe')).toBeNull();
  });
});

describe('detectSections', () => {
  it('splits the header from the recognised sections', () => {
    const { header, sections, order } = detectSections(SAMPLE_CV);

    expect(header[0]).toBe('JANE DOE');
    expect(order).toEqual([
      'summary',
      'experience',
      'education',
      'skills',
      'projects',
      'certifications',
    ]);
    expect(sections.summary?.join(' ')).toMatch(/payment systems/);
  });

  it('keeps content when there are no recognised headings', () => {
    const { header, order } = detectSections('Jane Doe\nSome freeform text');
    expect(order).toHaveLength(0);
    expect(header).toHaveLength(2);
  });

  it('recovers a section whose heading shares a line with its content', () => {
    // PDF extraction produces this whenever the heading and first entry sit on
    // the same visual line. Treated as body text, the section vanished entirely.
    const { sections, order } = detectSections(
      'Jane Doe\njane@example.com\n\nTECHNICAL SKILLS: Java, Python, SQL\n\nEDUCATION\nBSc, Leeds',
    );

    expect(order).toContain('skills');
    expect(sections.skills?.[0]).toBe('Java, Python, SQL');
  });

  it('treats a labelled line inside the skills section as a group, not a new heading', () => {
    const { sections } = detectSections(
      'SKILLS\nLanguages: TypeScript, Go\nTools: Docker, Terraform',
    );

    expect(sections.skills).toEqual(['Languages: TypeScript, Go', 'Tools: Docker, Terraform']);
  });
});

describe('extractPersonalInfo', () => {
  it('pulls name and contact details out of the header block', () => {
    const info = extractPersonalInfo(detectSections(SAMPLE_CV).header);

    expect(info.fullName).toBe('JANE DOE');
    expect(info.email).toBe('jane.doe@example.com');
    expect(info.phone).toBe('+1 555 0100');
    expect(info.location).toBe('London, UK');
    expect(info.linkedin).toBe('https://linkedin.com/in/janedoe');
    expect(info.github).toBe('https://github.com/janedoe');
  });

  it('does not mistake digits inside an email or URL for a phone number', () => {
    const info = extractPersonalInfo(['Sam Patel', 'sam2024@example.com', 'site1234.com/sam']);
    expect(info.phone).toBeUndefined();
  });

  it('returns an empty name rather than inventing one', () => {
    const info = extractPersonalInfo(['contact@example.com']);
    expect(info.fullName).toBe('');
  });
});

describe('parseExperience', () => {
  it('parses roles, dates and bullets', () => {
    const experience = parseExperience(detectSections(SAMPLE_CV).sections.experience ?? []);

    expect(experience).toHaveLength(2);
    expect(experience[0]).toMatchObject({
      title: 'Staff Engineer',
      company: 'Monzo',
      location: 'London',
      startDate: 'Jan 2021',
      current: true,
    });
    expect(experience[0]?.endDate).toBeUndefined();
    expect(experience[0]?.bullets).toHaveLength(2);
    expect(experience[0]?.bullets[0]?.text).toMatch(/ledger service/);
  });

  it('marks a finished role as not current and keeps its end date', () => {
    const experience = parseExperience(detectSections(SAMPLE_CV).sections.experience ?? []);
    expect(experience[1]).toMatchObject({
      company: 'Revolut',
      endDate: 'Dec 2020',
      current: false,
    });
  });

  it('treats indented lines as bullets when the document has no bullet glyphs', () => {
    // Many resumes draw bullets as vector shapes, so nothing marks them in the
    // extracted text. Without using indentation the whole work history collapsed
    // into one entry describing nothing.
    const lines = [
      'Software Engineer | Vagaro',
      'Apr 2024 - Present',
      '    Own the frontend architecture for 4 core modules',
      '    Improved checkout performance by 90%',
      '',
      'React.js Developer | Enthusia',
      'Jun 2023 - Mar 2024',
      '    Built an admin panel with centralized state',
    ];

    const experience = parseExperience(lines);

    expect(experience).toHaveLength(2);
    expect(experience[0]?.bullets).toHaveLength(2);
    expect(experience[1]?.bullets).toHaveLength(1);
    expect(experience[0]?.bullets[0]?.text).toBe('Own the frontend architecture for 4 core modules');
  });

  it('attributes parsed bullets to the user, not the AI', () => {
    const experience = parseExperience(detectSections(SAMPLE_CV).sections.experience ?? []);
    for (const bullet of experience[0]?.bullets ?? []) {
      expect(bullet.source).toBe('user');
      expect(bullet.verified).toBe(true);
    }
  });
});

describe('parseEducation', () => {
  it.each([
    ['BDes Interaction Design, NID Ahmedabad', 'BDes Interaction Design', 'NID Ahmedabad'],
    ['BTech Computer Science, IIT Bombay', 'BTech Computer Science', 'IIT Bombay'],
    ['MBA, Indian Institute of Management', 'MBA', 'Indian Institute of Management'],
    ['PhD Physics, Imperial College London', 'PhD Physics', 'Imperial College London'],
  ])('does not confuse a place name for a degree in %s', (line, degree, institution) => {
    // "Ahmedabad" contains "ba", which an unanchored degree pattern wrongly matched.
    const [parsed] = parseEducation([line]);
    expect(parsed?.degree).toBe(degree);
    expect(parsed?.institution).toBe(institution);
  });

  it('separates degree from institution', () => {
    const education = parseEducation(detectSections(SAMPLE_CV).sections.education ?? []);

    expect(education).toHaveLength(1);
    expect(education[0]).toMatchObject({
      degree: 'BSc Computer Science',
      institution: 'University of Manchester',
      startDate: '2014',
      endDate: '2018',
    });
  });
});

describe('parseSkills', () => {
  it('keeps labelled groups', () => {
    const skills = parseSkills(detectSections(SAMPLE_CV).sections.skills ?? []);

    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      category: 'Languages',
      skills: ['TypeScript', 'Go', 'Python'],
    });
  });

  it('falls back to a single group for an unlabelled list', () => {
    const skills = parseSkills(['React, Node.js, SQL']);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.skills).toEqual(['React', 'Node.js', 'SQL']);
  });
});

describe('parseProjects and parseCertifications', () => {
  it('parses a project name, description and bullets', () => {
    const projects = parseProjects(detectSections(SAMPLE_CV).sections.projects ?? []);

    expect(projects[0]?.name).toBe('OpenLedger');
    expect(projects[0]?.description).toMatch(/double-entry ledger/);
    expect(projects[0]?.bullets).toHaveLength(1);
  });

  it('separates a certification year from its name', () => {
    const certs = parseCertifications(['AWS Certified Solutions Architect, 2022']);
    expect(certs[0]?.name).toBe('AWS Certified Solutions Architect');
    expect(certs[0]?.issueDate).toBe('2022');
  });
});

describe('parseResumeText', () => {
  it('produces a complete ResumeData structure', () => {
    const { resume } = parseResumeText(SAMPLE_CV, {
      userId: 'user-1',
      fileName: 'jane.pdf',
      fileType: 'pdf',
    });

    expect(resume.personal.fullName).toBe('JANE DOE');
    expect(resume.summary).toMatch(/payment systems/);
    expect(resume.experience).toHaveLength(2);
    expect(resume.education).toHaveLength(1);
    expect(resume.skills).toHaveLength(2);
    expect(resume.projects).toHaveLength(1);
    expect(resume.certifications).toHaveLength(1);
    expect(resume.metadata).toMatchObject({ sourceFileName: 'jane.pdf', sourceFileType: 'pdf' });
    expect(resume.metadata.wordCount).toBeGreaterThan(50);
  });

  it('handles a sparse resume without inventing content', () => {
    const { resume } = parseResumeText('Bob Smith\nbob@example.com');

    expect(resume.personal.fullName).toBe('Bob Smith');
    expect(resume.summary).toBe('');
    expect(resume.experience).toEqual([]);
    expect(resume.skills).toEqual([]);
    expect(resume.education).toEqual([]);
  });

  it('does not throw on empty input', () => {
    expect(() => parseResumeText('')).not.toThrow();
  });
});
