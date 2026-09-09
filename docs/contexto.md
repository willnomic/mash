# Grupo Mash — Contexto

Base de contexto do projeto. Afirma o estado atual.
Decisões técnicas ficam em `decisoes.md`.

Atualizado em 09/09/2026

---

## O produto

Plataforma modular de sistemas para o setor logístico. Cada sistema — TMS, ERP e
futuramente WMS e outros — é um módulo independente, vendável separadamente, sobre
uma base comum: o **Mash Core** (login, tenants, cobrança, cadastros compartilhados).

Primeiro produto: **Mash TMS**. Em seguida, Mash ERP reaproveitando o Core.

### Diferencial

Não é quantidade de funcionalidade. É experiência de uso. O setor é dominado por
sistemas datados, e o operador sofre com isso todo dia.

Isto tem sustentação de campo, não é hipótese: nas transportadoras observadas, o
operacional trabalha em **várias instâncias simultâneas** — TMS próprio, emissor
fiscal separado, rastreamento de veículo e planilhas paralelas. Precisa dominar cada
uma e executar um pedaço em cada lugar. A dor relatada é **simplicidade e fluxo**.

**Validação de campo (sócio): a fragmentação mais forte não é entre sistemas, é entre
PESSOAS da mesma empresa.** Cada operador mantém a própria planilha, sem consolidação
nenhuma entre eles — o dono não tem visão do conjunto até alguém puxar tudo à mão. É
argumento mais forte que o de sistemas fragmentados (acima), porque é venda pro **dono**
da transportadora, não só pro operador que sente a dor no dia a dia.

**Consequência:** o Mash Core não é encanamento, é o produto. Login único, navegação
única, cadastros que não se repetem entre módulos, terminologia consistente — é
exatamente o antídoto da dor observada.

---

## Quem constrói

**Desenvolvedor** — autodidata, sem formação nem experiência profissional em
engenharia. Dedicação integral, 8h/dia. **Designer gráfico de formação**, com alguma
experiência em interface leve, pouca em sistema operacional denso.

Um projeto anterior concluído: automação de WhatsApp, 8 meses a 16h/dia, com captação
e administração de grupos e envio em massa. Entregou autenticação, banco relacional,
deploy em produção, processamento assíncrono, Git, testes e log estruturado. Não
cuidou da camada de banco de dados — havia outras pessoas no projeto. Saiu por falta
de entrega dos demais.

Modo de trabalho: escreve o código, usa IA para desbloquear. Lê e entende o que
produz.

**Sócio comercial** — mais de sete anos no setor de transporte, atua hoje como
consultor de transportadoras. Part-time no projeto. Valida fluxo, terminologia e
realidade operacional; leva o produto ao mercado.

### Perfil técnico — implicações

Experiência acumulada é de **construir**, não de **manter**: nunca teve código
revisado, nunca herdou base de terceiros, nunca viveu um sistema próprio envelhecendo
com usuários dentro. Este projeto é definido por manutenção.

**Ponto mais frágil: modelagem de dados.** Nível declarado: praticamente nulo em SQL e
modelagem relacional. É a decisão mais difícil de reverter, onde a IA menos ajuda, e
que exige prever o mês 18. É onde a energia de estudo deve se concentrar.

**Critério de escolha técnica que decorre disso:** não "qual arquitetura é mais
elegante", e sim **"qual é mais difícil de errar"**.

### Limite da IA como alavanca

IA resolve desbloqueio, curva de aprendizado e código repetitivo — ganho real e
grande. Não resolve julgamento sobre o que construir, percepção de estar num caminho
ruim há semanas, nem depuração de problema sem formato de pergunta de fórum: condição
de corrida, corrupção de dado, vazamento entre tenants, degradação por volume.

**Teste automatizado não corrige modelo errado.** A IA escreve testes coerentes com o
modelo que existe. Se o modelo estiver errado, todos passam e a suíte verde vira
evidência falsa. Exemplo do domínio: sem vigência na tabela de frete, o teste verifica
que a cotação usa o preço da tabela, passa por meses, e o sistema segue recalculando
março com preço de setembro — até uma auditoria fiscal aparecer.

Por isso o estudo de modelagem não é para virar DBA. É para conseguir **avaliar** o
que a IA propõe em vez de aceitar.

---

## Restrições

| Restrição | Valor |
|---|---|
| Fôlego financeiro sem receita | ~6 meses, esticável com reserva ou renda extra |
| Sócio comercial | Part-time |
| Conhecimento de domínio do desenvolvedor | Entende os termos, não viveu a operação |
| Fontes de domínio | O sócio + 2 transportadoras onde ele consulta, com acesso ao operacional confirmado |

**A restrição que manda não é o prazo de 12 meses — é o tempo até a primeira
receita.** O planejamento se desenha de trás para frente a partir dela, não a partir
da completude do produto.

---

## Cliente e mercado

### Alvo

Transportadoras de **carga lotação** (um cliente enche o veículo, ponto A ao ponto B).

Carga lotação é o modelo de operação mais enxuto: pedido, veículo, motorista, viagem,
CT-e. Um TMS de carga fracionada — com romaneio, transferência entre filiais,
cross-docking, rateio por nota, tabela por peso/cubagem/faixa de CEP — é cerca de 4x
o trabalho. Lotação primeiro; os demais perfis herdam a base.

**Existe uma fatia portuária no perfil desse cliente-alvo** — contêiner, devolução de
vazio, free time — fora do escopo da v1 de lotação rodoviária pura. Registrada como
v1.1, junto com agendamento em terminal (D-039).

### O que o mercado mostra

Os TMS estabelecidos (TOTVS, ESL, Brudam, Senior, Benner) atendem fracionada **e**
lotação. Mas são ERPs de décadas, com times inteiros, que chegaram lá somando módulos
ao longo de anos — e mesmo eles tratam fracionada como módulo específico, não como
configuração.

Especialização é posição de mercado comprovada, não consolo: Vertti e Atua (nstech)
vendem TMS focado em lotação e commodities do agronegócio; Soloplan faz o mesmo para
granel.

**O concorrente real, não o genérico — registrado sem suavizar, porque muda a pergunta
de venda.** Na transportadora observada em campo, o sistema em uso é **nstech Bsoft**,
com o fiscal **já integrado**: mensagem de rejeição vem com código, suporte é por
telefone. Não é o "sistema datado" que o argumento de mercado acima descreve em geral —
Bsoft já resolveu boa parte do que dói. A fragmentação que sobra ali é outra: planilha
própria por operador (sem consolidação, ver acima), portal de terminal portuário,
gerenciadora de risco, aplicativo do banco pra cobrança. A venda não pode ser "seu
sistema é velho, troque" — precisa ser "seu sistema cobre o fiscal, mas essa
fragmentação específica continua sua dor".

**Conclusão:** os dois perfis são o destino, e a arquitetura modular já garante isso.
A v1 especializada é vendável de verdade, não rascunho.

### As duas transportadoras da consultoria

São campo de provas, não cliente sob medida. O sócio é consultor delas e pode
recomendar o uso. Modelo previsto: piloto pagando apenas os custos.

O que se aprende ali: se o sistema aguenta operação real.
O que **não** se aprende ali: se um desconhecido pagaria preço cheio. Aceitação vinda
de recomendação de consultor não é sinal de mercado. São perguntas diferentes.

Riscos do arranjo:
- **Conflito de interesse** — o sócio é pago para dar conselho isento. Mitigação:
  declarar a sociedade abertamente antes, não depois.
- **Excesso de escopo** — as duas operam os quatro perfis de carga. Espelhar operação
  complexa para vender a empresas menores leva a construir demais.

### Critério de generalização

Produto genérico não nasce genérico: nasce resolvendo um caso concreto bem e depois
removendo a especificidade. A cada funcionalidade:

> *Isso existe em toda transportadora de lotação, ou só aqui?*

Universal entra no produto. Particular vira configuração, ou não entra.

### Fonte de requisito mais valiosa

As **planilhas paralelas** do operacional. Planilha ao lado de um sistema é sempre a
mesma coisa: trabalho real que o sistema não cobre, já especificado por quem sofre a
dor. Coletar todas, com dados reais dentro.

---

## Princípios de engenharia

### Por que sistemas legados congelam

Não é a linguagem antiga. É, nesta ordem: ausência de testes (ninguém tem coragem de
mudar), regra de negócio espalhada onde não deveria estar, e **anos de customização
específica por cliente**. Cada "só para esse cliente aqui" vira amarra permanente;
depois de duzentas, não existe mais um sistema, existem duzentos.

**Stack nova não protege contra isso.** O Mash pode estar tão travado quanto os
concorrentes em três anos, escrito em TypeScript, se aceitar customização pontual para
fechar venda. A defesa principal contra virar legado é **comercial, não técnica** — e
quem estará sob pressão para dizer sim é o sócio, na frente do cliente.

### Código mantenível por IA

- Arquivos pequenos e fronteiras explícitas, para que o trecho relevante caiba numa
  janela de contexto
- Tipagem forte, para o erro aparecer antes de rodar
- Padrões repetitivos e previsíveis — IA é excelente com repetição e péssima com
  soluções espertas e únicas
- **Testes automatizados**, acima de tudo, onde o erro é caro: cálculo de frete,
  financeiro, isolamento entre clientes

### Roteiro por reversibilidade

"Roteiro perfeito, sem refatorar nada" é meta rejeitada: produz meses decidindo, zero
código, e um desenho feito para requisitos imaginados. Refatorar não é fracasso —
depende de **onde**.

| Camada | O que é | Postura |
|---|---|---|
| **1 — Concreto** | Sem conserto depois que há dado real | Toda a energia aqui. ~12 decisões |
| **2 — Estrutura** | Caro mudar, mas possível | Cuidado sem paralisia |
| **3 — Reversível** | Telas, endpoints, infra, ferramentas | Decide rápido, erra à vontade |

O arquiteto decide parede estrutural, cano e fiação antes do concreto. Não decide onde
vai o sofá.

### Demais princípios

- Uma única stack, do início ao fim
- Multi-tenant desde a primeira tabela
- Módulos com fronteira clara — nenhum acessa o banco interno do outro
- **Reservar o assento, não construir o cômodo** — custa horas agora, evita auditar o
  sistema inteiro depois
- Escopo controlado por fase: uma fatia menor e inteira vale mais que um sistema
  inteiro pela metade
- Documentação leve e contínua: toda decisão técnica importante registrada em
  `decisoes.md`
