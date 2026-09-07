/**
 * CartoonIntro.tsx — o cartão de título do Andar 3.
 *
 * O trabalho pesado (a íris creme, as luvas de borracha fazendo "puck… puck!" e
 * todos os efeitos) acontece em 3D dentro do Canvas (CartoonIntro3D.tsx). Esta
 * camada de DOM é o cartão por cima, guiada pelo `stage` que a linha do tempo 3D
 * empurra para cá — assim os dois andam em compasso. A intro NÃO pode ser
 * pulada: ela toca até o fim e se dispensa sozinha, e esta camada nunca captura
 * clique (`pointer-events: none`).
 *
 * O DESENHO DO CARTÃO mora em `Floor3Cartao.tsx`, compartilhado com os dois
 * desfechos do andar: o mesmo objeto abre e fecha o Andar 3.
 *
 * O tempo vem dos beats que o áudio já tocava: o cartão entra em branco no
 * "boing" (stage 3) e o título ESTALA no "tá-dá" (stage 4). Meio segundo entre
 * um e outro — o tempo de uma piada.
 */

import Floor3Cartao from './Floor3Cartao';

interface Props {
    stage: number;       // coreografia vinda do CartoonIntro3D (3 = cartão, 4 = título, 5 = saindo)
}

export default function CartoonIntro({ stage }: Props) {
    if (stage < 3 || stage >= 5) return null;
    return (
        <Floor3Cartao
            variante="placa"
            acima="LIMINAL SYSTEMS APRESENTA"
            titulo="ANDAR 3"
            abaixo="✦ AND NOW… IN GLORIOUS CARTOON ✦"
            mostraTitulo={stage >= 4}
        />
    );
}
