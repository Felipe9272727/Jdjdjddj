import type { Mood, Token } from './dialogue-engine';
import { ROOT_SCENE } from './shop-dialogues';
import type {
  BellhopMotion,
  BellhopPurchaseMotion,
} from './shop-sprite-assets';

/** One authored counter performance for every selectable catalog item. */
export const PURCHASE_MOTION_BY_SCENE: Readonly<
  Partial<Record<string, BellhopPurchaseMotion>>
> = {
  buy_flashlight: 'buy-flashlight',
  buy_cookie: 'buy-cookie',
  buy_coffee: 'buy-coffee',
  buy_key: 'buy-key',
  buy_floor: 'buy-floor',
  buy_memory: 'buy-memory',
};

export const purchaseMotionForScene = (
  sceneId: string,
): BellhopPurchaseMotion | undefined => PURCHASE_MOTION_BY_SCENE[sceneId];

/**
 * Parenthesised pages describe what the player sees rather than something the
 * receptionist says. Keeping him in a held pose on those pages avoids the old
 * problem where the same open-arm speech gesture repeated over stage direction.
 */
export const isShopNarrationPage = (tokens: readonly Token[]): boolean => {
  const text = tokens.map((token) => {
    if (token.kind === 'char') return token.ch;
    if (token.kind === 'newline') return '\n';
    return '';
  }).join('');
  return /^\s*\*\s*\(/.test(text);
};

interface ResolveShopBellhopMotionOptions {
  interactive: boolean;
  sceneId: string;
  mood?: Mood;
  purchaseAnimationDone: boolean;
  introduction: boolean;
  narration: boolean;
}

/**
 * Central direction table for the receptionist. The large presentation is
 * exclusive to the first welcome; daily speech gets its restrained loop, and
 * every purchase gets its own one-shot acting sequence before the scene mood
 * takes over.
 */
export const resolveShopBellhopMotion = ({
  interactive,
  sceneId,
  mood = 'idle',
  purchaseAnimationDone,
  introduction,
  narration,
}: ResolveShopBellhopMotionOptions): BellhopMotion => {
  if (!interactive) return 'idle';

  const purchaseMotion = purchaseMotionForScene(sceneId);
  if (purchaseMotion && !purchaseAnimationDone) return purchaseMotion;

  if (sceneId.startsWith('post_death') && mood === 'concerned') return 'glitch';
  if (introduction && sceneId === ROOT_SCENE) return 'presentation';

  if (mood === 'wink') return 'wink';
  if (mood === 'sweat') return 'sweat';
  if (mood === 'concerned') return 'concerned';

  // Silent stage directions hold a readable neutral silhouette. Spoken pages,
  // including scenes tagged "idle", use the smaller everyday hand gestures.
  return narration ? 'idle' : 'conversation';
};

const DELIVERED_ITEM_SCENES = new Set([
  'buy_flashlight',
  'buy_cookie',
  'buy_coffee',
  'buy_memory',
]);

/** Key/floor scenes end in refusal or panic, so celebratory sparkles are wrong. */
export const hasShopPurchaseVfx = (sceneId: string): boolean => (
  DELIVERED_ITEM_SCENES.has(sceneId)
);
