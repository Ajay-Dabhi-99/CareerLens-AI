import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { auditForExport } from '@career-lens-ai/validation';
import { DEFAULT_TEMPLATE_ID, isTemplateId, type Resume, type TemplateId } from '@career-lens-ai/types';
import { buildResumeDocx, docxFileName } from '../../services/exporter/docxExporter.js';
import { PublicError } from '../../utils/errors.js';
import type { ResumeEditorRepository } from '../editor/resumeRepository.js';

export interface ExportRouteDeps {
  resumes: ResumeEditorRepository;
}

const querySchema = z.object({
  versionId: z.string().min(1).optional(),
  template: z.string().optional(),
});

/** Generating a document is cheap but not free; this bounds a runaway client. */
const EXPORT_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function userKey(request: FastifyRequest): string {
  return request.user?.id ?? request.ip;
}

export function registerExportRoutes(app: FastifyInstance, deps: ExportRouteDeps): void {
  const { resumes } = deps;

  /**
   * The version to export, read from the database.
   *
   * The file is built from the stored version rather than from anything the
   * browser sends, which is what makes "the downloaded file matches the
   * selected version" true instead of hopeful: there is no way to export text
   * that was never saved.
   */
  async function resolve(request: FastifyRequest<{ Params: { id: string } }>) {
    const user = request.user;
    if (!user) throw new PublicError('Not authenticated', 401);

    const query = querySchema.safeParse(request.query);
    if (!query.success) throw new PublicError('That export request was not understood.', 400);

    const resume = await resumes.findOwned(request.params.id, user.id);
    if (!resume) throw new PublicError('Resume not found.', 404);

    let version;
    if (query.data.versionId) {
      version = await resumes.findVersion(query.data.versionId, user.id);
      if (!version || version.resumeId !== resume.id) {
        throw new PublicError('That version was not found.', 404);
      }
    } else {
      const versions = await resumes.findVersions(resume.id, user.id);
      version = versions.find((candidate) => candidate.label === 'draft');
      if (!version) throw new PublicError('This resume has no working draft to export.', 409);
    }

    const data = version.data as Resume;

    // The template the user is looking at wins; then the one saved with the
    // resume; then the default. An unknown value never fails an export.
    const templateId: TemplateId = isTemplateId(query.data.template)
      ? query.data.template
      : isTemplateId(data.metadata?.templateId)
        ? data.metadata.templateId
        : DEFAULT_TEMPLATE_ID;

    return { version, data, templateId };
  }

  /** The final check, so the UI can show what needs fixing before offering a download. */
  app.get<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/export/audit',
    { preHandler: app.requireAuth },
    async (request) => {
      const { version, data, templateId } = await resolve(request);

      return {
        audit: auditForExport(data),
        templateId,
        version: {
          id: version.id,
          label: version.label,
          name: version.name,
          updatedAt: version.updatedAt,
        },
      };
    },
  );

  /**
   * The Word document.
   *
   * Refused while anything blocks export. The audit runs here too rather than
   * trusting that the UI ran it first — a placeholder like "[X]%" reaching an
   * employer is precisely the failure this phase exists to prevent, and a
   * direct request should not be a way around it.
   */
  app.get<{ Params: { id: string } }>(
    '/api/editor/resumes/:id/export/docx',
    {
      preHandler: app.requireAuth,
      config: { rateLimit: { ...EXPORT_RATE_LIMIT, keyGenerator: userKey } },
    },
    async (request, reply) => {
      const { data, templateId } = await resolve(request);

      const audit = auditForExport(data);
      if (!audit.ready) {
        return reply.code(422).send({
          error: 'Fix the issues marked as blocking before exporting.',
          audit,
        });
      }

      const buffer = await buildResumeDocx(data, templateId);

      return reply
        .header('Content-Type', DOCX_TYPE)
        .header('Content-Disposition', `attachment; filename="${docxFileName(data, templateId)}"`)
        // The browser hides this header from scripts unless it is exposed, and
        // the client needs it to save the file under its proper name.
        .header('Access-Control-Expose-Headers', 'Content-Disposition')
        .send(buffer);
    },
  );
}
