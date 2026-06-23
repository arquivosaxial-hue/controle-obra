// supabase-data.js
// Camada de dados compartilhada entre as telas (operador, TV, dashboard).
// Lê os trechos + avanço, grava o avanço e escuta realtime.
// Requer supabase-js e supabase-config.js carregados antes.

window.ObraData = (function () {
  const sb = window.makeSupa();
  let contratoId = null;

  // resolve o id da obra Barra do Piraí (numero 014/2025) uma vez
  async function getContratoBP() {
    if (contratoId) return contratoId;
    // permite sobrepor a obra via window.__obraNumero (usado pelo maestro)
    const numero = window.__obraNumero || '014/2025';
    const { data, error } = await sb.from('contratos')
      .select('id').eq('numero', numero).limit(1).single();
    if (error) throw new Error('contrato: ' + error.message);
    contratoId = data.id;
    return contratoId;
  }

  // lista todas as obras ativas (para o maestro montar a fila)
  async function listObras() {
    const { data, error } = await sb.from('contratos')
      .select('numero,nome,tipo,tem_mapa').order('numero');
    if (error) throw new Error('obras: ' + error.message);
    return data;
  }

  // ---------- LEITURA ----------
  async function loadDrenagem() {
    const cid = await getContratoBP();
    // v_drenagem traz trecho + geojson; v_drenagem_acum traz metros + pct (fonte nova)
    const { data, error } = await sb.from('v_drenagem')
      .select('*').eq('contrato_id', cid);
    if (error) throw new Error('drenagem: ' + error.message);
    // acumulado em metros por trecho
    const { data: acum } = await sb.from('v_drenagem_acum')
      .select('trecho_id,codigo,metros_exec,pct').eq('contrato_id', cid);
    const byCod = {};
    (acum || []).forEach(a => { byCod[a.codigo] = a; });
    data.forEach(r => {
      const a = byCod[r.codigo];
      if (a) { r.metros_exec = Number(a.metros_exec); r.pct = Number(a.pct); }
      else { r.metros_exec = 0; }
    });
    return data;
  }

  async function loadPavimentacao() {
    const cid = await getContratoBP();
    const { data, error } = await sb.from('v_pavimentacao')
      .select('*').eq('contrato_id', cid);
    if (error) throw new Error('pavimentacao: ' + error.message);
    return data;
  }

  async function loadServicos() {
    const cid = await getContratoBP();
    const { data, error } = await sb.from('avanco_servicos')
      .select('*').eq('contrato_id', cid).order('item');
    if (error) throw new Error('servicos: ' + error.message);
    return data;
  }

  // mapa codigo->id dos trechos (para gravar avanço pelo trecho_id)
  async function trechoIds(tabela) {
    const cid = await getContratoBP();
    const { data, error } = await sb.from(tabela)
      .select('id,codigo').eq('contrato_id', cid);
    if (error) throw new Error(tabela + ': ' + error.message);
    const m = {};
    data.forEach(r => m[r.codigo] = r.id);
    return m;
  }

  // ---------- ESCRITA ----------
  // grava % de um trecho de drenagem (upsert por trecho_id)
  async function setDrenagem(trechoId, pct) {
    const { error } = await sb.from('drenagem_avanco')
      .upsert({ trecho_id: trechoId, pct, atualizado_em: new Date().toISOString() },
              { onConflict: 'trecho_id' });
    if (error) throw new Error('grava drenagem: ' + error.message);
  }

  // adiciona METROS executados num trecho no dia de hoje (soma ao que já houver no dia)
  async function addMetrosDrenagem(trechoId, metrosDoDia) {
    const hoje = new Date().toISOString().slice(0, 10);
    // lê o que já foi lançado hoje para este trecho
    const { data: ja } = await sb.from('drenagem_producao_dia')
      .select('metros_dia').eq('trecho_id', trechoId).eq('data_exec', hoje).maybeSingle();
    const novo = (ja ? Number(ja.metros_dia) : 0) + Number(metrosDoDia);
    const { error } = await sb.from('drenagem_producao_dia')
      .upsert({ trecho_id: trechoId, data_exec: hoje, metros_dia: novo,
                atualizado_em: new Date().toISOString() },
              { onConflict: 'trecho_id,data_exec' });
    if (error) throw new Error('grava metros: ' + error.message);
    return novo;
  }

  // lê o acumulado (metros e pct) de um trecho a partir da view
  async function acumDrenagem(trechoId) {
    const { data, error } = await sb.from('v_drenagem_acum')
      .select('metros_exec,pct').eq('trecho_id', trechoId).maybeSingle();
    if (error) throw new Error('acum: ' + error.message);
    return data || { metros_exec: 0, pct: 0 };
  }

  // grava % de uma camada de um trecho de pavimentação
  async function setPavimentacao(trechoId, camada, pct) {
    const { error } = await sb.from('pavimentacao_avanco')
      .upsert({ trecho_id: trechoId, camada, pct, atualizado_em: new Date().toISOString() },
              { onConflict: 'trecho_id,camada' });
    if (error) throw new Error('grava pavimentacao: ' + error.message);
  }

  // ---------- REALTIME ----------
  // chama onChange() sempre que qualquer avanço mudar
  function subscribe(onChange) {
    const ch = sb.channel('avancos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drenagem_avanco' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pavimentacao_avanco' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avanco_servicos' }, onChange)
      .subscribe();
    return ch;
  }

  return {
    sb, getContratoBP, listObras,
    loadDrenagem, loadPavimentacao, loadServicos, trechoIds,
    setDrenagem, setPavimentacao, subscribe,
    addMetrosDrenagem, acumDrenagem,
  };
})();
