import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { stabilizeStreamingMarkdown } from "../lib/stabilizeStreamingMarkdown";

const components: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

export default function AssistantMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const source = streaming ? stabilizeStreamingMarkdown(content) : content;

  return (
    <div className="markdown-body">
      {source ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {source}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}
