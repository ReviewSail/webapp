/**
 * supabase.functions.invoke surfaces any non-2xx response as a
 * FunctionsHttpError whose `message` is the useless generic "Edge Function
 * returned a non-2xx status code". The message we actually wrote is in the
 * response body, which is readable exactly once via error.context.
 *
 * Every edge function in this project answers errors as `{ error: string }`,
 * so this is the one place that has to know that.
 */
export async function readFunctionError(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // Body already consumed, or not JSON. Fall through.
  }
  return error?.message || fallback;
}
