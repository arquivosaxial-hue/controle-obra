# Painel de Obras — Construtora Axial

Sistema de acompanhamento de obras com **tela do operador** (registra avanço),
**tela da diretoria/TV** (só exibe, alterna sozinha) e **importação de medição**
(o upload da planilha atualiza a produção).

Dois tipos de obra:
- **Drenagem/Pavimentação** (ex.: Barra do Piraí) — tem mapa georreferenciado.
- **Recomposição** (ex.: Iguá) — só dashboard, sem mapa.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `importar-medicao.html` | Operador escolhe a obra e envia a planilha |
| `operador.html` | Registra avanço: drenagem (trecho) + pavimentação (trecho×camada) |
| `diretoria-tv.html` | Tela de TV: alterna mapa drenagem / pavimentação / dashboard |
| `diretoria-igua.html` | Dashboard da Iguá (recomposição, sem mapa) |
| `supabase_schema.sql` | Schema base (contratos, importações, lançamentos) |
| `supabase_schema_extensao.sql` | **NOVO** — trechos + avanço por trecho/camada + serviços |
| `importar_supabase.py` | Popula o banco com os dados reais (seed) |
| `rede_reconstruida_pv.geojson`, `pav_bundle.json`, `avanco_servicos.json` | Dados reais |

---

## Passo 1 — Supabase (banco)

> Você já tem conta. Estas ações são suas (envolvem login/credenciais).

1. Crie um projeto novo (ou use um existente). Anote a **senha do banco**.
2. Menu **SQL Editor → New query**.
3. Cole TODO o `supabase_schema.sql` e clique **RUN**.
4. New query de novo → cole TODO o `supabase_schema_extensao.sql` → **RUN**.
5. Em **Project Settings → API**, copie:
   - **Project URL** (ex.: `https://xxxx.supabase.co`)
   - **anon public** key (essa vai no front)
   - **service_role** key (essa é SECRETA — só no seed local, nunca no GitHub)

### Popular com os dados reais (seed)
No seu computador, com Python:
```bash
pip install supabase
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE="cole-a-service-role-aqui"
python importar_supabase.py \
  --dren rede_reconstruida_pv.geojson \
  --pav  pav_bundle.json \
  --serv avanco_servicos.json \
  --ralos rede_final.geojson
```
Isso cria as obras e carrega a rede de Barra do Piraí. A Iguá entra como obra
de recomposição (dashboard) — os lançamentos dela vêm da importação da planilha.

---

## Passo 2 — GitHub (versionar)

> Conta já existe; o repositório ainda não. Estas ações são suas.

1. No GitHub, **New repository** → nome ex.: `painel-obras-axial` → **Private** → Create.
2. No seu computador, na pasta com os arquivos:
```bash
git init
git add .
git commit -m "Painel de obras - versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/painel-obras-axial.git
git push -u origin main
```
> **Importante:** confira que NÃO há service_role em nenhum arquivo antes do push.
> Crie um `.gitignore` com `.env` para não vazar segredos.

---

## Passo 3 — Vercel (publicar)

> Plano gratuito, hospedagem estática.

1. Em vercel.com, **Add New → Project → Import** do seu repositório GitHub.
2. Framework Preset: **Other** (são arquivos estáticos).
3. Deploy. A Vercel te dá uma URL pública (ex.: `painel-obras-axial.vercel.app`).
4. Na TV da diretoria, abra `…/diretoria-tv.html` em modo quiosque (tela cheia).

---

## Como ligar o front no Supabase (próximo passo)

Hoje os HTMLs usam dados **em memória** (recarregar zera). Para ficar ao vivo,
cada tela passa a usar o cliente Supabase com a chave **anon**:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const sb = supabase.createClient("https://xxxx.supabase.co", "ANON_KEY");
  // TV: lê e escuta realtime
  const { data } = await sb.from('v_drenagem').select('*').eq('contrato_id', ID);
  sb.channel('dren').on('postgres_changes',
    {event:'*',schema:'public',table:'drenagem_avanco'}, recarrega).subscribe();
  // Operador (logado): grava
  await sb.from('drenagem_avanco')
    .upsert({trecho_id: id, pct: 60}, {onConflict:'trecho_id'});
</script>
```

Eu preparo essa parte assim que o schema estiver rodando e você me passar a URL
do projeto (a **anon** key pode aparecer no front; a **service_role** nunca).

---

## Regras de segurança (já no schema)

- **TV lê sem login** (políticas `leitura publica …`, `using (true)`).
- **Operador grava logado** (`auth.role() = 'authenticated'`).
- **Realtime** ligado nas tabelas de avanço (a TV atualiza sozinha).
- A **service_role** ignora segurança — use só no seed local, jamais no front/GitHub.
