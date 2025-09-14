/**
 * 🔧 LOGOS QA - SCRIPT CORRIGIDO (executar APÓS upload PNG)
 */

// AGUARDAR TEXTURAS CARREGAREM ANTES DE TESTAR
console.log('🔧 LOGOS QA - SCRIPT CORRIGIDO');
console.log('⚠️  IMPORTANTE: Execute APÓS fazer upload de PNG');

setTimeout(() => {
  console.log('\n📊 1. Mapeando instâncias...');
  const mapping = LOGOS_QA.map();
  
  console.log('\n⚙️ 2. Definindo preferências de teste...');
  // Limpar preferências anteriores primeiro
  try {
    mapping.forEach(m => {
      localStorage.removeItem('logos:pref:' + m.sig);
    });
    console.log('✅ Preferências antigas limpas');
  } catch(_) {}
  
  // Definir novas preferências
  const prefs = {0: 1, 1: 2, 2: 0, 3: 3}; // 90°,180°,0°,270°
  const setPrefResult = LOGOS_QA.setPrefsByIdx(prefs);
  console.log('✅ Novas preferências definidas:', prefs);
  
  console.log('\n🔄 3. Reaplicando...');
  const reapplyResult = LOGOS_QA.reapply();
  
  // Aguardar um pouco para mudanças propagarem
  setTimeout(() => {
    console.log('\n🔍 4. Verificação detalhada...');
    const result = LOGOS_QA.verify(0.1); // Tolerância mais relaxada: 0.1
    
    console.log('\n📋 ANÁLISE DETALHADA:');
    result.details.forEach((detail, i) => {
      console.log(`Instância ${i}:`);
      console.log(`  • Assinatura: ${detail.sig}`);
      console.log(`  • Rotação atual: q=${detail.q_now} (${detail.q_now*90}°)`);
      console.log(`  • Rotação esperada: q=${detail.q_exp} (${detail.q_exp*90}°)`);
      console.log(`  • Centro UV: dx=${detail.center_dx}, dy=${detail.center_dy}`);
      console.log(`  • Status: ${detail.ok ? '✅ OK' : '❌ FAIL'}`);
      console.log('');
    });
    
    // Verificar estado das texturas manualmente
    console.log('\n🔍 5. Verificação manual das texturas:');
    const modelRoot = window.__logos_modelRoot;
    if (modelRoot) {
      const list = window.__logos_listInstances(modelRoot);
      list.forEach((item, idx) => {
        const tex = item.material?.map;
        const ub = tex?.userData?.uvBounds;
        console.log(`Instância ${idx}:`, {
          mesh: item.mesh.name,
          hasTexture: !!tex,
          rotation: tex?.rotation,
          uvBounds: ub ? 'presente' : 'ausente',
          center: tex?.center
        });
      });
    }
    
    if (result.fail === 0) {
      console.log('\n🎉 SISTEMA FUNCIONANDO PERFEITAMENTE!');
    } else {
      console.log('\n⚠️ DIAGNÓSTICO:');
      console.log('1. Certifique-se de que fez upload de PNG');
      console.log('2. Aguarde as texturas carregarem completamente');
      console.log('3. Execute o script novamente após upload');
    }
  }, 1000);
  
}, 2000);

console.log('⏳ Aguardando 2 segundos...');
console.log('💡 LEMBRE-SE: Faça upload de PNG primeiro!');
