LOGOS — Tracker & Cursor Prompts

Metodologia rígida, verificável por logs + prompts prontos para o Cursor

Repositório-alvo: prime-capas-showcase/prime-capas

Como usar (flags de debug)

Ative logs no console:

localStorage.LOGOS_DEBUG = '1'   // habilita logs [LOGOS]
localStorage.LOGOS_REFIT_ODD = '0' // opcional: 1 = refit automático em rotações ímpares (90/270)

Desative quando terminar:

localStorage.removeItem('LOGOS_DEBUG');
localStorage.removeItem('LOGOS_REFIT_ODD');

Runbook (passo a passo)

Mapear instâncias (congelar descoberta)

Executar logInstanceMap(modelRoot) (ver Prompt 2).

Conferir tabela no console; salvar mapeamento persistido (logos:map:v1).

Habilitar 90° + Reset

Trocar botões para ±90° (quarter-turns) e adicionar Reset (q=0).

Persistir rotationQ por instância (chaveada por assinatura sig).

Checklist por instância (0..3)

Reset(0°) → testar 90/180/270 → escolher visual correto.

Se necessário, flipY (debug) e/ou padPercent maior (ex.: 0.08).

Persistir preferências e registrar estado com [LOGOS][state].

Pós-upload automático

Após applyTextureToRoleExt(...), chamar applyDefaultsForLogos(modelRoot) para reimpor rotationQ/flipY/pad.

Validar no console que q_aplicado == q_esperado.

(Opcional) Refit em rotações ímpares

Se a 90°/270° houver distorção, ativar LOGOS_REFIT_ODD='1' e repetir o teste.

Ver logs [LOGOS][refit] com repeat/offset antes/depois.

Rollback

Reset All + limpar logos:pref:* e desativar flags.

Tracker (preenchimento durante execução)

1. Mapeamento (congelado)

idx

assinatura (sig)

meshId

mesh.name

materialIndex

material.name

0











1











2











3











2. Preferências por instância (persistidas)

idx

sig

rotationQ (0..3)

flipY (0/1)

padPercent

último check

observações

0







0.06





1







0.06





2







0.06





3







0.06





3. QA — Evidências em logs



Prompts prontos para o Cursor

Instruções gerais: aplicar exatamente nas rotas indicadas. Cada prompt deve ser executado e commitado antes do próximo. Não alterar APIs públicas existentes além do explicitado.

Prompt 1 — Flags & helper de logs (main.js)

Arquivo: prime-capas/main.js

No topo do arquivo (após imports), criar um helper de logs condicionado a flag:

function LOGOS_LOG(type, msg, data) {
  try { if (localStorage.getItem('LOGOS_DEBUG') !== '1') return; } catch(_) { return; }
  const tag = `[LOGOS][${type}]`;
  if (data !== undefined) console.log(tag, msg, data); else console.log(tag, msg);
}

Exportar no window para facilitar debug manual (em ambiente dev):

try { window.LOGOS_SET_DEBUG = (v) => localStorage.setItem('LOGOS_DEBUG', v ? '1' : '0'); } catch(_) {}

Prompt 2 — Assinatura, mapeamento e estado (main.js)

Arquivo: prime-capas/main.js

Adicionar as funções abaixo (fora do IIFE ou dentro, mas acessíveis onde os handlers vivem):

function logosInstanceSignature(item) {
  const mesh = item.mesh; const mi = item.materialIndex; const mat = item.material;
  return `${mesh?.name || mesh?.id}#${mi}#${mat?.name || 'mat'}`;
}

function logosLogInstanceMap(modelRoot) {
  const list = getRoleInstanceCountExt ? null : null; // só p/ lint; usamos regions.js abaixo
}

Substituir o esqueleto acima por esta implementação completa, usando as funções de regions.js já importadas como getRoleInstanceCountExt e também um novo import listRoleInstances exportado no Prompt 5:

function logosLogInstanceMap(modelRoot) {
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  const rows = list.map((it, idx) => ({ idx, sig: logosInstanceSignature(it), meshId: it.mesh.id, mesh: it.mesh.name, materialIndex: it.materialIndex, material: it.material?.name }));
  LOGOS_LOG('map', 'instances'); console.table(rows);
  try { localStorage.setItem('logos:map:v1', JSON.stringify(rows)); LOGOS_LOG('map', 'saved logos:map:v1'); } catch(_) {}
  return rows;
}

function logosLogTexState(idx, tex, extras={}) {
  const rep = tex?.repeat || {x:NaN,y:NaN}; const off = tex?.offset || {x:NaN,y:NaN}; const ctr = tex?.center || {x:NaN,y:NaN};
  const ub = (tex?.userData && tex.userData.uvBounds) || {};
  const q = (()=>{ const r = tex?.rotation || 0; const pi2 = Math.PI*2; const nr = ((r%pi2)+pi2)%pi2; return Math.round(nr/(Math.PI/2))%4; })();
  LOGOS_LOG('state', 'texture', { idx, q, rot:+(tex?.rotation||0).toFixed?.(3), rep:`(${+(rep.x||0).toFixed(3)},${+(rep.y||0).toFixed(3)})`, off:`(${+(off.x||0).toFixed(3)},${+(off.y||0).toFixed(3)})`, ctr:`(${+(ctr.x||0).toFixed(3)},${+(ctr.y||0).toFixed(3)})`, uvCtr:`(${+(ub.centerU||0).toFixed(3)},${+(ub.centerV||0).toFixed(3)})`, ...extras });
}

Invocar logosLogInstanceMap(modelRoot) assim que o modelo estiver carregado/ready, antes do primeiro upload.

Prompt 3 — UI: ±90° e Reset (index.html + main.js)

Arquivos:

index.html: nos controles de LOGOS, trocar o label dos botões para “↺ 90° / ↻ 90°” e adicionar um button Reset por instância (ou um Reset All).

prime-capas/main.js: no binding atual (função que chama rotateRoleInstanceExt), trocar ±2 → ±1 e adicionar handler de Reset que chama setRotationQ(...) com 0.

Exemplo de binding (trecho):

const bindLogoInstanceControls = (idx, cbVisible, btnCCW, btnCW, btnReset) => {
  if (cbVisible) cbVisible.addEventListener('change', () => setRoleInstanceVisibleExt(modelRoot, 'logos', idx, !!cbVisible.checked));
  if (btnCCW) btnCCW.addEventListener('click', () => rotateRoleInstanceExt(modelRoot, 'logos', idx, -1));
  if (btnCW)  btnCW .addEventListener('click', () => rotateRoleInstanceExt(modelRoot, 'logos', idx, +1));
  if (btnReset) btnReset.addEventListener('click', () => logosSetRotationQ(modelRoot, idx, 0));
};

Prompt 4 — setRotationQ idempotente + persistência por assinatura (main.js)

Arquivo: prime-capas/main.js
Adicionar:

function logosRadToQ(rad){ const t=Math.PI*2; const r=((rad%t)+t)%t; return Math.round(r/(Math.PI/2))%4; }
function logosSetRotationQ(modelRoot, idx, targetQ){
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  const it = list[idx]; if (!it) return;
  const sig = logosInstanceSignature(it);
  const mat = it.material; const tex = mat?.map; if (!tex) return;
  const currentQ = logosRadToQ(tex.rotation||0);
  const delta = ((targetQ - currentQ)%4 + 4)%4;
  LOGOS_LOG('rotate', `idx=${idx} fromQ=${currentQ} -> toQ=${targetQ} (Δ=${delta}) baseRad=${(tex.rotation||0).toFixed(3)}`);
  if (delta) rotateRoleInstanceExt(modelRoot, 'logos', idx, delta);
  try { localStorage.setItem('logos:pref:'+sig, JSON.stringify({ rotationQ: targetQ })); LOGOS_LOG('persist','save',{sig,rotationQ:targetQ}); } catch(_){}
  logosLogTexState(idx, it.material?.map);
}

Importante: depois que o usuário escolher o q correto, chamar logosSetRotationQ(modelRoot, idx, qEscolhido) para persistir.

Prompt 5 — Expor listRoleInstances e refit opcional (regions.js)

Arquivo: prime-capas/materials/regions.js

Exportar a função listRoleInstances adicionando export antes da declaração.

Priorizar o material exato LOGOS:

export const materialRoleMatchers = {
  frente: [/frente|front/i],
  tras: [/trás|tras|rear|back/i],
  lateral1: [/lateral\s*1|lateral\.??001|lateral\b(?!.*2)|left|esquerda/i],
  lateral2: [/lateral\s*2|lateral\.??002|right|direita/i],
  logos: [/^LOGOS$/i, /\blogo\b|\blogos\b/i],
};

Refit opcional em rotações ímpares dentro de rotateRoleInstance(...) após aplicar tex.rotation:

try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('LOGOS_REFIT_ODD') === '1') {
    const q = (()=>{ const t=Math.PI*2; const r=((tex.rotation%t)+t)%t; return Math.round(r/(Math.PI/2))%4; })();
    if (q % 2 !== 0) {
      // Reaproveitar UV bounds ou recalcular via fitTextureToMaterialGroups
      try { fitTextureToMaterialGroups(item.mesh, item.materialIndex, tex, { padPercent: (tex.userData?.uvBounds?.padPercent ?? 0.06) }); } catch(_) {}
      LOGOS_LOG && LOGOS_LOG('refit', `idx=${instanceIndex} q=${q} re-fit repeat/offset`);
    }
  }
} catch(_) {}

Observação: para usar LOGOS_LOG aqui sem import circular, crie um const LOGOS_LOG = (t,m,d)=>{ try{ if(localStorage.getItem('LOGOS_DEBUG')==='1'){ if(d!==undefined) console.log([LOGOS][${t}],m,d); else console.log([LOGOS][${t}],m);} }catch(_){} } no topo do arquivo.

Prompt 6 — Pós-upload: reaplicação automática (main.js)

Arquivo: prime-capas/main.js

Após o handler de pngUploadEl.addEventListener('change', ...) e depois de chamar applyTextureToRoleExt(modelRoot, 'logos', url, {...}) (e demais papéis), agendar a reaplicação com um tick (para aguardar TextureLoader):

setTimeout(() => { try { applyDefaultsForLogos(modelRoot); } catch(_){} }, 50);

Implementar applyDefaultsForLogos(modelRoot):

function applyDefaultsForLogos(modelRoot){
  const list = window.__logos_listInstances ? window.__logos_listInstances(modelRoot) : [];
  list.forEach((it, idx) => {
    const sig = logosInstanceSignature(it);
    let pref = null; try { pref = JSON.parse(localStorage.getItem('logos:pref:'+sig) || 'null'); } catch(_){}
    const tex = it.material?.map; if (!tex) return;
    if (pref && Number.isFinite(pref.rotationQ)) {
      const current = logosRadToQ(tex.rotation||0);
      const delta = ((pref.rotationQ - current)%4 + 4)%4;
      if (delta) rotateRoleInstanceExt(modelRoot, 'logos', idx, delta);
    }
    if (pref && typeof pref.flipY === 'number') { tex.flipY = !!pref.flipY; tex.needsUpdate = true; }
    // padPercent opcional (se usar refit custom)
    logosLogTexState(idx, tex, { loadedPref: !!pref });
  });
}

Bootstrap: chamar logosLogInstanceMap(modelRoot) quando o modelo for carregado, e depois do primeiro applyTextureToRoleExt(...).

Procedimento de Teste (script r