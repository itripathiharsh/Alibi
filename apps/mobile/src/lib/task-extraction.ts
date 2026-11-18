import { ensureAuthenticated } from "./auth";
import { getServerUrl } from "./config";

export interface TaskExtractionProposal {
  id: string;
  task_id: string;
  input_text: string;
  final_proposal: Record<string, unknown>;
}

export async function decideTaskExtraction(input: {
  taskId: string;
  acceptedFields: Record<string, unknown>;
  rejectedFields: string[];
}): Promise<void> {
  let token = await ensureAuthenticated();
  if (!token) throw new Error("Sign in to review the saved task details.");

  const url = `${getServerUrl()}/api/v1/tasks/${input.taskId}/extraction/decision`;
  const send = (accessToken: string) => fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      accepted_fields: input.acceptedFields,
      rejected_fields: input.rejectedFields,
    }),
  });

  let response = await send(token);
  if (response.status === 401) {
    token = await ensureAuthenticated(true);
    if (token) response = await send(token);
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as { detail?: string; title?: string };
    throw new Error(problem.detail ?? problem.title ?? "Could not save your review.");
  }
}
