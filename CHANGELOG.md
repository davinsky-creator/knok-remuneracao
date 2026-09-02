# Changelog

## 2.2.0 - 2026-09-02
- botão para limpar todos os dados locais e preparar o dashboard para outro utilizador;
- funcionamento em memória quando o `localStorage` está bloqueado;
- teste de integridade compatível com Windows e Linux;
- renovação do cache da PWA para distribuir imediatamente a nova versão.

## 2.1.0 - 2026-09-02
- sincronização segura em leituras incompletas;
- revisão explícita antes de remover turnos existentes;
- diagnóstico da extensão: células, eventos interpretados e não interpretados;
- parser mais tolerante a `04...`, `04…` e horários truncados;
- rejeição de turnos com início e fim iguais;
- botão de desfazer última alteração;
- backup/restauro JSON;
- PWA com service worker e ícones;
- headers de segurança Vercel;
- 13 testes automatizados e verificação de integridade;
- extensão atualizada para 2.1.0 com service worker de background.
