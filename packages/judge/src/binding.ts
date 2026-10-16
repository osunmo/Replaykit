import { z } from 'zod';
import { IncidentSchema, ReplayPlanSchema } from '../../contracts/src/index.js';
export function replayBindingIssues(
  rawIncident: unknown,
  rawPlan: unknown,
  buggyImage: string,
): string[] {
  const incident = IncidentSchema.parse(rawIncident);
  const plan = ReplayPlanSchema.parse(rawPlan);
  const issues: string[] = [];
  if (incident.service !== 'checkout-api') issues.push('UNSUPPORTED_SERVICE');
  if (incident.revision !== buggyImage) issues.push('UNSUPPORTED_REVISION');
  if (
    plan.status === 'READY' &&
    (!incident.request ||
      !plan.request ||
      JSON.stringify(incident.request) !== JSON.stringify(plan.request))
  )
    issues.push('PLAN_REQUEST_MISMATCH');
  return issues;
}
export function candidateStateError(state: unknown): string | null {
  const parsed = z
    .object({
      Status: z.string(),
      Running: z.boolean(),
      OOMKilled: z.boolean(),
      Error: z.string(),
      ExitCode: z.number().int(),
    })
    .safeParse(state);
  if (!parsed.success) return 'CANDIDATE_STATE_UNAVAILABLE';
  if (parsed.data.OOMKilled) return 'CANDIDATE_OOM';
  if (
    parsed.data.Running ||
    parsed.data.Status !== 'exited' ||
    parsed.data.Error ||
    ![0, 1].includes(parsed.data.ExitCode)
  )
    return 'CANDIDATE_PROCESS_ERROR';
  return null;
}
