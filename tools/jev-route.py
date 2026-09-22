#!/usr/bin/env python3
"""Batched TypeSafe judgments with validated answers, optional cache and measured usage."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time
import urllib.request

ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
TTL = 300


def number(value, low=0, high=1):
    return (type(value) in (int, float) and math.isfinite(value)
            and low <= value <= high)


def request_body(payload):
    body = {'model': 'jev-latest', 'state': payload['state'],
            'questions': payload['questions']}
    questions = body['questions']
    if not isinstance(questions, dict) or not 1 <= len(questions) <= 8:
        raise ValueError('Supply 1–8 named questions sharing one state')
    for name, question in questions.items():
        if not isinstance(name, str) or not isinstance(question, dict):
            raise ValueError('Invalid question')
        kind, criteria = question.get('type'), question.get('criteria')
        if not question.get('instructions'):
            raise ValueError('Question instructions required')
        if kind == 'choice' and (not isinstance(criteria, dict) or
                not 2 <= len(criteria) <= 255 or 'none' not in criteria):
            raise ValueError('Choice needs 2–255 options, including none')
        if kind == 'score' and (not isinstance(criteria, list) or
                not 2 <= len(criteria) <= 10):
            raise ValueError('Score needs 2–10 ordered levels')
        if kind not in ('choice', 'noul', 'score'):
            raise ValueError('Unsupported question type')
    if len(json.dumps(body, ensure_ascii=False).encode('utf-8')) > 16384:
        raise ValueError('Summarize state and options within 16 KiB')
    return body


def validate(result, questions):
    if not isinstance(result, dict) or not isinstance(result.get('answers'), dict):
        raise ValueError('Invalid Jev response')
    answers = result['answers']
    if set(answers) != set(questions):
        raise ValueError('Missing or extra answers')
    for name, question in questions.items():
        answer, kind = answers[name], question['type']
        if not isinstance(answer, dict) or answer.get('type') != kind:
            raise ValueError('Answer type mismatch')
        if kind == 'noul':
            if not number(answer.get('noul')):
                raise ValueError('Invalid Noul probability')
            continue
        levels = question['criteria']
        allowed = set(levels) if kind == 'choice' else set(map(str, range(len(levels))))
        probabilities = answer.get('probabilities')
        if (not isinstance(probabilities, dict) or set(probabilities) != allowed or
                not all(number(value) for value in probabilities.values()) or
                abs(sum(probabilities.values()) - 1) > .02 or
                not number(answer.get('confidence'))):
            raise ValueError('Invalid probability distribution')
        if kind == 'choice' and answer.get('choice') not in allowed:
            raise ValueError('Unknown tool/model choice')
        if kind == 'score' and not number(answer.get('score'), 0, len(levels) - 1):
            raise ValueError('Score outside ordered rubric')
    return {'model': result.get('model'), 'answers': answers,
            'usage': result.get('usage', {})}


def post(body, api_key):
    req = urllib.request.Request(ENDPOINT,
        data=json.dumps(body, ensure_ascii=False).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def evaluate(payload, api_key, cache_dir=None, fresh=False, transport=post):
    if not api_key:
        raise ValueError('TYPESAFE_API_KEY required in process environment')
    body = request_body(payload)
    started = time.perf_counter()
    path = None
    if cache_dir:
        digest = hashlib.sha256((api_key + '\\0' +
            json.dumps(body, sort_keys=True, ensure_ascii=False)).encode('utf-8')).hexdigest()
        path = Path(cache_dir) / ('jev-' + digest + '.json')
    cached = False
    result = None
    if path is not None and not fresh:
        try:
            record = json.loads(path.read_text(encoding='utf-8'))
            created = record['created_at']
            if (type(created) in (int, float) and math.isfinite(created) and
                    0 <= time.time() - created < TTL):
                result = validate(record['response'], body['questions'])
                cached = True
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            pass
    if result is None:
        result = validate(transport(body, api_key), body['questions'])
        if path is not None:
            try:
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix('.tmp')
                temporary.write_text(json.dumps({'created_at': time.time(),
                    'response': result}), encoding='utf-8')
                os.replace(temporary, path)
            except OSError:
                pass  # Cache is optional; retain the validated paid response.
    usage = result.get('usage', {})
    tokens = sum(usage.get(k, 0) for k in ('input_tokens', 'output_tokens'))
    output = dict(result)
    output['metrics'] = {'elapsed_ms': round((time.perf_counter() - started)*1000, 3),
        'cache_hit': cached, 'api_calls': 0 if cached else 1,
        'billed_tokens': 0 if cached else tokens, 'saved_tokens': tokens if cached else 0}
    return output


def main():
    parser = argparse.ArgumentParser(description='Batched TypeSafe judgment')
    parser.add_argument('--cache-dir', default=None)
    parser.add_argument('--fresh', action='store_true')
    args = parser.parse_args()
    raw = sys.stdin.buffer.read(16385)
    if len(raw) > 16384:
        raise ValueError('Request exceeds 16 KiB')
    result = evaluate(json.loads(raw), os.environ.get('TYPESAFE_API_KEY'),
        cache_dir=args.cache_dir, fresh=args.fresh)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, TimeoutError) as error:
        print(json.dumps({'error': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
