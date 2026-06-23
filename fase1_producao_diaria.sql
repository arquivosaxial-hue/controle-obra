-- ============================================================
--  FASE 1 — Fundação de dados: produção diária em METROS
--  Construtora Axial — Painel de Obras
--
--  Cria o registro de quanto foi executado POR TRECHO, POR DIA,
--  em metros (o operador digita o do dia; o sistema soma).
--  Isto destrava: produção do dia anterior, histórico, Real x Medido.
--
--  Seguro rodar mais de uma vez (if not exists / drop-create em views).
--  Como usar: SQL Editor > New query > cole > RUN
-- ============================================================

-- ------------------------------------------------------------
-- 1) Produção diária de drenagem (metros executados por dia)
-- ------------------------------------------------------------
create table if not exists drenagem_producao_dia (
  id            uuid primary key default gen_random_uuid(),
  trecho_id     uuid references drenagem_trechos(id) on delete cascade,
  data_exec     date not null default current_date,
  metros_dia    numeric(10,2) not null default 0,   -- metros feitos NAQUELE dia
  atualizado_por text,
  atualizado_em timestamptz default now(),
  unique (trecho_id, data_exec)                      -- 1 registro por trecho por dia
);
comment on table drenagem_producao_dia is
  'Metros de drenagem executados por trecho a cada dia. O acumulado é a soma destes.';

alter table drenagem_producao_dia enable row level security;
drop policy if exists "leitura publica dren_prod" on drenagem_producao_dia;
create policy "leitura publica dren_prod" on drenagem_producao_dia for select using (true);
-- escrita liberada para teste (sem login). Restaurar depois.
drop policy if exists "TESTE escrita anon dren_prod" on drenagem_producao_dia;
create policy "TESTE escrita anon dren_prod" on drenagem_producao_dia
  for all using (true) with check (true);

-- realtime (protegido contra rodar duas vezes)
do $$
begin
  begin
    alter publication supabase_realtime add table drenagem_producao_dia;
  exception when duplicate_object then null;
  end;
end $$;

-- ------------------------------------------------------------
-- 2) View: acumulado por trecho (soma dos dias) + pct derivado
-- ------------------------------------------------------------
create or replace view v_drenagem_acum as
select
  t.id                                   as trecho_id,
  t.contrato_id,
  t.codigo,
  t.extensao_m,
  coalesce(sum(p.metros_dia), 0)         as metros_exec,
  case when t.extensao_m > 0
       then least(100, round( coalesce(sum(p.metros_dia),0) / t.extensao_m * 100 ))
       else 0 end                        as pct
from drenagem_trechos t
left join drenagem_producao_dia p on p.trecho_id = t.id
group by t.id;

-- ------------------------------------------------------------
-- 3) View: produção por DIA (todas as obras) — para "dia anterior"
-- ------------------------------------------------------------
create or replace view v_drenagem_por_dia as
select
  t.contrato_id,
  p.data_exec,
  sum(p.metros_dia)                      as metros_dia
from drenagem_producao_dia p
join drenagem_trechos t on t.id = p.trecho_id
group by t.contrato_id, p.data_exec;

-- ============================================================
-- Pronto. A partir daqui o operador pode gravar metros por dia,
-- e o sistema sabe o acumulado, o pct e a produção de cada dia.
-- ============================================================
