# Technical Challenge — Distributed Wagering Processor

**Desafio técnico — Jungle Gaming 🦧**

## Sobre o projeto

Este projeto foi desenvolvido como parte do desafio técnico proposto pela Jungle Gaming, com o objetivo de construir um serviço de processamento distribuído de transações financeiras de apostas.

A proposta envolve desafios importantes de engenharia de software, como precisão monetária, concorrência, idempotência persistente, consistência entre saldo e ledger, processamento assíncrono e recuperação após falhas.

Durante o desenvolvimento, utilizei ferramentas de inteligência artificial como apoio para acelerar a implementação, organizar a arquitetura, explorar soluções técnicas e auxiliar na criação e validação de testes.

Como o prazo de entrega é hoje, **o projeto ainda não está completamente implementado**. Estou entregando o estado atual do desenvolvimento, com as partes construídas, os testes executados e os pontos que ainda precisam ser finalizados.

## Tecnologias

O projeto foi desenvolvido considerando a stack proposta no desafio:

- **Bun:** runtime, gerenciamento de pacotes e execução de testes.
- **TypeScript:** linguagem principal, com verificação de tipos.
- **NestJS:** framework para a estrutura da aplicação.
- **PostgreSQL:** banco de dados relacional para persistência e integridade dos dados.
- **AWS SQS:** mensageria para processamento assíncrono.
- **Docker Compose:** ambiente local para execução dos serviços.

A implementação de todos os componentes e integrações previstos ainda não está concluída.

## Organização da arquitetura

Estruturei o projeto em blocos, buscando separar responsabilidades e facilitar a evolução da solução.

A organização considera áreas como:

- **Domínio:** modelagem das entidades, objetos de valor e regras de negócio.
- **Aplicação:** organização dos casos de uso.
- **Infraestrutura:** persistência e integrações externas.
- **API:** entrada de requisições e comunicação com os clientes.
- **Mensageria:** processamento assíncrono e comunicação por eventos.
- **Testes:** validação das regras e do comportamento dos componentes.

Essa estrutura foi pensada para reduzir o acoplamento e facilitar a manutenção. Entretanto, a arquitetura ainda precisa ser integrada e validada como um fluxo completo.

## Precisão monetária

Um dos requisitos mais importantes do desafio é evitar erros de arredondamento e perda de precisão em operações financeiras.

O contrato monetário especificado pelo desafio utiliza strings decimais e identifica explicitamente a moeda:

```json
{
  "amount": "25.00",
  "currency": "BRL"
}
```

As regras que orientam essa modelagem incluem:

- Representar valores monetários com duas casas decimais.
- Evitar `number`, `float` e `double` como representação monetária no domínio.
- Rejeitar entradas inválidas, notação científica e valores com mais de duas casas decimais.
- Impedir operações entre moedas incompatíveis.
- Preservar a exatidão dos valores durante os cálculos e a persistência.
- Utilizar um objeto de valor `Money` imutável.

**Importante:** essas regras fazem parte dos requisitos do desafio e da modelagem planejada. A implementação e a validação integral de todas elas ainda precisam ser concluídas.

## Persistência e consistência financeira

O PostgreSQL faz parte da solução planejada para garantir persistência confiável e aplicar restrições de integridade diretamente no banco de dados.

O desenho considera:

- Unicidade de carteiras por jogador e moeda.
- Persistência das chaves de idempotência.
- Integridade entre carteiras, transações e lançamentos financeiros.
- Controle de concorrência nas alterações de saldo.
- Registro auditável dos lançamentos do ledger.
- Transações SQL para manter consistentes as alterações relacionadas.
- Migrations versionadas para evolução do schema.

A solução final ainda precisa garantir e demonstrar que o saldo materializado corresponde ao saldo reconstruído pelo ledger em todos os cenários relevantes.

## Regras de negócio previstas

O desafio contempla cinco tipos principais de operações:

| Operação | Comportamento esperado |
|---|---|
| `BET` | Debitar o valor da aposta, respeitando o saldo disponível. |
| `WIN` | Creditar o valor do ganho. |
| `LOSS` | Registrar o resultado sem movimentar o saldo. |
| `REFUND` | Reverter uma aposta processada, respeitando as regras de referência. |
| `ROLLBACK` | Reverter uma operação elegível, respeitando as regras do domínio. |

Essas operações precisam respeitar as referências entre transações, as regras de idempotência, os limites de saldo e a consistência do ledger.

A implementação do caso de uso central de submissão de transações ainda é uma das principais etapas pendentes. Esse componente deverá coordenar as regras de negócio, a idempotência, o controle de concorrência e a persistência atômica dos registros envolvidos.

## Testes executados

Durante o desenvolvimento, executei verificações de tipagem e testes automatizados.

Resultados obtidos na execução relatada:

- **Typecheck:** sem erros.
- **109 testes unitários:** executados.
- **23 testes de integração:** executados com PostgreSQL real.
- Cenários de inbox e outbox incluídos nos testes de integração.
- Cenário com dois publishers concorrentes incluído.
- Cenários de atomicidade incluídos.

Esses resultados representam o estado dos testes executados até o momento. A aprovação dos testes existentes não significa que todos os requisitos do desafio estejam implementados ou que o sistema completo esteja validado.

Ainda é necessário concluir a integração dos casos de uso e ampliar a validação de cenários de concorrência, idempotência, falhas de infraestrutura e recuperação de processamento.

## Uso de inteligência artificial

Utilizei ferramentas de inteligência artificial como apoio durante o desenvolvimento para agilizar tarefas, estruturar componentes, auxiliar na implementação e apoiar a elaboração e execução dos testes.

A utilização dessas ferramentas não elimina a necessidade de compreender, revisar e validar as decisões técnicas. Por isso, considero importante distinguir os componentes já desenvolvidos dos requisitos que ainda precisam ser implementados e comprovados.

## Limitações e próximos passos

Devido ao prazo de entrega, algumas partes do desafio permanecem incompletas.

As principais etapas para continuidade do projeto são:

1. Finalizar o caso de uso de submissão de transações.
2. Integrar as regras de `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`.
3. Consolidar a idempotência persistente e o tratamento de payloads conflitantes.
4. Garantir o controle de concorrência por carteira.
5. Concluir a atomicidade entre saldo, ledger, inbox e outbox.
6. Validar o processamento por SQS, incluindo retries, DLQ e recuperação após falhas.
7. Ampliar os testes com múltiplas instâncias e cenários de concorrência real.
8. Documentar as decisões de arquitetura, os trade-offs e as limitações restantes.

## Considerações finais

Desenvolvi este projeto como uma oportunidade de aplicar conhecimentos de desenvolvimento backend e aprofundar o entendimento sobre sistemas distribuídos e processamento financeiro.

Mesmo sem concluir todo o escopo dentro do prazo, busquei estruturar a solução de forma organizada, validar os componentes desenvolvidos e identificar os principais desafios técnicos que precisam ser resolvidos.

Prefiro apresentar com transparência o estado atual da implementação, reconhecendo o que foi realizado e o que ainda precisa ser finalizado, em vez de afirmar que todos os requisitos foram atendidos sem a devida comprovação.

**Status:** projeto em desenvolvimento — entrega do estado atual para avaliação técnica.

