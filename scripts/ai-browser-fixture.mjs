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
          if ((parsed.resumeBlocks || parsed.paragraphs) && parsed.jobText)
            data = parsed;
        } catch {
          /* not an embedded JSON prompt */
        }
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object")
        Object.values(value).forEach(visit);
    }
    visit(body);
    if (!data) throw new Error("Missing evidence prompt");
    const block = (data.resumeBlocks || data.paragraphs).find((b) =>
      b.text.startsWith("Built Kotlin"),
    );
    if (!block) throw new Error("Missing fixture evidence");
    const report =
      data.task === "tailored_cv_original"
        ? {
            replacements: [
              { id: block.id, text: block.text.replace("Built", "Developed") },
            ],
          }
        : data.task === "tailored_cv"
          ? {
              nameId: data.resumeBlocks[0].id,
              contactIds: [data.resumeBlocks[1].id],
              summary: [
                {
                  text: "Software engineer developing Kotlin services with PostgreSQL and Docker.",
                  sourceIds: [block.id],
                },
              ],
              sections: [
                {
                  heading: "Experience",
                  entries: [
                    {
                      contextIds: [block.id],
                      points: [
                        {
                          text: "Developed services using Kotlin, PostgreSQL and Docker.",
                          sourceIds: [block.id],
                        },
                      ],
                    },
                  ],
                },
                {
                  heading: "Education",
                  entries: [
                    {
                      contextIds: [
                        data.resumeBlocks.find((b) => b.text.startsWith("BSc"))
                          .id,
                      ],
                      points: [
                        {
                          text: "Completed a BSc in Computer Science at Example University in 2020.",
                          sourceIds: [
                            data.resumeBlocks.find((b) =>
                              b.text.startsWith("BSc"),
                            ).id,
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            }
          : {
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
                  question:
                    "How does this experience relate to the advertised role?",
                },
              ],
              outline: [
                {
                  heading: "Experience",
                  excerpts: [{ blockId: block.id, quote: block.text }],
                },
              ],
              verdict: {
                score: 3.1,
                reason:
                  "Your Kotlin evidence matches the main requirement. Accessibility is not shown in your CV.",
                seniority: {
                  posting: "unclear",
                  jobQuote: "",
                  candidate: "unclear",
                  evidence: [],
                },
                workplace: { arrangement: "unclear", quote: "" },
                timezone: {
                  requirement: "",
                  quote: "",
                  utcOffsetMin: null,
                  utcOffsetMax: null,
                },
                workCountry: { country: "", quote: "" },
                sponsorship: { stance: "unmentioned", quote: "" },
                interviewRisks: [
                  {
                    jobQuote: "Accessibility experience is required.",
                    question: "Tell us about accessibility work you have done.",
                    answer: "",
                    evidence: [],
                  },
                ],
              },
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
