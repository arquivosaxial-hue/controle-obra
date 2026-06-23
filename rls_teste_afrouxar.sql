-- ============================================================
--  MODO TESTE — afrouxar escrita (RLS) temporariamente
--  Construtora Axial — Painel de Obras
--
--  ⚠️  ATENÇÃO: enquanto isto estiver aplicado, QUALQUER pessoa
--      com a URL pode GRAVAR nas tabelas de avanço.
--      Use SÓ para testar. Reverta com 'rls_restaurar.sql'
--      assim que o login do operador estiver pronto.
--
--  Como usar: SQL Editor > New query > cole > RUN
-- ============================================================

-- Permite INSERT/UPDATE/DELETE sem login (anon) nas tabelas de avanço.
-- Mantém a leitura pública que já existe.

-- DRENAGEM (avanço por trecho)
drop policy if exists "escrita operador dren_avanco" on drenagem_avanco;
create policy "TESTE escrita anon dren_avanco" on drenagem_avanco
  for all using (true) with check (true);

-- PAVIMENTAÇÃO (avanço por trecho x camada)
drop policy if exists "escrita operador pav_avanco" on pavimentacao_avanco;
create policy "TESTE escrita anon pav_avanco" on pavimentacao_avanco
  for all using (true) with check (true);

-- SERVIÇOS (avanço por serviço, vindo da medição)
drop policy if exists "escrita operador av_servicos" on avanco_servicos;
create policy "TESTE escrita anon av_servicos" on avanco_servicos
  for all using (true) with check (true);

-- LANÇAMENTOS (recomposição / Iguá — produção diária por categoria)
drop policy if exists "escrita operador lancamentos" on lancamentos;
create policy "TESTE escrita anon lancamentos" on lancamentos
  for all using (true) with check (true);

-- (drenagem_trechos e pavimentacao_trechos seguem só-leitura para anon;
--  o cadastro vem do seed/Python, não da tela.)

-- ============================================================
-- Pronto. A tela do operador já consegue gravar sem login.
-- LEMBRETE: rode 'rls_restaurar.sql' depois de criar o login.
-- ============================================================
