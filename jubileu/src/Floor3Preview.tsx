/**
 * Floor3Preview.tsx — DEV-ONLY isolated render of the Floor 3 scene.
 *
 * Mounted only when the URL contains `?f3preview` (see main.tsx). It renders
 * Floor3Environment plus the exact Floor-3 postprocessing stack with a fixed
 * camera roughly at player eye level, so the scene can be screenshotted and
 * tuned without booting the whole game (audio, networking, player GLB, etc.).
 * Has no gameplay and is never reached in production.
 *
 * `?handsdebug` swaps the scene for the raw gloves GLB at the origin (identity
 * rotation, with an axes helper) so the model's native orientation can be read
 * directly and the first-person pose dialed in.
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Vignette, HueSaturation, Sepia, BrightnessContrast, Noise } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { OrbitControls, useGLTF, Grid } from '@react-three/drei';
import { Suspense, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/** DEV-ONLY: expõe a cena para a sonda da bancada poder inspecionar material. */
function Expor() {
    const { scene, gl } = useThree();
    const w = window as unknown as { __cena?: unknown; __gl?: unknown };
    w.__cena = scene;
    w.__gl = gl;
    return null;
}

/**
 * DEV-ONLY: força as armadilhas a existirem.
 *
 * Elas nascem de `registerJump` — a cada dez pulos do jogador o Diabrete inca
 * uma tira de espinhos. Sem jogador não há pulo, sem pulo não há armadilha, e o
 * preview mostrava um andar sem nenhuma. Dá para atravessar um remake inteiro
 * sem nunca ver a peça que MACHUCA; foi o que aconteceu até aqui.
 */
function ForcarArmadilhas() {
    const pronto = useRef(false);
    useFrame(() => {
        if (pronto.current) return;
        // AS PLATAFORMAS SO EXISTEM DEPOIS DO SUSPENSE. A primeira versao disto
        // era um `useEffect` — que dispara ANTES do Floor3Environment resolver,
        // com `f3Platforms` ainda vazio. `pickNear` devolvia null, nenhuma
        // armadilha nascia, e a foto que eu tirei "das armadilhas" nao tinha
        // uma sequer. Esperar um quadro em que ja haja chao e o conserto.
        if (f3Platforms.length === 0) return;
        pronto.current = true;
        resetHazards();
        for (let obstaculo = 0; obstaculo < 2; obstaculo += 1) {
            for (let pulo = 0; pulo < 10; pulo += 1) registerJump(0);
        }
        // Ja desenhadas: o "inking" e bonito, mas quem precisa de foto e a
        // armadilha PRONTA, que e o estado em que ela machuca.
        for (const h of hazards) h.reveal = 1;
        // Onde elas cairam, para a bancada poder APONTAR a camera. Sem isto eu
        // fotografo o lugar onde eu ACHO que a armadilha esta.
        (window as unknown as { __armadilhas?: unknown }).__armadilhas =
            hazards.map((h) => hazardBox(h));
    });
    return null;
}
import Floor3Environment from './Floor3';
import FpHands from './Floor3Hands';
import { glovesModel } from './assets/textureImports';
import { GRADE_F3 } from './floor3Grade';
import Floor3Grito from './Floor3Grito';
import { hazards, hazardBox, registerJump, resetHazards, f3Progress } from './f3Hazards';
import { platforms as f3Platforms } from './f3Parkour';

/**
 * DEV-ONLY: cAmera livre pela URL — `?f3preview&cam=2,1.4,10&alvo=0,1,12`.
 *
 * As vistas fixas sao boas para comparar um antes/depois no mesmo enquadramento,
 * mas pessimas para PROCURAR: a armadilha tem 60 cm e nao cabe em nenhuma delas.
 * Com isto eu aponto a camera para onde a coisa esta, em vez de escolher entre
 * seis enquadramentos que alguem (eu) escolheu antes de saber o que procurava.
 */
function vetorDaUrl(chave: string): [number, number, number] | null {
    const bruto = new URLSearchParams(window.location.search).get(chave);
    if (!bruto) return null;
    const n = bruto.split(',').map(Number);
    if (n.length !== 3 || n.some((v) => !Number.isFinite(v))) return null;
    return [n[0], n[1], n[2]];
}

/**
 * DEV-ONLY: `?f3preview&esculpida` mostra a CABEÇA ESCULPIDA sozinha.
 *
 * Ela chegou no repo pelo commit "sculpted Diabrete (sources only)" e não estava
 * ligada em lugar nenhum — nada a importava. Antes de decidir o que fazer com
 * ela é preciso VER o que ela desenha, e ver de três ângulos, que é a lição que
 * o ciclo 7 cobrou caro: sete voltas de foto de frente esconderam uma máscara
 * que caía aos pedaços de perfil.
 *
 * Diferente da cutscene da queda, esta não depende de estado nenhum do jogo —
 * é um componente fechado, o que faz dela uma tela de bancada barata.
 *
 * ── E O IMPORT É DIRETO, NÃO `lazy` ─────────────────────────────────────────
 * A primeira versão usava `lazy()`, e a página inteira saía BRANCA — sem erro,
 * sem exceção, sem nada no console. Um componente `lazy` SUSPENDE, e dentro do
 * Canvas do react-three-fiber a suspensão não é pega pelo `<Suspense>` do DOM
 * que está por fora: a árvore some inteira. A mesma coisa tinha derrubado a
 * tentativa de encenar a cutscene da queda, e eu tinha culpado o estado do jogo.
 * Numa tela de bancada não há o que ganhar com divisão de código.
 */
import CabecaEsculpida from './DiabreteSculptedHead';

function Esculpida() {
    if (!new URLSearchParams(window.location.search).has('esculpida')) return null;
    const q = new URLSearchParams(window.location.search);
    return (
        <group position={[0.66, 1.9, 14]} scale={0.22}>
            <CabecaEsculpida
                look={q.get('olho') ?? 'malicia'}
                brow={q.get('cenho') ?? 'ironia'}
                mouth={q.get('boca') ?? 'sorrisoIronico'}
            />
        </group>
    );
}

/**
 * DEV-ONLY: `?f3preview&pinceis=2` diz quantos pincéis já foram roubados.
 *
 * O andar se desfaz conforme o Diabrete perde as ferramentas (ver `f3Desenho`),
 * e isso é impossível de comparar jogando: seriam vinte pulos por pincel, num
 * navegador a 2 fps. Aqui os três estados ficam a uma URL de distância.
 */
function ForcarPinceis() {
    const quantos = Number(new URLSearchParams(window.location.search).get('pinceis'));
    if (Number.isFinite(quantos)) f3Progress.brushes = quantos;
    return null;
}

function HandsDebug() {
    const { scene } = useGLTF(glovesModel);
    return (
        <group>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 5, 4]} intensity={1.2} />
            <axesHelper args={[1]} />
            <Grid args={[4, 4]} cellSize={0.25} sectionSize={1} infiniteGrid fadeDistance={12} />
            <primitive object={scene} scale={2} />
        </group>
    );
}

// Renders the REAL first-person hands against a neutral backdrop so the
// camera-pinned pose can be tuned (via ?…&rx=&py=&s=… URL overrides) and
// screenshotted exactly as the player sees it.
function FpHandsPreview() {
    return (
        <group>
            <ambientLight intensity={0.9} />
            <directionalLight position={[2, 4, 3]} intensity={1.1} />
            <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial color="#e9ecef" />
            </mesh>
            <FpHands />
        </group>
    );
}

export default function Floor3Preview() {
    const search = window.location.search;
    const debug = search.includes('handsdebug');
    const fphands = search.includes('fphands');
    const dbgCam: [number, number, number] = search.includes('top') ? [0, 3, 0.001]
        : search.includes('front') ? [0, 0.2, 3]
        : [1.6, 1.2, 1.6];
    // `panorama` põe a câmera alta e de lado: é a única vista que mostra o
    // CURSO, e não uma peça. Os marcos (bandeira, cordas, ripas) existem
    // justamente para serem lidos de longe — julgá-los de dentro da peça seria
    // julgar a coisa errada.
    const panorama = search.includes('panorama');
    // `diabo` enquadra O RIVAL. Sem jogador, o Floor3Rival se planta em
    // `f3PlayerZ + LEAD_Z` = z≈14, e sem uma câmera apontada para lá ele
    // simplesmente nunca aparece em foto nenhuma — foi por isso que passei o
    // remake inteiro sem olhar para o personagem que mais aparece no andar.
    const diabo = search.includes('diabo');
    const armadilha = search.includes('armadilha');
    const camLivre = vetorDaUrl('cam');
    const alvoLivre = vetorDaUrl('alvo');
    const camPos: [number, number, number] = camLivre ? camLivre
        : fphands ? [0, 0, 0]
        : debug ? dbgCam
        : armadilha ? [2.6, 2.2, 8.0]
        : diabo ? [1.5, 2.5, 11.4]
        : panorama ? [17, 11, 4]
        : search.includes('close') ? [0, 2.2, 8]
        : [0, 1.6, -8];
    // `?f3preview&grito=texto` desenha O MESMO componente de balão que o jogo
    // usa. Para vê-lo dentro do jogo seria preciso atravessar a intro e a
    // apresentação do Diabrete, o que nesta caixa passa de oito minutos.
    const grito = new URLSearchParams(window.location.search).get('grito');
    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
            {grito && <Floor3Grito texto={grito} serie={1} />}
            <Canvas
                // SEM `shadows` — DE PROPOSITO.
                //
                // O Canvas do jogo (App.tsx) nao passa `shadows`, entao
                // `gl.shadowMap.enabled` e falso e o Andar 3 nao tem mapa de
                // sombra nenhum. Esta tela passava, e desenhava sombras que o
                // jogador nunca ve — com a camera de sombra padrao, que e uma
                // ortografica de +-5 em volta da origem, mal cobrindo o comeco
                // do andar. Mesma razao pela qual a grade aqui vem do
                // `floor3Grade.ts` e nao de uma copia local: bancada que mente
                // e pior que bancada nenhuma.
                camera={{ position: camPos, fov: fphands ? 90 : 70, near: 0.1, far: 200 }}
                gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
            >
                <Expor />
                {(armadilha || search.includes('forcar')) && <ForcarArmadilhas />}
                <ForcarPinceis />
                <Esculpida />
                <Suspense fallback={null}>
                    {fphands ? <FpHandsPreview /> : debug ? <HandsDebug />
                        : <Floor3Environment elevator={false} hands={!panorama} gloves={!panorama && !diabo} />}
                </Suspense>
                {!fphands && <OrbitControls target={alvoLivre ? alvoLivre : debug ? [0, 0, 0] : armadilha ? [0, 1.2, 12] : diabo ? [0.66, 1.8, 14] : panorama ? [0, 2, 14] : [0, 1.5, 4]} />}
                {!debug && !fphands && !search.includes('nopost') && (
                <EffectComposer multisampling={0} enableNormalPass={false}>
                    {/* Sem N8AO e sem Bloom, iguais ao jogo — ver a nota longa
                        em `App.tsx`. Os dois saíram do Andar 3 depois de medir:
                        a oclusão desenhava vincos no rosto (creme de 241 a 255
                        onde tinha que ser chapado) e o bloom não mudava um
                        pixel. Vale notar que esta tela rodava os DOIS sempre,
                        enquanto o jogo só os roda em qualidade `high` — o que
                        significa que por um tempo eu vinha decidindo a cara
                        dele numa imagem mais suja que a do celular dele.
                        Esta tela existe para eu decidir visual olhando,
                        então ela tem que ter a MESMA pilha do jogo — com uma
                        cópia divergente ela me mostrava um andar que não é o
                        que o Felipe joga, e bancada que mente é pior que
                        bancada nenhuma. */}
                    {/* MESMOS números do jogo (floor3Grade.ts). Esta tela existe
                        para eu decidir visual olhando — com uma cópia própria
                        dos valores ela me mostrava um andar que não era o do
                        jogo, e bancada que mente é pior que bancada nenhuma. */}
                    <HueSaturation saturation={GRADE_F3.saturacao} />
                    <Sepia intensity={GRADE_F3.sepia} />
                    <BrightnessContrast brightness={GRADE_F3.brilho} contrast={GRADE_F3.contraste} />
                    <Noise opacity={GRADE_F3.grao} premultiply />
                    <Vignette eskil={false} offset={GRADE_F3.vinhetaInicio} darkness={GRADE_F3.vinheta} />
                </EffectComposer>
                )}
            </Canvas>
        </div>
    );
}
