export type ChatAttachment = {
  filename: string;
  mediaType: string;
  workspacePath: string;
  url: string;
};

export type ResolvedModel = {
  provider_name: string;
  model: string;
  name: string;
};

export type ConnectorOption = {
  mcp_server_name: string;
  label: string;
  kind: string;
};

export function modelRef(providerName: string, model: string): string {
  return `${providerName}/${model}`;
}

export function modelOptionValue(m: ResolvedModel): string {
  return modelRef(m.provider_name, m.model);
}

export function modelOptionLabel(m: ResolvedModel): string {
  return `${m.provider_name} / ${m.name || m.model}`;
}

export function isImageAttachment(attachment: ChatAttachment): boolean {
  return (
    attachment.mediaType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.filename)
  );
}

/** Build OpenAI-style user content for a turn (text + attachments). */
export function buildUserMessageContent(
  text: string,
  attachments?: ChatAttachment[],
): string | Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const trimmed = text.trim();
  if (trimmed) blocks.push({ type: "text", text: trimmed });

  for (const attachment of attachments ?? []) {
    if (isImageAttachment(attachment)) {
      blocks.push({
        type: "image_url",
        image_url: { url: attachment.url || attachment.workspacePath },
      });
    } else {
      blocks.push({
        type: "file",
        file: {
          filename: attachment.filename,
          path: attachment.workspacePath,
          media_type: attachment.mediaType,
        },
      });
    }
  }

  if (blocks.length === 0) return "";
  if (blocks.length === 1 && blocks[0].type === "text") {
    return String(blocks[0].text ?? "");
  }
  return blocks;
}
