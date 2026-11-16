# Continuar a Theus Studio em outro computador

## 1. Abrir o projeto

Instale Git, Node.js 22 ou superior e Docker Desktop. No GitHub, use uma conta com acesso a este repositório. Abra a pasta clonada no Codex ou no editor.

~~~bash
git clone https://github.com/GabrielLuizFreireGomes/theus-studio.git
cd theus-studio
npm ci
npx supabase start
~~~

O Supabase local carrega as migrações de `supabase/migrations` ao iniciar. Em um banco local que já estiver em uso, aplique migrações novas com `npm run db:migrate`.

## 2. Configurar o ambiente local

Copie `.env.example` para `.env.local`. No Windows, use `Copy-Item .env.example .env.local`. No macOS ou Linux, use `cp .env.example .env.local`. Rode `npx supabase status` para consultar a URL da API, a chave publicável e o endereço do PostgreSQL.

| Variável | Valor ou origem |
| --- | --- |
| `APP_ORIGIN` | `http://localhost:3000` |
| `DATABASE_URL` | Endereço **DB URL** do Supabase local |
| `NEXT_PUBLIC_SUPABASE_URL` | Endereço **API URL** do Supabase local |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave **Publishable** do Supabase local |
| `ADMIN_USER_IDS` | UUID da conta autorizada a usar o painel |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `PUSH_JOB_SECRET` | Preencha quando for configurar Web Push |

~~~bash
npm run dev
~~~

- [App do cliente](http://localhost:3000/) abre em login ou cadastro.
- [Painel do barbeiro](http://localhost:3000/admin) usa o login separado.
- [Mailpit](http://127.0.0.1:54324/) recebe os e-mails locais de confirmação e recuperação.

Para liberar o painel, cadastre uma conta, confirme o endereço pelo Mailpit e copie o **User UID** no Supabase Studio local, em **Authentication → Users**. Coloque o UUID em `ADMIN_USER_IDS` e reinicie `npm run dev`. O painel consulta esse UUID no servidor.

**Dados de teste.** Em um banco local vazio, `npm run db:demo` cria um catálogo, expediente e horários fictícios. Para abrir os horários do cliente de demonstração, cadastre e confirme `cliente@example.com`. Para usar dados próprios, cadastre os serviços e o expediente pelo painel.

**Dados existentes.** Este repositório leva o código, as migrações e a demonstração. Contas, reservas e configurações mantidas no Docker do primeiro PC ficam naquele banco. Para recuperá-las em outro ambiente, faça uma transferência separada do banco, incluindo os usuários do Supabase Auth para preservar seus UUIDs. Caso já use um projeto Supabase hospedado, use as credenciais desse mesmo projeto no novo computador pelo canal seguro em que elas são mantidas.

## 3. Entender o que já funciona

- O cliente cria conta com senha de pelo menos 8 caracteres, confirma o e-mail e entra para agendar. **Meus horários** contém histórico, remarcação, cancelamento e assinatura.
- O barbeiro usa a agenda por dia ou semana. A visualização padrão mostra agendados e concluídos. Cancelados têm filtro próprio. A conclusão é manual e o backend calcula a disponibilidade pela duração real do atendimento.
- **Clientes** tem busca por nome ou e-mail, filtro por assinatura e edição de dados de contato. O pagamento e as ações de agenda usam confirmações em modais.
- **Ofertas** permite alterar nome, descrição e mensalidade do plano e fechar novas adesões. Assinantes ativos continuam com o plano e a validade registrados. Campanhas têm início, fim e tipo. O desconto em serviço é aplicado no resumo quando a reserva se enquadra na vigência.
- A instalação PWA tem manifesto e tela offline. O app agenda a publicação de campanhas por data. A fila de push promocional usa o consentimento de cada dispositivo em **Conta**.

As telas estão em `app` e `components`. As regras de agenda, cobrança, ofertas e permissões ficam em `lib`. A API principal é `app/api/studio/route.ts`. Veja [README.md](README.md) para publicar com SMTP, HTTPS e a tarefa de notificações.

## 4. Verificar antes de continuar

~~~bash
npm test
npm run build
~~~

Os testes de integração usam um banco separado chamado `theus_studio_test`. Crie-o uma vez no Supabase local e rode `npm run test:db` com `STUDIO_TEST_DATABASE_URL` apontando para ele. O [README](README.md#verificar) tem o comando para PowerShell.

No navegador, passe por cadastro, confirmação por e-mail, agendamento, remarcação e cancelamento. No painel, verifique os filtros da semana, a conclusão manual e o fluxo **pedido de assinatura → registro de pagamento → assinatura ativa**. Uma reserva de 25 minutos que começa às 09:00 deve impedir a das 09:15. Às 09:30 começa o próximo horário da grade, se estiver livre.

As duas gravações mais recentes mostram cadastro com conta fictícia, agendamento, painel e campanhas.

- [Showdown no celular, com toques destacados](docs/showdown/celular.mp4)
- [Showdown no computador](docs/showdown/computador.mp4)

## 5. Retomar os pontos de produção

1. Configurar o Supabase de produção, SMTP, a origem HTTPS e o UUID da conta do barbeiro.
2. Configurar as chaves VAPID e um agendador que chame `POST /api/jobs/push` conforme o README. A fila promocional foi testada com consentimento. A entrega real pelo provedor precisa ser validada no ambiente publicado.
3. Concluir o teste de instalação do PWA e de notificações em aparelhos Android e iPhone. Os testes locais cobriram o manifesto, a tela offline e a exibição de um push simulado no Chrome.
