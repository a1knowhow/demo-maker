/**
 * Template function resolution for demo scenario string values.
 *
 * Syntax: [fnName:"arg"]
 * Currently supported:
 *   [date:"FORMAT"]  — replaced with the current local date/time formatted per FORMAT.
 *
 * Supported format tokens:
 *   YYYY  4-digit year
 *   MM    2-digit month (01–12)
 *   DD    2-digit day   (01–31)
 *   HH    2-digit hour, 24h (00–23)
 *   mm    2-digit minute (00–59)
 *
 * Example:
 *   resolveTemplateFunctions('homepage-demo-[date:"YYYY-MM-DD-HHmm"].webm')
 *   // → 'homepage-demo-2026-04-01-1432.webm'
 *
 * Unrecognised function names are left as-is.
 */

const TEMPLATE_FUNCTION_REGEX = /\[(\w+):"([^"]*)"\]/g;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(fmt: string, now: Date): string {
  return fmt
    .replace("YYYY", String(now.getFullYear()))
    .replace("MM", pad2(now.getMonth() + 1))
    .replace("DD", pad2(now.getDate()))
    .replace("HH", pad2(now.getHours()))
    .replace("mm", pad2(now.getMinutes()));
}

/**
 * Resolves [fnName:"arg"] template functions in a string.
 * Unknown function names are preserved as-is.
 */
export function resolveTemplateFunctions(str: string): string {
  return str.replace(TEMPLATE_FUNCTION_REGEX, (match, fn: string, arg: string) => {
    if (fn === "date") {
      return formatDate(arg, new Date());
    }
    return match;
  });
}
