import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('jev_model_router', Path(__file__).with_name('jev-model-router.py'))
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


class ModelRoutingTests(unittest.TestCase):
    def response(self, choice, confidence, votes):
        p = dict.fromkeys(router.MODELS, 0)
        p.update(votes)
        return {'answers': {'owner': {'type': 'choice', 'choice': choice,
                'confidence': confidence, 'probabilities': p}}, 'usage': {'input_tokens': 2}}

    def test_read_only_repo_audit_routes_to_luna(self):
        result = router.recommendation('Audit branches', [], ['Luna for reading'],
            ask=lambda _: self.response('gpt-5.6-luna', .97, {'gpt-5.6-luna': .99, 'main_agent': .01}))
        self.assertEqual(result['selected'], 'gpt-5.6-luna')

    def test_ambiguous_expensive_route_stays_with_main(self):
        result = router.recommendation('Review art', [], [],
            ask=lambda _: self.response('gpt-6-astra', .6, {'gpt-6-astra': .65, 'main_agent': .35}))
        self.assertEqual(result['selected'], 'main_agent')

    def test_unknown_model_is_rejected_before_dispatch(self):
        response = self.response('gpt-5.6-luna', .99, {'gpt-5.6-luna': 1})
        response['answers']['owner']['choice'] = 'made-up-agent'
        with self.assertRaises(ValueError):
            router.recommendation('Review code', [], [], ask=lambda _: response)


if __name__ == '__main__':
    unittest.main()
