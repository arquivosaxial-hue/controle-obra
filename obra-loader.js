// obra-loader.js
// Monta window.OBRA (mesmo formato do bundle em memória) a partir do banco.
// Assim as telas existentes funcionam sem reescrever a lógica de render.
// Requer supabase-config.js, supabase-js e supabase-data.js antes.

window.carregarOBRA = async function () {
  const D = window.ObraData;

  const [dren, pav, serv, contratoId] = await Promise.all([
    D.loadDrenagem(),
    D.loadPavimentacao(),
    D.loadServicos(),
    D.getContratoBP(),
  ]);

  // mapas codigo->uuid (para o operador gravar avanço)
  try {
    window.__drenIds = await D.trechoIds('drenagem_trechos');
    window.__pavIds  = await D.trechoIds('pavimentacao_trechos');
  } catch (e) { console.warn('trechoIds', e); }

  // --- drenagem: separar tubos x ralos, montar FeatureCollections ---
  const drenFeats = [], raloFeats = [];
  dren.forEach(r => {
    const f = {
      type: 'Feature',
      properties: {
        id: r.codigo, trecho: r.codigo,
        jusante: r.pv_jusante, montante: r.pv_montante,
        logradouro: r.logradouro, tipo: r.tipo,
        diametro_m: r.diametro_m, extensao_proj: r.extensao_m,
        pct: r.pct || 0,
        metros_exec: (r.metros_exec != null) ? r.metros_exec : 0,
      },
      geometry: r.geojson,
    };
    if (r.tipo === 'ralo') raloFeats.push(f); else drenFeats.push(f);
  });

  // --- pavimentação: trechos (com camadas) + polígonos asfalto + calçada ---
  const pavTrechos = [], pavAsfalto = [];
  pav.forEach(r => {
    const camadas = r.camadas || {};
    // garantir todas as chaves
    ['subleito','subbase','base','meiofio','calcada','cbuq'].forEach(c => {
      if (camadas[c] == null) camadas[c] = 0;
    });
    pavTrechos.push({
      type: 'Feature',
      properties: {
        id: r.codigo, rua: r.rua, trecho: r.trecho_num, n_trechos: r.n_trechos,
        larg_caixa: r.larg_caixa_m, ext_seg: r.ext_seg_m, camadas,
      },
      geometry: r.geojson,
    });
    if (r.poligono) {
      pavAsfalto.push({
        type: 'Feature',
        properties: { id: r.codigo, rua: r.rua, larg_caixa: r.larg_caixa_m },
        geometry: r.poligono,
      });
    }
  });

  // calçada: derivada no bundle original; aqui deixamos vazio (opcional).
  // A tela funciona sem calçada; se quiser, dá pra recomputar via buffer no front.
  const pavCalcada = { type: 'FeatureCollection', features: [] };

  // --- serviços ---
  const servicos = serv.map(s => ({
    item: s.item, servico: s.servico,
    contrato: Number(s.valor_contrato), medido_acumulado: Number(s.medido_acum),
    pct: Number(s.pct),
  }));

  // --- centro do mapa ---
  let cx = -44.0489, cy = -22.4748;
  if (drenFeats.length) {
    const xs = [], ys = [];
    drenFeats.forEach(f => f.geometry.coordinates.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
    cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  }

  window.OBRA = {
    contratoId,
    drenagem: { type: 'FeatureCollection', features: drenFeats },
    ralos: { type: 'FeatureCollection', features: raloFeats },
    pav_trechos: { type: 'FeatureCollection', features: pavTrechos },
    pav_asfalto: { type: 'FeatureCollection', features: pavAsfalto },
    pav_calcada: pavCalcada,
    camadas: ['subleito','subbase','base','meiofio','calcada','cbuq'],
    servicos,
    cx, cy, pav_cx: cx, pav_cy: cy,
  };
  return window.OBRA;
};
