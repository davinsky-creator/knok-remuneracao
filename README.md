# Knok Remuneração

Dashboard local para sincronizar turnos visíveis no calendário Knok e calcular uma estimativa mensal.

## Versão 2.3.0

### Princípios
- **Sem OCR** no fluxo principal.
- **Sem leitura remota do URL Knok**: a sessão autenticada é lida apenas pela extensão no domínio `doctors.knokcare.com`.
- **Sincronização segura**: leituras incompletas nunca apagam turnos existentes automaticamente.
- **Assistente de importação**: escolha guiada entre extensão Knok e CSV/texto.
- **Revisão integral**: todas as importações mostram turnos novos, iguais, alterados e a remover antes de guardar.
- **Calendário mensal**: grelha visual com turnos diurnos, noturnos e mistos, horário e estimativa.
- **Tarifa por turno**: cada turno pode usar €10, €12 ou €16, mantendo uma tarifa padrão mensal.
- **Estado financeiro**: acompanhamento entre valor estimado, confirmado e pago, com diferença, data e notas.
- **Idempotência**: voltar a sincronizar o mesmo calendário não cria duplicados.
- **Recuperação**: undo da última alteração, exportação e restauro de backup JSON.
- **Privacidade partilhada**: limpeza explícita de todos os dados locais para outra pessoa usar o mesmo dispositivo.
- **Fallback em memória**: a interface continua utilizável quando o browser bloqueia o armazenamento local.
- **Dados locais**: o dashboard guarda os dados em `localStorage`.
- **PWA**: recursos principais disponíveis offline depois da primeira visita.

## Cálculo
- 00:00–07:00: €13/h.
- Restantes horas: tarifa diurna selecionável (€10/€12/€16), por turno ou através do valor padrão do mês.
- Turnos que passam a meia-noite são tratados como turno contínuo para o dia seguinte.
- Início e fim iguais são rejeitados para evitar interpretar acidentalmente 24 horas.

## Verificação

```bash
npm run verify
```

Inclui:
- testes unitários do motor de cálculo e parser;
- testes da lógica partilhada pela extensão;
- verificação de sintaxe JS;
- verificação de integridade de assets/manifestos.

Caso de referência de setembro de 2026:
- 18 turnos
- 51 h totais
- 35 h noturnas
- 16 h diurnas
- €647 a €12/h diurnos

## Estrutura

```text
.
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── vercel.json
├── src/
│   ├── app.js
│   └── core.mjs
├── extension/
│   ├── manifest.json
│   ├── shared.js
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── tests/
└── .github/workflows/ci.yml
```

## Política de releases

1. Alterar código.
2. Executar `npm run verify`.
3. Commit Git.
4. Push para GitHub `main`.
5. Vercel Preview.
6. Validar Preview.
7. Vercel Production.

O push GitHub depende de o repositório estar criado e autorizado à integração GitHub.
