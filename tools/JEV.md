Use the installed TypeSafe skill when making routing judgments. Set
`TYPESAFE_API_KEY` through the execution environment; never commit the key or
include it in game code. Run `python tools/jev-route.py < decision.json`.

The JSON input contains a short `state` and 1–8 named `questions`. Use `choice`
to select a tool or owner, `noul` to assess evidence, and `score` to rate impact
against 2–10 ordered levels. Choice criteria must include `none`. Batch related
questions sharing the same state. `tools/jev-quality-request.json` supplies a
five-question quality review; replace its revision and evidence before calling.
Send summaries, not entire files or conversation history. Consult current
TypeSafe docs for the API contract: https://docs.typesafe.ai/api

The helper validates returned answers and prints recommendations plus usage.
For a repeated evaluation, pass `--cache-dir /tmp/jev-cache`; it caches only a
validated response for five minutes and reports elapsed time, API calls and
tokens saved. The key and raw state stay out of the cache. Include the current
commit and relevant diff hash in `state` when assessing changed source, or use
`--fresh` to bypass cached decisions. Cache hits retain provider usage as a
historical record; `metrics.billed_tokens` refers only to the current call.
It does not intercept native agent tools, execute commands, or grant permissions.
The agent checks applicability and uncertainty before acting. If the API fails,
continue with ordinary tool selection and state that Jev was unavailable.

To route a bounded task among *currently available* agent models, run
`python tools/jev-model-router.py < task.json` with `TYPESAFE_API_KEY` set in
the process environment. Input contains `task`, `evidence`, and `constraints`;
the script returns `selected`, the full Choice distribution, confidence and
usage. The caller still decides whether to spawn an agent. In ambiguous cases
the script retains work with `main_agent`; it never grants access or dispatches
tools itself. Group related routing questions into one Jev request when they
share the same evidence.
