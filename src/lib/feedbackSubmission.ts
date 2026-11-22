export type FeedbackDraft = { star: number | null; text: string; name: string; email: string };
export type FeedbackOutcome = { saved: boolean; uncertain: boolean; error?: string };

export function readFeedbackOutcome(data: unknown, submissionId: string): FeedbackOutcome {
  const value = data as { status?: string; submission_id?: string } | null;
  if ((value?.status === 'accepted' || value?.status === 'duplicate') && value.submission_id === submissionId) {
    return { saved: true, uncertain: false };
  }
  const errors: Record<string, string> = {
    invalid: 'Please check the rating, message length and email address. Nothing was saved.',
    unavailable: 'This feedback link is unavailable or expired. Nothing new was saved.',
    rate_limited: 'Too many submissions were received. Your message is still here; please try again later.',
    conflict: 'This submission reference was already used for different content. Keep your message and contact the property for help.',
  };
  if (value?.status && Object.prototype.hasOwnProperty.call(errors, value.status)) return { saved: false, uncertain: false, error: errors[value.status] };
  return { saved: false, uncertain: true,
    error: 'We could not confirm the save. Keep this page open and retry the same submission; it will not be saved twice.' };
}

/** Do not turn stored URLs into executable javascript/data links. */
export function safeReviewUrl(raw: string | null | undefined): string | null {
  try {
    const url = new URL(raw || '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
