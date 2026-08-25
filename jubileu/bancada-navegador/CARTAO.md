
## Trabalho longo nesta máquina: `setsid`, não `nohup`

Vários trabalhos de fundo morreram no meio hoje sem deixar erro: o gerador de
corpus parou em 50 de 300 casos, duas provas morreram com dezesseis casos já
escritos, o treino morreu duas vezes nos passos 7 e 9.

Eu atribuí tudo a memória. A memória explicava UMA delas — duas provas
simultâneas com dois modelos de 873M em float32 são 7 GB. As outras não: o
treino usava 1,7 GB de 15, e o `dmesg` não registra matador por memória em
nenhum momento.

A causa é que `nohup` protege do SIGHUP mas não tira o processo do grupo da
sessão. Quando a sessão do shell é limpa, o grupo vai junto. `setsid` cria
sessão nova — e a assinatura de que funcionou é PID, PGID e SID iguais:

    setsid comando > log 2>&1 < /dev/null &
    ps -o pid,pgid,sid,args -C python3

E o sintoma é traiçoeiro: SIGKILL não deixa traceback, então o log simplesmente
para. Um treino morto é indistinguível de um treino lento até alguém conferir
se o processo existe.
