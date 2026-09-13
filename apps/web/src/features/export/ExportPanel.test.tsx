import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportPanel } from './ExportPanel';
import { TEMPLATES } from '@/features/templates/registry';
import type { ResumeData } from '@/features/editor/api/editorApi';
import type { ExportAudit } from '@/features/export/api/exportApi';

const getExportAudit = vi.fn();
const downloadDocx = vi.fn();

vi.mock('@/features/export/api/exportApi', () => ({
  getExportAudit: (...args: unknown[]) => getExportAudit(...args),
  downloadDocx: (...args: unknown[]) => downloadDocx(...args),
}));

function resume(): ResumeData {
  return {
    id: 'r1',
    userId: 'u1',
    personal: { fullName: 'Jane Doe', email: 'jane@example.com' },
    summary: 'Backend engineer.',
    skills: [],
    experience: [
      {
        id: 'e1',
        company: 'Monzo',
        title: 'Backend Engineer',
        startDate: 'Jan 2021',
        current: true,
        bullets: [{ id: 'b1', text: 'Owned the ledger', verified: false, source: 'ai' }],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    metadata: {},
  };
}

function audit(overrides: Partial<ExportAudit> = {}): ExportAudit {
  return { blocking: [], warnings: [], ready: true, ...overrides };
}

function renderPanel() {
  return render(
    <ExportPanel
      resumeId="resume-1"
      versionId="v-draft"
      templateId="technical"
      templateStyle={TEMPLATES[3]!.style}
      resume={resume()}
    />,
  );
}

describe('ExportPanel', () => {
  beforeEach(() => {
    getExportAudit.mockReset();
    downloadDocx.mockReset();
  });

  it('offers both downloads once the resume is ready', async () => {
    getExportAudit.mockResolvedValue({ audit: audit(), templateId: 'technical', version: {} });
    renderPanel();

    expect(await screen.findByText('Ready to export.')).toBeVisible();
    expect(screen.getByRole('button', { name: /download word/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeEnabled();
  });

  it('refuses both downloads while anything blocks', async () => {
    getExportAudit.mockResolvedValue({
      audit: audit({
        ready: false,
        blocking: [
          { id: 'export.placeholder', message: '"[X]" looks like a placeholder.', where: 'Summary' },
        ],
      }),
      templateId: 'technical',
      version: {},
    });
    renderPanel();

    expect(await screen.findByText(/looks like a placeholder/)).toBeVisible();
    expect(screen.getByText('Summary:')).toBeVisible();
    expect(screen.getByRole('button', { name: /download word/i })).toBeDisabled();
    // PDF too: the placeholder would reach the employer either way.
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeDisabled();
  });

  it('shows warnings without blocking the download', async () => {
    getExportAudit.mockResolvedValue({
      audit: audit({
        warnings: [{ id: 'export.unverified-ai', message: '1 AI-written line has not been checked.' }],
      }),
      templateId: 'technical',
      version: {},
    });
    renderPanel();

    expect(await screen.findByText(/has not been checked/)).toBeVisible();
    expect(screen.getByRole('button', { name: /download word/i })).toBeEnabled();
  });

  it('asks the server for exactly the version and template on screen', async () => {
    getExportAudit.mockResolvedValue({ audit: audit(), templateId: 'technical', version: {} });
    downloadDocx.mockResolvedValue('Jane Doe - Technical.docx');
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /download word/i }));

    await waitFor(() => expect(downloadDocx).toHaveBeenCalledWith('resume-1', 'v-draft', 'technical'));
    expect(await screen.findByText('Downloaded Jane Doe - Technical.docx.')).toBeVisible();
  });

  it('prints through the browser for PDF', async () => {
    getExportAudit.mockResolvedValue({ audit: audit(), templateId: 'technical', version: {} });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /save as pdf/i }));

    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('prints the resume without the preview-only AI markers', async () => {
    getExportAudit.mockResolvedValue({ audit: audit(), templateId: 'technical', version: {} });
    renderPanel();

    await screen.findByText('Ready to export.');
    const root = document.getElementById('print-root')!;

    // The printed page is what an employer reads.
    expect(root).toHaveTextContent('Owned the ledger');
    expect(root).not.toHaveTextContent(/unchecked/i);
  });

  it('says so when the final check itself cannot run', async () => {
    getExportAudit.mockRejectedValue(new Error('The service is not fully configured yet.'));
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('not fully configured');
    expect(screen.getByRole('button', { name: /download word/i })).toBeDisabled();
  });
});
