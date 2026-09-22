Use the installed TypeSafe skill when making routing judgments. Set
`TYPESAFE_API_KEY` through the execution environment; never commit the key or
include it in game code. Run `python tools/jev-route.py < decision.json`.

The JSON input contains a short `state` and 1–8 named `questions`. Each question
uses `type: "choice"`, `instructions`, and a `criteria` map of tool names to
descriptions, including `none`. Batch independent questions with the same state.
Send summaries, not entire files or conversation history. Consult current
TypeSafe docs for the API contract: https://docs.typesafe.ai/api

The helper validates returned choices and prints recommendations plus usage.
It does not intercept native agent tools, execute commands, or grant permissions.
The agent checks applicability and uncertainty before acting. If the API fails,
continue with ordinary tool selection and state that Jev was unavailable.
