/**
 * 🤖 LOGOS QA - TESTE AUTOMATIZADO
 * Execute este script no console do navegador após abrir http://127.0.0.1:8000
 */

console.log('🤖 LOGOS QA - TESTE AUTOMATIZADO INICIADO');
console.log('📍 URL: http://127.0.0.1:8000');

// PASSO 1: Habilitar logs
console.log('\n📝 PASSO 1: Habilitando logs LOGOS_DEBUG');
localStorage.LOGOS_DEBUG = '1';
console.log('✅ localStorage.LOGOS_DEBUG = "1" ativado');

// PASSO 2: Aguardar modelo carregar e executar mapeamento  
console.log('\n⏳ PASSO 2: Aguardando modelo carregar (8 segundos)...');

function executarTeste() {
  try {
    console.log('\n📊 EXECUTANDO LOGOS_QA.map()');
    const mapping = window.LOGOS_QA.map();
    console.log('✅ Mapeamento capturado:', mapping);
    
    if (!mapping || mapping.length === 0) {
      throw new Error('❌ Nenhuma instância LOGOS encontrada! Certifique-se de que o modelo foi carregado.');
    }
    
    console.log(`✅ Encontradas ${mapping.length} instâncias LOGOS`);
    
    // PASSO 3: Definir preferências de teste
    console.log('\n⚙️ PASSO 3: Definindo preferências de teste');
    const prefsTest = {0: 1, 1: 2, 2: 0, 3: 3}; // 90°, 180°, 0°, 270°
    const setPrefResult = window.LOGOS_QA.setPrefsByIdx(prefsTest);
    console.log('✅ Preferências definidas:', prefsTest);
    console.log('✅ setPrefsByIdx resultado:', setPrefResult);
    
    // PASSO 4: Reaplicar manualmente (simula upload PNG)
    console.log('\n🔄 PASSO 4: Reaplicando preferências (simula upload PNG)');
    const reapplyResult = window.LOGOS_QA.reapply();
    console.log('✅ Reaplicação executada:', reapplyResult);
    
    // PASSO 5: Verificação final
    console.log('\n🔍 PASSO 5: Verificação rigorosa');
    const verification = window.LOGOS_QA.verify(1e-3);
    console.log('📊 Resultado da verificação:', verification);
    
    // ANÁLISE DOS RESULTADOS
    console.log('\n🎯 ANÁLISE DOS RESULTADOS:');
    
    if (verification.fail === 0) {
      console.log('🎉 TODOS OS CRITÉRIOS DE ACEITE PASSARAM!');
      console.log(`✅ Aprovado: ${verification.pass}/${verification.total} instâncias`);
      console.log('✅ Rotações aplicadas corretamente');
      console.log('✅ Centros UV dentro da tolerância (≤ 0.001)');
      console.log('✅ Sistema LOGOS funcionando 100%');
    } else {
      console.log('⚠️ ALGUNS TESTES FALHARAM:');
      console.log(`❌ Reprovado: ${verification.fail}/${verification.total} instâncias`);
      console.log('🔍 Detalhes dos erros:');
      verification.details.filter(d => !d.ok).forEach(detail => {
        console.log(`   • Instância ${detail.idx}: ${detail.reason || 'Verificar q_now vs q_exp ou center_dx/dy'}`);
      });
      
      console.log('\n💡 POSSÍVEIS SOLUÇÕES:');
      console.log('   1. Verificar se as texturas foram aplicadas');
      console.log('   2. Tentar com localStorage.LOGOS_REFIT_ODD="1"');
      console.log('   3. Fazer upload de PNG real e verificar novamente');
    }
    
    // VERIFICAÇÃO DOS CRITÉRIOS DE ACEITE
    console.log('\n📋 VERIFICAÇÃO DOS CRITÉRIOS DE ACEITE:');
    
    const criterios = [
      { nome: 'window.LOGOS_QA disponível', ok: !!window.LOGOS_QA },
      { nome: 'window.LOGOS_QA.map existe', ok: typeof window.LOGOS_QA.map === 'function' },
      { nome: 'window.LOGOS_QA.setPrefsByIdx existe', ok: typeof window.LOGOS_QA.setPrefsByIdx === 'function' },
      { nome: 'window.LOGOS_QA.verify existe', ok: typeof window.LOGOS_QA.verify === 'function' },
      { nome: 'Mapeamento retorna dados', ok: mapping.length > 0 },
      { nome: 'Preferências salvas', ok: setPrefResult === true },
      { nome: 'Reaplicação funciona', ok: reapplyResult === true },
      { nome: 'Verificação retorna estrutura correta', ok: verification && 'pass' in verification && 'fail' in verification }
    ];
    
    criterios.forEach(c => {
      console.log(`${c.ok ? '✅' : '❌'} ${c.nome}`);
    });
    
    const todosCriterios = criterios.every(c => c.ok);
    console.log(`\n🏆 RESULTADO FINAL: ${todosCriterios ? 'APROVADO' : 'REPROVADO'}`);
    
    if (todosCriterios && verification.fail === 0) {
      console.log('🎯 METODOLOGIA LOGOS: 100% FUNCIONAL!');
    }
    
  } catch (error) {
    console.error('❌ ERRO DURANTE TESTE:', error);
    console.log('\n💡 TROUBLESHOOTING:');
    console.log('   1. Certifique-se de estar em http://127.0.0.1:8000');
    console.log('   2. Aguarde o modelo carregar completamente');
    console.log('   3. Verifique se existem instâncias LOGOS no modelo');
    console.log('   4. Tente recarregar a página e executar novamente');
  }
}

// Executar após delay
setTimeout(executarTeste, 8000);

console.log('⏳ Aguardando 8 segundos para modelo carregar...');
console.log('💡 Enquanto isso, certifique-se de que:');
console.log('   • Está acessando http://127.0.0.1:8000');
console.log('   • O modelo está sendo carregado');
console.log('   • Não há erros no console');
