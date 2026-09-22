import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('jev_route', Path(__file__).with_name('jev-route.py'))
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


class JevRouteTests(unittest.TestCase):
    request = {'state': {'revision': 'test-123', 'observation': 'Blink snaps'}, 'questions': {
        'owner': {'type': 'choice', 'instructions': 'Choose owner',
                  'criteria': {'main_agent': 'Implement', 'none': 'No action'}},
        'evidence': {'type': 'noul', 'instructions': 'Does evidence exist?'},
        'impact': {'type': 'score', 'instructions': 'Score impact',
                   'criteria': ['None', 'Cosmetic', 'Blocks game']},
    }}

    def response(self):
        return {'model': 'jev-1.13.0', 'answers': {
            'owner': {'type': 'choice', 'choice': 'main_agent', 'confidence': .8,
                      'probabilities': {'main_agent': .9, 'none': .1}},
            'evidence': {'type': 'noul', 'noul': .88},
            'impact': {'type': 'score', 'score': .9, 'confidence': .78,
                       'probabilities': {'0': .1, '1': .9, '2': 0}},
        }, 'usage': {'input_tokens': 10, 'output_tokens': 3}}

    def test_all_types_and_repeat_uses_no_additional_api_call(self):
        calls = []
        def transport(body, key):
            calls.append(body)
            return self.response()
        with tempfile.TemporaryDirectory() as cache:
            first = router.evaluate(self.request, 'secret-example', cache, transport=transport)
            second = router.evaluate(self.request, 'secret-example', cache, transport=transport)
            self.assertEqual(len(calls), 1)
            self.assertEqual(first['metrics']['api_calls'], 1)
            self.assertEqual(second['metrics']['api_calls'], 0)
            self.assertEqual(second['metrics']['saved_tokens'], 13)
            cache_text = next(Path(cache).iterdir()).read_text()
            self.assertNotIn('secret-example', cache_text)
            self.assertNotIn('Blink snaps', cache_text)

    def test_invalid_choice_is_never_cached(self):
        fake = self.response()
        fake['answers']['owner']['choice'] = 'unadvertised-agent'
        with tempfile.TemporaryDirectory() as cache:
            with self.assertRaises(ValueError):
                router.evaluate(self.request, 'secret', cache, transport=lambda *_: fake)
            self.assertEqual(list(Path(cache).iterdir()), [])

    def test_expired_and_nonfinite_timestamps_trigger_new_call(self):
        calls = []
        def transport(*_):
            calls.append(1)
            return self.response()
        with tempfile.TemporaryDirectory() as cache:
            router.evaluate(self.request, 'secret', cache, transport=transport)
            path = next(Path(cache).iterdir())
            for timestamp in (-1, float('nan'), True):
                data = json.loads(path.read_text())
                data['created_at'] = timestamp
                path.write_text(json.dumps(data))
                output = router.evaluate(self.request, 'secret', cache, transport=transport)
                self.assertFalse(output['metrics']['cache_hit'])
            self.assertEqual(len(calls), 4)

    def test_unwritable_cache_keeps_validated_result(self):
        with tempfile.TemporaryDirectory() as root:
            cache_file = Path(root) / 'file'; cache_file.write_text('x')
            output = router.evaluate(self.request, 'secret', cache_file,
                transport=lambda *_: self.response())
            self.assertEqual(output['answers']['owner']['choice'], 'main_agent')


if __name__ == '__main__':
    unittest.main()
