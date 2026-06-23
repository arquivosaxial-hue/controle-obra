-- ============================================================
--  PAINEL DE OBRAS — RECOMPOSIÇÃO ASFÁLTICA
--  Esquema do banco para Supabase (PostgreSQL)
--  Construtora Axial — base inicial
--
--  Como usar:
--  1. No Supabase, abra  SQL Editor  >  New query
--  2. Cole TODO este arquivo e clique em RUN
--  3. As tabelas, views e políticas serão criadas
-- ============================================================


-- ------------------------------------------------------------
-- 1) CONTRATOS / OBRAS
--    Cada obra = um contrato de recomposição
-- ------------------------------------------------------------
create table if not exists contratos (
  id            uuid primary key default gen_random_uuid(),
  numero        text not null,                 -- ex: '4600007952'
  nome          text,                           -- ex: 'RECOMPOSIÇÃO IGUÁ' (exibido no painel)
  objeto        text,                           -- ex: 'RECOMPOSIÇÃO ASFÁLTICA'
  contratada    text default 'CONSTRUTORA AXIAL LTDA',
  tipo          text not null default 'recomposicao',  -- 'recomposicao' | 'tubos'
  ativo         boolean default true,
  criado_em     timestamptz default now()
);

comment on table contratos is 'Obras/contratos acompanhados no painel. tipo define o dashboard: recomposicao (memória de cálculo) ou tubos (metros assentados/dia)';


-- ------------------------------------------------------------
-- 2) CATÁLOGO DE ITENS DO CONTRATO
--    Os 22 itens com valor unitário (tabela de apoio)
-- ------------------------------------------------------------
create table if not exists itens_contrato (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos(id) on delete cascade,
  codigo        text not null,                 -- ex: '01.02'
  descricao     text not null,
  unidade       text default 'M2',             -- M2, M, UN, H
  valor_unit    numeric(14,4) not null default 0,
  unique (contrato_id, codigo)
);

comment on table itens_contrato is 'Catálogo de serviços do contrato com valor unitário';


-- ------------------------------------------------------------
-- 3) IMPORTAÇÕES
--    Cada upload de planilha de BM. Guarda histórico e
--    permite reprocessar / saber de onde veio cada dado.
-- ------------------------------------------------------------
create table if not exists importacoes (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid references contratos(id) on delete cascade,
  arquivo_nome    text,                          -- ex: '4600007952_BM16.xlsx'
  bm_numero       text,                          -- ex: '16'
  periodo_ini     date,
  periodo_fim     date,
  total_lancamentos int default 0,
  valor_total     numeric(16,2) default 0,
  importado_em    timestamptz default now(),
  importado_por   text                           -- email/identificação do operador
);

comment on table importacoes is 'Histórico de uploads de planilha (cada BM importado)';


-- ------------------------------------------------------------
-- 4) LANÇAMENTOS  (coração do dashboard)
--    Uma linha por serviço executado, lido da memória de cálculo
-- ------------------------------------------------------------
create table if not exists lancamentos (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid references contratos(id) on delete cascade,
  importacao_id   uuid references importacoes(id) on delete cascade,
  os              text,                          -- ordem de serviço
  data_exec       date not null,                 -- data de execução
  equipe          text,                          -- ex: 'RIO480T'
  categoria       text,                          -- 'ÁGUA' | 'ESGOTO' | 'CAPEX'
  item_codigo     text,                          -- ex: '01.02'
  servico         text,                          -- descrição do serviço
  comprimento     numeric(12,3),
  largura         numeric(12,3),
  area            numeric(14,4) default 0,       -- = comp x largura
  valor_unit      numeric(14,4) default 0,
  valor_total     numeric(16,2) default 0,       -- = area x valor_unit
  endereco        text
);

-- índices para o dashboard ficar rápido
create index if not exists idx_lanc_contrato   on lancamentos(contrato_id);
create index if not exists idx_lanc_data       on lancamentos(data_exec);
create index if not exists idx_lanc_categoria  on lancamentos(categoria);
create index if not exists idx_lanc_importacao on lancamentos(importacao_id);

comment on table lancamentos is 'Cada execução diária (linha da memória de cálculo). Fonte do dashboard de recomposição.';


-- ------------------------------------------------------------
-- 4b) TUBOS ASSENTADOS  (obras tipo 'tubos')
--     Para obras de drenagem que só registram metros/dia
-- ------------------------------------------------------------
create table if not exists tubos_diario (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid references contratos(id) on delete cascade,
  importacao_id   uuid references importacoes(id) on delete set null,
  data_exec       date not null,
  equipe          text,
  metros          numeric(12,2) not null default 0,   -- metros de tubo assentados no dia
  diametro        text,                                 -- ex: 'DN300' (opcional)
  endereco        text,
  unique (contrato_id, data_exec, equipe, diametro)
);

create index if not exists idx_tubos_contrato on tubos_diario(contrato_id);
create index if not exists idx_tubos_data     on tubos_diario(data_exec);

comment on table tubos_diario is 'Metros de tubo assentados por dia (obras de drenagem tipo tubos)';


-- ============================================================
--  VIEWS — dashboard já mastigado
-- ============================================================

-- 5a) PRODUÇÃO DIÁRIA  (área e valor por dia, por contrato)
create or replace view v_producao_diaria as
select
  contrato_id,
  data_exec,
  count(*)               as lancamentos,
  sum(area)              as area_dia,
  sum(valor_total)       as valor_dia
from lancamentos
group by contrato_id, data_exec
order by data_exec;


-- 5b) ACUMULADO DO MÊS CORRENTE (o número grande da TV)
create or replace view v_medicao_mes as
select
  contrato_id,
  date_trunc('month', data_exec)::date as mes,
  count(*)          as lancamentos,
  sum(area)         as area_mes,
  sum(valor_total)  as valor_mes
from lancamentos
group by contrato_id, date_trunc('month', data_exec);


-- 5c) POR CATEGORIA (CAPEX / ÁGUA / ESGOTO) no mês corrente
create or replace view v_por_categoria_mes as
select
  contrato_id,
  date_trunc('month', data_exec)::date as mes,
  categoria,
  count(*)          as lancamentos,
  sum(area)         as area,
  sum(valor_total)  as valor
from lancamentos
group by contrato_id, date_trunc('month', data_exec), categoria;


-- 5d) TUBOS — PRODUÇÃO DIÁRIA (obras de drenagem tipo 'tubos')
create or replace view v_tubos_diario as
select
  contrato_id,
  data_exec,
  count(*)        as registros,
  sum(metros)     as metros_dia
from tubos_diario
group by contrato_id, data_exec
order by data_exec;


-- 5e) TUBOS — ACUMULADO DO MÊS
create or replace view v_tubos_mes as
select
  contrato_id,
  date_trunc('month', data_exec)::date as mes,
  sum(metros)     as metros_mes
from tubos_diario
group by contrato_id, date_trunc('month', data_exec);


-- ============================================================
--  SEGURANÇA (Row Level Security)
--  TV = somente leitura (anônimo)  |  Operador = grava (logado)
-- ============================================================
alter table contratos       enable row level security;
alter table itens_contrato  enable row level security;
alter table importacoes     enable row level security;
alter table lancamentos     enable row level security;
alter table tubos_diario    enable row level security;

-- LEITURA: liberada para todos (a TV abre sem login)
create policy "leitura publica contratos"   on contratos      for select using (true);
create policy "leitura publica itens"        on itens_contrato for select using (true);
create policy "leitura publica importacoes"  on importacoes    for select using (true);
create policy "leitura publica lancamentos"  on lancamentos    for select using (true);
create policy "leitura publica tubos"        on tubos_diario   for select using (true);

-- ESCRITA: somente usuários autenticados (operador logado)
create policy "escrita operador contratos"   on contratos      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador itens"        on itens_contrato for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador importacoes"  on importacoes    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador lancamentos"  on lancamentos    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador tubos"        on tubos_diario   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-- ============================================================
--  REALTIME — TV atualiza sozinha quando chega lançamento novo
-- ============================================================
alter publication supabase_realtime add table lancamentos;
alter publication supabase_realtime add table importacoes;
alter publication supabase_realtime add table tubos_diario;


-- ============================================================
--  DADOS INICIAIS — seu contrato real
-- ============================================================
insert into contratos (numero, nome, objeto, tipo)
values ('4600007952', 'RECOMPOSIÇÃO IGUÁ', 'RECOMPOSIÇÃO ASFÁLTICA', 'recomposicao')
on conflict do nothing;

-- ============================================================
--  FIM
--  Próximo passo: o importador da planilha (Python) que lê a
--  memória de cálculo e popula 'importacoes' + 'lancamentos'.
-- ============================================================


-- ############################################################
-- ############################################################
--   EXTENSÃO (trechos + avanço por trecho/camada + serviços)
--   Tudo abaixo depende das tabelas criadas acima.
-- ############################################################
-- ############################################################

-- ============================================================
--  PAINEL DE OBRAS — EXTENSÃO DO SCHEMA
--  Construtora Axial
--
--  Acrescenta ao schema existente (contratos, itens_contrato,
--  importacoes, lancamentos, tubos_diario) o que faltava:
--    • obras de drenagem/pavimentação georreferenciadas
--    • avanço por TRECHO de drenagem (% por trecho PV→PV)
--    • avanço por TRECHO × CAMADA de pavimentação
--    • view consolidada para a TV
--
--  COMO USAR:
--  1. Rode PRIMEIRO o supabase_schema.sql original (se ainda não rodou)
--  2. SQL Editor > New query > cole ESTE arquivo > RUN
--  3. É idempotente: pode rodar de novo sem quebrar (if not exists)
--
--  Convenção de papéis (igual ao schema original):
--    • leitura: pública (true)        -> a TV lê sem login
--    • escrita: authenticated         -> só operador logado grava
-- ============================================================


-- ------------------------------------------------------------
-- A) Campos extras em 'contratos' p/ obras com mapa
--    (orgao, bairro, centro do mapa). Tudo opcional.
-- ------------------------------------------------------------
alter table contratos add column if not exists orgao   text;        -- ex: 'SEIOP'
alter table contratos add column if not exists bairro  text;        -- ex: 'Bairro de Fátima'
alter table contratos add column if not exists tem_mapa boolean default false;
alter table contratos add column if not exists mapa_lat numeric(10,7);  -- centro do mapa
alter table contratos add column if not exists mapa_lng numeric(10,7);
alter table contratos add column if not exists mapa_zoom int default 17;


-- ------------------------------------------------------------
-- B) TRECHOS DE DRENAGEM (a rede do mapa, por contrato)
--    Geometria simples como GeoJSON em jsonb (sem exigir PostGIS).
--    1 linha = 1 trecho PV→PV.
-- ------------------------------------------------------------
create table if not exists drenagem_trechos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos(id) on delete cascade,
  codigo        text not null,                  -- ex: 'PV-20->PV-19'
  pv_jusante    text,                            -- ex: 'PV-20'
  pv_montante   text,                            -- ex: 'PV-19'
  logradouro    text,
  tipo          text default 'tubo',             -- 'tubo' | 'ralo' | 'pv'
  diametro_m    numeric(6,3),
  extensao_m    numeric(10,2),
  geojson       jsonb,                           -- {"type":"LineString","coordinates":[...]}
  ordem         int default 0,
  unique (contrato_id, codigo)
);
comment on table drenagem_trechos is 'Trechos georreferenciados da rede de drenagem (cadastro/projeto). Avanço fica em drenagem_avanco.';


-- ------------------------------------------------------------
-- C) AVANÇO DE DRENAGEM POR TRECHO (0–100% por trecho)
--    Mantém o último valor por trecho + quem/quando.
-- ------------------------------------------------------------
create table if not exists drenagem_avanco (
  id            uuid primary key default gen_random_uuid(),
  trecho_id     uuid references drenagem_trechos(id) on delete cascade,
  pct           int not null default 0 check (pct between 0 and 100),
  obs           text,
  atualizado_por text,
  atualizado_em timestamptz default now(),
  unique (trecho_id)                              -- 1 estado atual por trecho
);
comment on table drenagem_avanco is 'Estado atual de execução de cada trecho de drenagem (pintura no mapa).';


-- ------------------------------------------------------------
-- D) TRECHOS DE PAVIMENTAÇÃO (ruas divididas em segmentos)
--    1 linha = 1 segmento (~50 m) de uma rua.
-- ------------------------------------------------------------
create table if not exists pavimentacao_trechos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos(id) on delete cascade,
  codigo        text not null,                  -- ex: 'IVAIR-T3'
  rua           text not null,
  trecho_num    int,
  n_trechos     int,
  larg_caixa_m  numeric(6,2),
  ext_seg_m     numeric(10,2),
  esp_cbuq_m    numeric(6,3),
  esp_base_m    numeric(6,3),
  esp_subbase_m numeric(6,3),
  geojson       jsonb,                           -- LineString do eixo do segmento
  poligono      jsonb,                           -- Polygon do asfalto (faixa)
  ordem         int default 0,
  unique (contrato_id, codigo)
);
comment on table pavimentacao_trechos is 'Segmentos de rua para pavimentação. Avanço por camada fica em pavimentacao_avanco.';


-- ------------------------------------------------------------
-- E) AVANÇO DE PAVIMENTAÇÃO POR TRECHO × CAMADA
--    camada: subleito | subbase | base | meiofio | calcada | cbuq
-- ------------------------------------------------------------
create table if not exists pavimentacao_avanco (
  id            uuid primary key default gen_random_uuid(),
  trecho_id     uuid references pavimentacao_trechos(id) on delete cascade,
  camada        text not null check (camada in
                  ('subleito','subbase','base','meiofio','calcada','cbuq')),
  pct           int not null default 0 check (pct between 0 and 100),
  atualizado_por text,
  atualizado_em timestamptz default now(),
  unique (trecho_id, camada)                      -- 1 estado por trecho+camada
);
comment on table pavimentacao_avanco is 'Estado atual de cada camada de serviço por segmento de rua.';


-- ------------------------------------------------------------
-- F) AVANÇO POR SERVIÇO (% do dashboard, vindo da medição)
--    Vale para qualquer obra. Atualizado a cada importação.
-- ------------------------------------------------------------
create table if not exists avanco_servicos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos(id) on delete cascade,
  importacao_id uuid references importacoes(id) on delete set null,
  item          int,
  servico       text not null,
  valor_contrato numeric(16,2),
  medido_acum   numeric(16,2),
  pct           numeric(6,2),
  atualizado_em timestamptz default now(),
  unique (contrato_id, servico)
);
comment on table avanco_servicos is 'Percentual de avanço por serviço (medido ÷ contrato), por obra. Alimenta o dashboard de % e os KPIs.';


-- ------------------------------------------------------------
-- G) RLS — ligar em todas as novas tabelas
-- ------------------------------------------------------------
alter table drenagem_trechos       enable row level security;
alter table drenagem_avanco        enable row level security;
alter table pavimentacao_trechos   enable row level security;
alter table pavimentacao_avanco    enable row level security;
alter table avanco_servicos        enable row level security;

-- leitura pública (TV)
create policy "leitura publica dren_trechos"  on drenagem_trechos     for select using (true);
create policy "leitura publica dren_avanco"   on drenagem_avanco      for select using (true);
create policy "leitura publica pav_trechos"   on pavimentacao_trechos for select using (true);
create policy "leitura publica pav_avanco"    on pavimentacao_avanco  for select using (true);
create policy "leitura publica av_servicos"   on avanco_servicos      for select using (true);

-- escrita só operador logado
create policy "escrita operador dren_trechos" on drenagem_trechos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador dren_avanco"  on drenagem_avanco
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador pav_trechos"  on pavimentacao_trechos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador pav_avanco"   on pavimentacao_avanco
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "escrita operador av_servicos"  on avanco_servicos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-- ------------------------------------------------------------
-- H) REALTIME — a TV recebe mudanças sem recarregar
-- ------------------------------------------------------------
alter publication supabase_realtime add table drenagem_avanco;
alter publication supabase_realtime add table pavimentacao_avanco;
alter publication supabase_realtime add table avanco_servicos;


-- ------------------------------------------------------------
-- I) VIEW consolidada p/ a TV ler o avanço da drenagem
--    junta projeto + estado atual num só lugar.
-- ------------------------------------------------------------
create or replace view v_drenagem as
select t.contrato_id, t.codigo, t.pv_jusante, t.pv_montante, t.logradouro,
       t.tipo, t.diametro_m, t.extensao_m, t.geojson,
       coalesce(a.pct, 0) as pct, a.atualizado_em
from drenagem_trechos t
left join drenagem_avanco a on a.trecho_id = t.id;

create or replace view v_pavimentacao as
select t.contrato_id, t.codigo, t.rua, t.trecho_num, t.n_trechos,
       t.larg_caixa_m, t.ext_seg_m, t.geojson, t.poligono,
       coalesce(jsonb_object_agg(a.camada, a.pct) filter (where a.camada is not null), '{}'::jsonb) as camadas
from pavimentacao_trechos t
left join pavimentacao_avanco a on a.trecho_id = t.id
group by t.id;

-- ============================================================
-- FIM DA EXTENSÃO
-- ============================================================
