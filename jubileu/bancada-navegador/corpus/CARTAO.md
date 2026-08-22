---
license: apache-2.0
base_model: HuggingFaceTB/SmolLM2-360M-Instruct
language: [en]
pipeline_tag: text-generation
tags: [gguf, llama.cpp, wllama, game, text-editing]
---

# Nilo — revisor de fala do Andar 10

Revisor de **uma tarefa só**: recebe uma frase errada dita por um NPC, o motivo
pelo qual ela está errada, e devolve a frase corrigida — na voz do personagem.
Não é um assistente e não responde perguntas.

Feito para *The Normal Elevator*, um jogo de terror em navegador cujo NPC do
10º andar roda inteiramente no aparelho do jogador. O revisor é a peça que
conserta o que o rascunhador escreve fora do cânone.

- **Base:** SmolLM2-360M-Instruct
- **Treino:** LoRA (r=32) sobre 192 pares (frase errada + motivo) → (frase certa)
- **Formato:** gguf q8_0, 386 MB — carrega em ~7 s no wllama, sem GPU

## Como ele é chamado

```
sistema: You are Nilo Azevedo, a human guest trapped on the 10th floor of the
         hotel "The Normal Elevator": a grey room, four walls, a grate floor,
         the elevator door. You are dry, observant, and nobody's helper.

usuário: The player asked: "<pergunta>"
         Wrong line: "<frase errada>"
         It is wrong because <motivo>
         Corrected line:
```

Geração **gulosa** (temperature 0): conserto é escolha, não sorteio.

## O que ele faz, medido

Prova de 24 defeitos × 2 rodadas, a frio, contra o **mesmo modelo sem treino**,
no mesmo enunciado e no mesmo arquivo:

| | conserta | ecoou | copiou | quebrou o cânone |
|---|---|---|---|---|
| SmolLM2-360M sem treino | 8/48 | 18 | 10 | **28** |
| este | **44/48** | 2 | 0 | **0** |

## O que ele NÃO faz

Com 192 pares de treino ele aprendeu **o cânone** e **a forma**, não a
coerência. Numa leitura humana das 24 saídas, cerca de oito ainda são frases
plausíveis e erradas — *"a few steps from a door that does not exist"* (a porta
existe, ela só não abre) ou *"a flat expanse of grey stone"* (o chão é grade de
metal). Régua automática não pega esse tipo de erro; leia as saídas.

É uma prova de que o caminho funciona, não um modelo final.
