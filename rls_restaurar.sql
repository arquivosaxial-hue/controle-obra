-- ============================================================
--  RESTAURAR SEGURANÇA — voltar escrita a "só operador logado"
--  Construtora Axial — Painel de Obras
--
--  Rode isto DEPOIS de criar o login do operador, para desfazer
--  o 'rls_teste_afrouxar.sql'. A partir daqui, gravar exige login.
--
--  Como usar: SQL Editor > New query > cole > RUN
-- ============================================================

-- DRENAGEM
drop policy if exists "TESTE escrita anon dren_avanco" on drenagem_avanco;
create policy "escrita operador dren_avanco" on drenagem_avanco
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PAVIMENTAÇÃO
drop policy if exists "TESTE escrita anon pav_avanco" on pavimentacao_avanco;
create policy "escrita operador pav_avanco" on pavimentacao_avanco
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- SERVIÇOS
drop policy if exists "TESTE escrita anon av_servicos" on avanco_servicos;
create policy "escrita operador av_servicos" on avanco_servicos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- LANÇAMENTOS
drop policy if exists "TESTE escrita anon lancamentos" on lancamentos;
create policy "escrita operador lancamentos" on lancamentos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Segurança restaurada: TV lê, operador logado grava.
-- ============================================================
