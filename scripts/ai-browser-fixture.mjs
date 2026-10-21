/* global Request, Response, Headers */
import { setTimeout as delay } from "node:timers/promises";
// Preloaded only by the isolated browser harness. Never imported by app code.
if (
  process.env.VERCEL ||
  !process.env.JOBCOMPASS_BROWSER_CHECK_ID ||
  !process.env.DATABASE_URL?.includes("/jobcompass_release_test")
)
  throw new Error("Isolated AI browser fixture only");
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    [
      "api.openai.com",
      "api.anthropic.com",
      "generativelanguage.googleapis.com",
      "openrouter.ai",
    ].includes(url.hostname)
  ) {
    if (url.hostname !== "api.openai.com")
      throw new Error("No live model calls in browser verification");
    const headers = new Headers(options?.headers);
    if (
      headers.get("authorization") !==
      "Bearer fixture-browser-provider-key-123456"
    )
      throw new Error("Unexpected fixture key");
    if (url.pathname === "/v1/models")
      return Response.json({
        data: [{ id: "fixture-model", name: "Controlled browser fixture" }],
      });
    if (url.pathname !== "/v1/responses")
      throw new Error("Unexpected provider path");
    const body = JSON.parse(options.body);
    if (JSON.stringify(body).includes("fixture-browser-provider-key"))
      throw new Error("Key leaked into model prompt");
    let data;
    function visit(value) {
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (parsed.resumeBlocks && parsed.jobText) data = parsed;
        } catch {
          /* not an embedded JSON prompt */
        }
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object")
        Object.values(value).forEach(visit);
    }
    visit(body);
    if (!data) throw new Error("Missing evidence prompt");
    const block = data.resumeBlocks.find((b) =>
      b.text.startsWith("Built Kotlin"),
    );
    if (!block) throw new Error("Missing fixture evidence");
    const report = {
      requirements: [
        {
          jobQuote: "Kotlin experience is required.",
          priority: "required",
          assessment: "supported",
          evidence: [{ blockId: block.id, quote: block.text }],
          question: "",
        },
        {
          jobQuote: "Accessibility experience is required.",
          priority: "required",
          assessment: "not_evidenced",
          evidence: [],
          question:
            "Have you worked on accessibility? Add a truthful example if so.",
        },
        {
          jobQuote:
            "Work with a thoughtful team to design reliable APIs and collaborate on product development.",
          priority: "unspecified",
          assessment: "transferable",
          evidence: [
            { blockId: block.id, quote: block.text },
            {
              blockId: block.id,
              quote:
                "Led 500 fictional engineers; unsupported provider excerpt",
            },
          ],
          question: "How does this experience relate to the advertised role?",
        },
      ],
      outline: [
        {
          heading: "Experience",
          excerpts: [{ blockId: block.id, quote: block.text }],
        },
      ],
    };
    await delay(1600);
    return Response.json({
      id: "resp_fixture",
      object: "response",
      created_at: 1,
      status: "completed",
      model: body.model,
      output: [
        {
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(report),
              annotations: [],
            },
          ],
        },
      ],
      usage: {
        input_tokens: 200,
        output_tokens: 150,
        total_tokens: 350,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    });
  }
  return realFetch(input, options);
};
