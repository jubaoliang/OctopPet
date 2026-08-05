/**
 * Soft-close incomplete Markdown constructs while a reply is still streaming.
 * An open fence otherwise makes remark swallow the rest as a code block.
 */
export function stabilizeStreamingMarkdown(content: string): string {
  if (!content) return content;

  let result = content;
  const fenceOpens = result.match(/^ {0,3}(`{3,}|~{3,})/gm);
  if (fenceOpens && fenceOpens.length % 2 === 1) {
    const last = fenceOpens[fenceOpens.length - 1] ?? "```";
    const marker = last.trim()[0] === "~" ? "~~~" : "```";
    result += result.endsWith("\n") ? marker : `\n${marker}`;
  }
  return result;
}
