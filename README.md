# Theus Studio

Aplicativo instalável para agendamento de barbearia. O cliente entra com e-mail e senha para agendar, remarcar e consultar suas reservas. O barbeiro usa um endereço separado para acessar a agenda, o catálogo, o expediente e os benefícios.

Para retomar o projeto em outro computador, veja [CONTINUAR.md](CONTINUAR.md).

## Rodar localmente

Pré-requisitos: Node.js 22 ou superior, npm e Docker Desktop em execução.

1. Rode `npm ci` e `npx supabase start`. Para atualizar um ambiente local existente, use `npm run db:migrate`. Reinicie o Supabase após alterar a configuração ou os modelos de e-mail.
2. Copie `.env.example` para `.env.local`. Use a URL e a chave publicável do Supabase local, além da conexão PostgreSQL mostrada em `npx supabase status`. Mantenha dois endereços distintos: `APP_ORIGIN=http://localhost:3000` para o app e `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` para o Supabase.
3. Se quiser dados fictícios, rode `npm run db:demo` em um banco local vazio. A demonstração inclui reservas vinculadas a `cliente@example.com`. Cadastre a conta com esse e-mail para acessá-las.
4. Rode `npm run dev` e abra [Theus Studio](http://localhost:3000/). Os e-mails de confirmação e recuperação chegam no [Mailpit](http://127.0.0.1:54324/).

Para o barbeiro, crie ou recupere a senha da conta no Supabase Auth. Copie o UUID do usuário confirmado para `ADMIN_USER_IDS`, usando vírgulas se houver mais de um responsável. Mantenha esse valor no servidor. Valide o login com a nova senha antes da troca e entregue o link [do painel](http://localhost:3000/admin) diretamente ao barbeiro.

## Publicar e migrar o acesso

1. Aplique as migrações no ambiente Supabase com `npx supabase db push`. As reservas, os clientes e os benefícios existentes são preservados. A instalação da versão anterior continua compatível com a migração aditiva do banco.
2. Configure o Supabase Auth com confirmação de e-mail, senha mínima de 8 caracteres e SMTP. Em **Confirm signup** e **Reset password**, instale os modelos de `supabase/templates/confirmation.html` e `supabase/templates/recovery.html`. Em **Site URL**, use a origem HTTPS do app. Autorize exatamente os endereços `/confirmar-email`, `/redefinir-senha` e `/admin/redefinir-senha` da origem do app.
3. Copie o ID Supabase da conta existente do barbeiro para `ADMIN_USER_IDS`. Confirme que a conta consegue entrar com senha no ambiente de validação. Defina `APP_ORIGIN` e as demais variáveis de `.env.example` no host Node. Use SSL na conexão com o PostgreSQL.
4. Rode `npm ci`, `npm run build` e `npm start`. Clientes que utilizavam código podem usar **Esqueci a senha** com o mesmo e-mail. A sessão desta versão exige uma entrada com senha. Se for preciso voltar à versão anterior, restaure também a configuração de Auth, os modelos de e-mail e a variável de acesso administrativo daquela versão.

Cadastre os serviços, horários e preços reais pelo painel antes de divulgar. A cobrança da assinatura é registrada manualmente.

Em **Ofertas**, o barbeiro pode editar o nome, a descrição e o preço mensal do plano. Desmarcar a exibição fecha novas adesões. Assinantes continuam com a validade e o histórico de pagamentos do cadastro. Renovações registradas usam a mensalidade configurada no momento da renovação.

Use **Nova campanha** para agendar um desconto ou divulgar a fidelidade e a assinatura. A campanha tem início e fim no horário de São Paulo. Descontos valem para reservas dentro da vigência, são calculados pelo servidor e não acumulam com recompensa de fidelidade nem com cobertura da assinatura.

## PWA e Web Push

O Chrome oferece a instalação quando o app atende aos requisitos. No Safari do iPhone, use **Compartilhar → Adicionar à Tela de Início**. A tela sem conexão fica disponível por meio do service worker. Consultas e reservas precisam de conexão.

Para habilitar as notificações, gere chaves com `npx web-push generate-vapid-keys`. Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (um contato operacional `mailto:`) e `PUSH_JOB_SECRET` (um segredo aleatório). Agende uma chamada a cada cinco minutos no servidor para `POST /api/jobs/push` com `Authorization: Bearer <PUSH_JOB_SECRET>`. As notificações são ativadas por dispositivo em **Conta**. O iPhone exige que o PWA esteja instalado para pedir permissão.

Para receber campanhas, o cliente também ativa **Receber promoções e novidades neste dispositivo**. A mesma tarefa agendada enfileira campanhas no início da vigência e envia aos dispositivos inscritos.

## Verificar

- `npm test` valida regras de sessão, calendário e notificações.
- `npm run typecheck` valida os tipos e `npm run build` compila o aplicativo.
- `npm run test:db` cobre concorrência, autorização, benefícios e reprogramação de lembretes. Crie um banco separado chamado `theus_studio_test` e configure `STUDIO_TEST_DATABASE_URL`. O teste cria e remove seu próprio esquema.

~~~powershell
docker exec supabase_db_barbearia createdb -U postgres theus_studio_test
$env:STUDIO_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/theus_studio_test'
npm run test:db
~~~
