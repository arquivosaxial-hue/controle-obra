  // ================= ABA VEÍCULOS =================
  const VEIC_TABLE='veiculos', MAN_TABLE='manutencoes';
  let veiculos=[], manut=[], veicOpen={}, veicSearch='';

  const VCOLS=['id','placa','locadora','tipo','marca','modelo','ano','kmAtual','dataAfericao','obs'];
  const MCOLS=['id','veiculo_id','data','km','quant','servico','prestador','nota','danfe','vlrUnit','vlrTotal'];
  function vToDb(v){ const o={}; VCOLS.forEach(c=>{ let x=v[c]; if(x==='') x=null; o[c]=x; }); return o; }
  function mToDb(m){ const o={}; MCOLS.forEach(c=>{ let x=m[c]; if(x==='') x=null; o[c]=x; }); return o; }
  function vFromDb(v){ const o={}; VCOLS.forEach(c=>o[c]=v[c]); return o; }
  function mFromDb(m){ const o={}; MCOLS.forEach(c=>o[c]=m[c]); return o; }

  async function loadVeic(){
    if(!sb){ renderVeic(); return; }
    try{
      const [{data:vd,error:ve},{data:md,error:me}] = await Promise.all([
        sb.from(VEIC_TABLE).select('*').order('placa',{ascending:true}),
        sb.from(MAN_TABLE).select('*').order('data',{ascending:false})
      ]);
      if(ve) throw ve; if(me) throw me;
      veiculos=(vd||[]).map(vFromDb);
      manut=(md||[]).map(mFromDb);
    }catch(e){ banner('Erro ao carregar veículos: '+e.message, true); }
    renderVeic();
  }
  async function saveVeic(v, flash=true){
    if(!sb||!canEdit()) return;
    try{ const {error}=await sb.from(VEIC_TABLE).upsert([vToDb(v)]); if(error) throw error; if(flash) showFlash(); }
    catch(e){ banner('Erro ao salvar veículo: '+e.message, true); }
  }
  async function saveMan(m, flash=true){
    if(!sb||!canEdit()) return;
    try{ const {error}=await sb.from(MAN_TABLE).upsert([mToDb(m)]); if(error) throw error; if(flash) showFlash(); }
    catch(e){ banner('Erro ao salvar manutenção: '+e.message, true); }
  }
  async function delVeic(id){
    if(!sb||!canEdit()) return;
    try{ const {error}=await sb.from(VEIC_TABLE).delete().eq('id',id); if(error) throw error; }
    catch(e){ banner('Erro ao remover veículo: '+e.message, true); }
  }
  async function delMan(id){
    if(!sb||!canEdit()) return;
    try{ const {error}=await sb.from(MAN_TABLE).delete().eq('id',id); if(error) throw error; }
    catch(e){ banner('Erro ao remover manutenção: '+e.message, true); }
  }

  function manOf(vid){ return manut.filter(m=>m.veiculo_id===vid); }
  function totalVeic(vid){ return manOf(vid).reduce((s,m)=>s+(+m.vlrTotal||0),0); }
  function totalGeralVeic(){ return manut.reduce((s,m)=>s+(+m.vlrTotal||0),0); }

  function veicDesc(v){
    const p=[v.marca,v.modelo].filter(Boolean).join(' ');
    const extra=[v.ano,v.locadora].filter(Boolean).join(' · ');
    return [p,extra].filter(Boolean).join(' — ')||'(sem descrição)';
  }
  function matchVeic(v){
    if(!veicSearch) return true;
    const q=veicSearch;
    if([v.placa,v.marca,v.modelo,v.locadora,v.tipo].some(x=>(x||'').toLowerCase().includes(q))) return true;
    return manOf(v.id).some(m=>[m.servico,m.prestador,m.nota].some(x=>(x||'').toLowerCase().includes(q)));
  }

  function renderVeic(){
    const box=$('veicList'); if(!box) return;
    const list=veiculos.filter(matchVeic).sort((a,b)=>(a.placa||'').localeCompare(b.placa||'','pt-BR'));
    box.innerHTML='';
    if(!list.length){ box.innerHTML='<div class="card"><div class="veic-empty">'+(veiculos.length?'Nenhum veículo encontrado para a busca.':'Nenhum veículo cadastrado ainda. Clique em “+ Veículo” para começar (faça login primeiro).')+'</div></div>'; }
    list.forEach(v=>{
      const card=document.createElement('div'); card.className='card veic-card'; card.style.marginTop='14px';
      const open=!!veicOpen[v.id];
      const mans=manOf(v.id).slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
      let rowsHtml='';
      mans.forEach(m=>{
        rowsHtml+='<tr data-mid="'+m.id+'">'+
          '<td><input class="man-input" type="date" data-mf="data" value="'+esc(m.data||'')+'"></td>'+
          '<td><input class="man-input" type="text" inputmode="numeric" data-mf="km" value="'+esc(m.km==null?'':m.km)+'" style="width:70px"></td>'+
          '<td><input class="man-input" type="text" inputmode="numeric" data-mf="quant" value="'+esc(m.quant==null?'':m.quant)+'" style="width:48px"></td>'+
          '<td><input class="man-input" data-mf="servico" value="'+esc(m.servico||'')+'"></td>'+
          '<td><input class="man-input" data-mf="prestador" value="'+esc(m.prestador||'')+'"></td>'+
          '<td><input class="man-input" data-mf="nota" value="'+esc(m.nota||'')+'" style="width:70px"></td>'+
          '<td><input class="man-input" data-mf="danfe" value="'+esc(m.danfe||'')+'" style="width:70px"></td>'+
          '<td class="num"><input class="man-input" type="text" inputmode="decimal" data-mf="vlrUnit" value="'+esc(m.vlrUnit==null?'':Number(m.vlrUnit).toFixed(2))+'" style="width:80px"></td>'+
          '<td class="num"><input class="man-input" type="text" inputmode="decimal" data-mf="vlrTotal" value="'+esc(m.vlrTotal==null?'':Number(m.vlrTotal).toFixed(2))+'" style="width:90px"></td>'+
          '<td><button class="rowdel" data-mdel="'+m.id+'" title="Remover manutenção">&times;</button></td>'+
        '</tr>';
      });
      if(!mans.length) rowsHtml='<tr><td colspan="10" class="veic-empty">Nenhuma manutenção lançada. Clique em “+ Manutenção”.</td></tr>';

      card.innerHTML=
        '<div class="veic-head'+(open?' open':'')+'" data-vtoggle="'+v.id+'">'+
          '<div class="vh-main"><span class="vh-arrow">▶</span>'+
          '<span class="vh-placa">'+esc(v.placa||'(sem placa)')+'</span>'+
          '<span class="vh-desc">'+esc(veicDesc(v))+'</span></div>'+
          '<span class="vh-tot">R$ '+fmtMoney(totalVeic(v.id))+'</span>'+
        '</div>'+
        (open?(
        '<div class="veic-body">'+
          '<div class="veic-meta" data-vid="'+v.id+'">'+
            '<div><label>Placa</label><input class="vm-sm" data-vf="placa" value="'+esc(v.placa||'')+'"></div>'+
            '<div><label>Locadora</label><input class="vm-lg" data-vf="locadora" value="'+esc(v.locadora||'')+'"></div>'+
            '<div><label>Tipo</label><input class="vm-md" data-vf="tipo" value="'+esc(v.tipo||'')+'"></div>'+
            '<div><label>Marca</label><input class="vm-md" data-vf="marca" value="'+esc(v.marca||'')+'"></div>'+
            '<div><label>Modelo</label><input class="vm-md" data-vf="modelo" value="'+esc(v.modelo||'')+'"></div>'+
            '<div><label>Ano</label><input class="vm-sm" data-vf="ano" value="'+esc(v.ano||'')+'"></div>'+
            '<div><label>Km atual</label><input class="vm-sm" data-vf="kmAtual" value="'+esc(v.kmAtual==null?'':v.kmAtual)+'"></div>'+
            '<div><label>Aferição</label><input class="vm-md" type="date" data-vf="dataAfericao" value="'+esc(v.dataAfericao||'')+'"></div>'+
            '<div style="flex:1;min-width:160px"><label>Observações</label><input style="width:100%" data-vf="obs" value="'+esc(v.obs||'')+'"></div>'+
            '<button class="btn btn-ghost" data-vdel="'+v.id+'" title="Remover veículo" style="color:var(--red)">🗑 Remover veículo</button>'+
          '</div>'+
          '<div class="card tablecard" style="margin-top:4px;box-shadow:none;border:1px solid var(--line)">'+
          '<table style="min-width:980px"><thead><tr>'+
            '<th>Data</th><th>Km</th><th>Qtd</th><th>Tipo de serviço</th><th>Prestador/Fornecedor</th><th>NFS</th><th>DANFE</th><th class="num">Vlr Unit</th><th class="num">Vlr Total</th><th></th>'+
          '</tr></thead><tbody>'+rowsHtml+
          '<tr class="man-total"><td colspan="8">Subtotal do veículo</td><td class="num">R$ '+fmtMoney(totalVeic(v.id))+'</td><td></td></tr>'+
          '</tbody></table></div>'+
          '<div class="veic-add-row"><button class="btn btn-pri" data-vaddman="'+v.id+'">+ Manutenção</button></div>'+
        '</div>'):'');
      box.appendChild(card);
    });

    // resumo total por veículo
    const rb=$('veicResumo');
    if(rb){
      const ent=veiculos.map(v=>[v, totalVeic(v.id)]).sort((a,b)=>b[1]-a[1]);
      rb.innerHTML = ent.length ? ent.map(([v,t])=>'<tr><td>'+esc(v.placa||'(sem placa)')+' <span style="color:var(--muted)">'+esc(veicDesc(v))+'</span></td><td class="num"><b>R$ '+fmtMoney(t)+'</b></td></tr>').join('')
        + '<tr class="rsum"><td>Total geral da frota</td><td class="num"><b>R$ '+fmtMoney(totalGeralVeic())+'</b></td></tr>'
        : '<tr><td class="veic-empty">Sem dados.</td></tr>';
    }
    const badge=$('tab-veic-badge'); if(badge) badge.textContent=veiculos.length;
    if(typeof reapplyDisabled==='function') reapplyDisabled();
    // desabilita inputs da aba se não logado
    if(!canEdit()) box.querySelectorAll('input,button[data-vdel],button[data-mdel],button[data-vaddman]').forEach(el=>{ if(el.tagName==='INPUT') el.disabled=true; });
  }

  function parseMoneyBR(raw){
    if(raw==null) return null; let s=String(raw).trim(); if(s==='') return null;
    s=s.replace(/[^\d.,-]/g,'');
    if(s.indexOf(',')>-1) s=s.replace(/\./g,'').replace(',','.');
    const n=parseFloat(s); return isNaN(n)?null:n;
  }

  // toggle abrir/fechar veículo + remover
  $('veicList').addEventListener('click',e=>{
    const tog=e.target.closest('[data-vtoggle]');
    if(tog){ const id=tog.getAttribute('data-vtoggle'); veicOpen[id]=!veicOpen[id]; renderVeic(); return; }
    const vdel=e.target.closest('[data-vdel]');
    if(vdel){ const id=vdel.getAttribute('data-vdel'); const v=veiculos.find(x=>x.id===id);
      if(confirm('Remover o veículo '+(v?(v.placa||''):'')+' e TODAS as suas manutenções?')){
        logHist('removeu veículo', v?v.placa:'', '');
        delVeic(id); veiculos=veiculos.filter(x=>x.id!==id); manut=manut.filter(m=>m.veiculo_id!==id); renderVeic();
      } return; }
    const mdel=e.target.closest('[data-mdel]');
    if(mdel){ const id=mdel.getAttribute('data-mdel'); const m=manut.find(x=>x.id===id);
      if(confirm('Remover esta manutenção?')){ logHist('removeu manutenção', '', (m?m.servico:'')); delMan(id); manut=manut.filter(x=>x.id!==id); renderVeic(); }
      return; }
    const addm=e.target.closest('[data-vaddman]');
    if(addm){ const vid=addm.getAttribute('data-vaddman');
      const nm={id:uid(),veiculo_id:vid,data:'',km:null,quant:1,servico:'',prestador:'',nota:'',danfe:'',vlrUnit:null,vlrTotal:null};
      manut.unshift(nm); veicOpen[vid]=true; saveMan(nm,false); logHist('adicionou manutenção','','nova linha'); renderVeic();
      return; }
  });

  // editar campos do veículo (metadados)
  $('veicList').addEventListener('change',e=>{
    const vinp=e.target.closest('[data-vf]');
    if(vinp){
      const wrap=e.target.closest('[data-vid]'); if(!wrap) return;
      const v=veiculos.find(x=>x.id===wrap.getAttribute('data-vid')); if(!v) return;
      const f=vinp.getAttribute('data-vf'); let val=vinp.value;
      if(f==='kmAtual') val=val===''?null:(parseMoneyBR(val));
      v[f]=val===''?null:val; saveVeic(v); renderVeic(); return;
    }
    const minp=e.target.closest('[data-mf]');
    if(minp){
      const tr=e.target.closest('[data-mid]'); if(!tr) return;
      const m=manut.find(x=>x.id===tr.getAttribute('data-mid')); if(!m) return;
      const f=minp.getAttribute('data-mf'); let val=minp.value;
      if(f==='vlrUnit'||f==='vlrTotal'){ val=parseMoneyBR(val); }
      else if(f==='km'||f==='quant'){ val=val===''?null:parseMoneyBR(val); }
      else if(f==='data'){ val=val||null; }
      else { val=val===''?null:val; }
      m[f]=val;
      // se preencheu unit e qtd e total está vazio, calcula total
      if((f==='vlrUnit'||f==='quant') && (m.vlrTotal==null||m.vlrTotal==='') && m.vlrUnit!=null){
        m.vlrTotal=Number(m.vlrUnit)*(+m.quant||1);
      }
      saveMan(m); renderVeic();
    }
  });

  $('addVeicBtn') && $('addVeicBtn').addEventListener('click',()=>{
    if(!canEdit()){ alert('Faça login para adicionar veículos.'); return; }
    const nv={id:uid(),placa:'NOVA',locadora:'',tipo:'',marca:'',modelo:'',ano:'',kmAtual:null,dataAfericao:null,obs:''};
    veiculos.unshift(nv); veicOpen[nv.id]=true; veicSearch=''; if($('veicSearch')) $('veicSearch').value='';
    saveVeic(nv,false); logHist('adicionou veículo', nv.placa, ''); renderVeic();
  });
  $('veicSearch') && $('veicSearch').addEventListener('input',e=>{ veicSearch=(e.target.value||'').toLowerCase().trim(); renderVeic(); });

  // exportar manutenções CSV
  $('veicCsvBtn') && $('veicCsvBtn').addEventListener('click',()=>{
    const hd=['Placa','Marca','Modelo','Data','Km','Qtd','TipoServico','Prestador','NFS','DANFE','VlrUnit','VlrTotal'];
    const lines=[hd.join(';')];
    veiculos.slice().sort((a,b)=>(a.placa||'').localeCompare(b.placa||'','pt-BR')).forEach(v=>{
      manOf(v.id).slice().sort((a,b)=>(a.data||'').localeCompare(b.data||'')).forEach(m=>{
        lines.push([v.placa||'',v.marca||'',v.modelo||'',m.data||'',m.km==null?'':m.km,m.quant==null?'':m.quant,m.servico||'',m.prestador||'',m.nota||'',m.danfe||'',m.vlrUnit==null?'':Number(m.vlrUnit).toFixed(2),m.vlrTotal==null?'':Number(m.vlrTotal).toFixed(2)]
          .map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';'));
      });
    });
    dl('manutencoes_frota.csv','\uFEFF'+lines.join('\r\n'),'text/csv');
  });

  // carrega os dados de veículos quando a aba é aberta a primeira vez
  let veicLoaded=false;
  document.querySelectorAll('.tab').forEach(t=>{
    if(t.dataset.tab==='veiculos'){
      t.addEventListener('click',()=>{ if(!veicLoaded){ veicLoaded=true; loadVeic(); } });
    }
  });
  // recarrega veículos após login (para refletir permissão de escrita)
  if(typeof applyAuthUI==='function'){
    const _orig=applyAuthUI;
    applyAuthUI=function(){ _orig.apply(this,arguments); if(veicLoaded) renderVeic(); };
  }
