#!/usr/bin/env python3
"""Ask Jev which advertised agent should own a task; never dispatch automatically."""
import json
import math
import os
from pathlib import Path
import subprocess
import sys

MODELS = {
    'main_agent': 'The primary agent implements an already understood code change.',
    'gpt-5.6-luna': 'Low-cost subagent reads the repo or documentation, audits, and gathers evidence.',
    'gpt-5.6-sol': 'Subagent writes a bounded independent code change.',
    'gpt-6-astra': 'Strong subagent resolves genuinely difficult integration or visual architecture.',
    'none': 'There is no useful next action or insufficient information to route it.',
}


def recommendation(task, evidence, constraints, ask=None):
    if not isinstance(task, str) or not 1 <= len(task) <= 1600:
        raise ValueError('task must be a short, nonempty description')
    state = {
        'task': task,
        'evidence': evidence,
        'constraints': constraints,
        'available_agents': MODELS,
    }
    payload = {
        'state': state,
        'model': 'jev-latest',
        'questions': {'owner': {
            'type': 'choice',
            'instructions': 'Choose one available agent for this specific work. Respect cost and user constraints; reserve gpt-6-astra for demanding decisions. A recommendation never performs the action or grants permission.',
            'criteria': MODELS,
        }},
    }
    if ask is None:
        def ask(data):
            result = subprocess.run(
                [sys.executable, str(Path(__file__).with_name('jev-route.py'))],
                input=json.dumps(data), text=True, capture_output=True, timeout=25,
                env=os.environ.copy(), check=True,
            )
            return json.loads(result.stdout)
    reply = ask(payload)
    answer = reply['answers']['owner']
    choice, confidence = answer['choice'], answer['confidence']
    probs = answer['probabilities']
    if (answer.get('type') != 'choice' or choice not in MODELS or
            set(probs) != set(MODELS) or
            any(not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0 or x > 1 for x in probs.values()) or
            abs(sum(probs.values()) - 1) > .02 or
            not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
        raise ValueError('Jev returned an invalid agent recommendation')
    # Ambiguity is a reason to retain the decision with the primary agent.
    selected = choice if confidence >= .5 and (choice != 'gpt-6-astra' or probs[choice] >= .75) else 'main_agent'
    return {'selected': selected, 'raw_choice': choice, 'confidence': confidence,
            'probabilities': probs, 'usage': reply.get('usage', {})}


def main():
    data = json.loads(sys.stdin.read(8193))
    if not os.environ.get('TYPESAFE_API_KEY'):
        raise ValueError('TYPESAFE_API_KEY is required in the process environment')
    result = recommendation(data['task'], data.get('evidence', []), data.get('constraints', []))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(json.dumps({'error': type(exc).__name__}), file=sys.stderr)
        sys.exit(1)
