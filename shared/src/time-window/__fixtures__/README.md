# Fixture pendente: `janelas-planilha-pedro-2025.json`

Este teste (`../time-window.fixture.spec.ts`) precisa do arquivo real com as 1.453
formas distintas de janela de tempo extraídas da planilha operacional de 2025 (Pedro).
**Não foi gerado nem inventado nesta sessão** — dado operacional real não se fabrica
(`CLAUDE.md` §1).

Formato esperado: array JSON de strings, uma por forma distinta —

```json
["03/02 - 00H00 A 02H00", "08/01 - 08H00", "05/05 - ATÉ AS 17H30"]
```

Salve o arquivo real como `janelas-planilha-pedro-2025.json` nesta mesma pasta. Sem ele,
`time-window.fixture.spec.ts` falha com uma mensagem explicando exatamente isso — não
falha em silêncio, não pula (skip), não inventa dado no lugar.
