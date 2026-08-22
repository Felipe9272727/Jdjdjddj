// ── O BANCO DE PERGUNTAS ─────────────────────────────────────────────────
//
// O gargalo do corpus não era variedade de FORMA — medido, o corpus escrito à
// mão tem 47 aberturas distintas em 48 respostas. Era quantidade de CASOS: 48
// é pouco, e com 8 épocas o aluno vê cada um 32 vezes e decora.
//
// Isto aqui é o lado de ENTRADA, que é barato: o que o jogador pergunta. O
// professor gera a frase errada e o conserto; a pergunta vem daqui, porque ela
// define o assunto e é o que garante que dois casos não sejam o mesmo caso com
// outras palavras.
//
// NENHUMA destas é pergunta da prova. A prova tem 24 e mora em `defeitos.mjs`;
// treinar nas perguntas da prova seria colar na prova, e essa linha não se
// cruza nem "só um pouquinho".
export const PERGUNTAS = Object.freeze([
    // o lugar
    'Where are we?', 'What does this room look like?', 'How big is this floor?',
    'What is the floor made of?', 'Is there a way out of this room?',
    'What is behind that wall?', 'Is there a window anywhere?',
    'What is above us?', 'What is below us?', 'How cold is it in here?',
    'What does it smell like in here?', 'Is it always this quiet?',
    'What is that sound?', 'Where does the light come from?',
    'Is there anywhere to sit?', 'Have you looked behind the door?',
    // o elevador
    'Does the elevator ever come?', 'What happens if I press the button?',
    'Can you call the elevator?', 'Have you tried forcing the doors?',
    'Does the elevator make a sound before it opens?',
    'How long since it last opened?', 'Does it ever go up?',
    'Could we ride it together?', 'What is inside the elevator?',
    // ele
    'Who are you?', 'Are you real?', 'How did you get here?',
    'What did you do before this?', 'How long have you been here?',
    'Do you sleep?', 'Do you eat?', 'Are you afraid?', 'What do you miss?',
    'Do you remember your name?', 'What is the last thing you remember from outside?',
    'Do you get tired?', 'What do you do all day?', 'Do you talk to yourself?',
    'What is the worst part of this?', 'Do you think you will get out?',
    // o hotel e os outros
    'Who runs this hotel?', 'Has anyone else come through here?',
    'Do you know the Owner?', 'Have you met the Archivist?',
    'Does the hotel have an end?', 'Are there other floors?',
    'What happened to the people who came before me?',
    'Do you know what this place is?', 'Is anyone watching us?',
    // eu e você
    'Do you know who I am?', 'Do you trust me?', 'Should I stay or go?',
    'What do you want from me?', 'Can you help me?', 'What should I do?',
    'Will you come with me?', 'Do you want me to stay?',
    'Are we alone here?', 'What would you do in my place?',
    // conversa
    'Say something.', 'Tell me something true.', 'What are you thinking about?',
    'Do you have a question for me?', 'What is on your mind?',
]);
