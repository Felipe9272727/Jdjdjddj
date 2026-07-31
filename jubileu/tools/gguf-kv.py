#!/usr/bin/env python3
"""Lê e corrige a metadata de um GGUF, sem tocar nos pesos.

Existe por um motivo estreito: a única conversão do multilingual-e5-small que
traz o tokenizador CERTO (SentencePiece/XLM-R) foi feita com um gguf antigo e
não gravou `tokenizer.ggml.token_type_count`. O llama.cpp de hoje recusa o
arquivo com "bert model needs to define token type count". As conversões novas
que trazem essa chave gravaram o tokenizador ERRADO (WordPiece) e produzem
vetores inúteis — medido: 1/12 contra 6/12 de outro modelo.

Uso:
  python3 tools/gguf-kv.py ler   modelo.gguf
  python3 tools/gguf-kv.py somar modelo.gguf saida.gguf chave=u32:valor
"""
import struct
import sys

U8, I8, U16, I16, U32, I32, F32, BOOL, STRING, ARRAY, U64, I64, F64 = range(13)
FIXO = {U8: 1, I8: 1, U16: 2, I16: 2, U32: 4, I32: 4, F32: 4, BOOL: 1,
        U64: 8, I64: 8, F64: 8}
FMT = {U8: 'B', I8: 'b', U16: 'H', I16: 'h', U32: 'I', I32: 'i', F32: 'f',
       BOOL: '?', U64: 'Q', I64: 'q', F64: 'd'}


class Leitor:
    def __init__(self, buf, pos=0):
        self.buf = buf
        self.pos = pos

    def u32(self):
        v = struct.unpack_from('<I', self.buf, self.pos)[0]
        self.pos += 4
        return v

    def u64(self):
        v = struct.unpack_from('<Q', self.buf, self.pos)[0]
        self.pos += 8
        return v

    def texto(self):
        n = self.u64()
        s = bytes(self.buf[self.pos:self.pos + n])
        self.pos += n
        return s.decode('utf-8', 'replace')

    def valor(self, tipo):
        """Devolve o valor, ou None quando é grande demais para interessar."""
        if tipo in FIXO:
            v = struct.unpack_from('<' + FMT[tipo], self.buf, self.pos)[0]
            self.pos += FIXO[tipo]
            return v
        if tipo == STRING:
            return self.texto()
        if tipo == ARRAY:
            sub = self.u32()
            n = self.u64()
            if sub in FIXO:
                self.pos += FIXO[sub] * n
            elif sub == STRING:
                for _ in range(n):
                    # NÃO escrever `self.pos += self.u64()`: o Python lê o
                    # `self.pos` da esquerda ANTES de chamar u64(), então os 8
                    # bytes do tamanho somem e o parser sai do lugar.
                    tamanho = self.u64()
                    self.pos += tamanho
            else:
                raise ValueError(f'array de tipo {sub} não suportado')
            return f'[{n} itens tipo {sub}]'
        raise ValueError(f'tipo {tipo} não suportado')


def ler(caminho):
    buf = memoryview(open(caminho, 'rb').read())
    if bytes(buf[:4]) != b'GGUF':
        raise SystemExit('não é um GGUF')
    versao = struct.unpack_from('<I', buf, 4)[0]
    n_tensores = struct.unpack_from('<Q', buf, 8)[0]
    n_kv = struct.unpack_from('<Q', buf, 16)[0]
    r = Leitor(buf, 24)
    kvs = []
    for _ in range(n_kv):
        chave = r.texto()
        tipo = r.u32()
        kvs.append((chave, tipo, r.valor(tipo)))
    fim_kv = r.pos
    tensores = []
    for _ in range(n_tensores):
        nome = r.texto()
        nd = r.u32()
        dims = [r.u64() for _ in range(nd)]
        tipo = r.u32()
        r.u64()  # offset relativo ao início dos dados
        tensores.append((nome, dims, tipo))
    return buf, versao, kvs, tensores, fim_kv, r.pos


def alinhamento(kvs):
    for chave, _, valor in kvs:
        if chave == 'general.alignment':
            return valor
    return 32


def escrever_kv(chave, tipo, valor):
    b = struct.pack('<Q', len(chave)) + chave.encode() + struct.pack('<I', tipo)
    return b + struct.pack('<' + FMT[tipo], valor)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    acao, entrada = sys.argv[1], sys.argv[2]
    buf, versao, kvs, tensores, fim_kv, fim_info = ler(entrada)
    if acao == 'ler':
        print(f'gguf v{versao}   {len(kvs)} chaves   {len(tensores)} tensores')
        for chave, tipo, valor in kvs:
            print(f'  {chave:52} t{tipo:<3} {valor}')
        print('  ── tensores ──')
        for nome, dims, tipo in tensores[:8]:
            print(f'  {nome:40} {dims} t{tipo}')
        print(f'  … {max(0, len(tensores) - 8)} outros')
        return
    if acao != 'somar':
        raise SystemExit(__doc__)

    saida = sys.argv[3]
    novas = []
    for arg in sys.argv[4:]:
        chave, resto = arg.split('=', 1)
        tipo, valor = resto.split(':', 1)
        novas.append((chave, {'u32': U32, 'i32': I32}[tipo], int(valor)))

    align = alinhamento(kvs)
    inicio_dados = (fim_info + align - 1) // align * align
    corpo = b''.join(escrever_kv(c, t, v) for c, t, v in novas)
    cabecalho = (b'GGUF' + struct.pack('<I', versao)
                 + struct.pack('<Q', len(tensores))
                 + struct.pack('<Q', len(kvs) + len(novas)))
    infos = bytes(buf[fim_kv:fim_info])
    novo_fim = len(cabecalho) + (fim_kv - 24) + len(corpo) + len(infos)
    enchimento = b'\0' * ((align - novo_fim % align) % align)
    with open(saida, 'wb') as f:
        f.write(cabecalho)
        f.write(bytes(buf[24:fim_kv]))
        f.write(corpo)
        f.write(infos)
        f.write(enchimento)
        f.write(bytes(buf[inicio_dados:]))
    print(f'gravado {saida}: +{len(novas)} chave(s)')


main()
