/**
 * LOGOS QA Test Script
 * Execute este script no console do navegador após carregar a aplicação
 */

console.log('🚀 LOGOS QA Test Script iniciado');

// Passo 1: Habilitar logs
localStorage.LOGOS_DEBUG = '1';
console.log('✅ LOGOS_DEBUG habilitado');

// Aguardar modelo carregar (simular via timeout)
setTimeout(() => {
  console.log('📋 Executando Passo 2: LOGOS_QA.map()');
  
  try {
    const mapping = LOGOS_QA.map();
    console.log('✅ Mapeamento capturado:', mapping);
    
    // Passo 3: Definir preferências de exemplo
    // Exemplo: instância 0=90°, 1=180°, 2=0°, 3=270°
    console.log('⚙️ Executando Passo 3: LOGOS_QA.setPrefsByIdx()');
    const prefs = {0: 1, 1: 2, 2: 0, 3: 3}; // quarter-turns
    const result = LOGOS_QA.setPrefsByIdx(prefs);
    console.log('✅ Preferências definidas:', prefs, 'Result:', result);
    
    // Passo 4: Simular reaplicação (equivalente a novo upload PNG)
    console.log('🔄 Executando Passo 4: LOGOS_QA.reapply()');
    const reapplyResult = LOGOS_QA.reapply();
    console.log('✅ Reaplicação executada:', reapplyResult);
    
    // Passo 5: Verificação final
    console.log('🔍 Executando Passo 5: LOGOS_QA.verify()');
    const verification = LOGOS_QA.verify(1e-3);
    console.log('📊 Resultado da verificação:', verification);
    
    if (verification.fail === 0) {
      console.log('🎉 TODOS OS TESTES PASSARAM! Sistema LOGOS funcionando corretamente.');
      console.log(`✅ Aprovado: ${verification.pass}/${verification.total} instâncias`);
    } else {
      console.log('❌ TESTES FALHARAM!');
      console.log(`❌ Reprovado: ${verification.fail}/${verification.total} instâncias`);
      console.log('Detalhes dos erros:', verification.details.filter(d => !d.ok));
    }
    
  } catch (error) {
    console.error('❌ Erro durante execução dos testes QA:', error);
    console.log('💡 Certifique-se de que:');
    console.log('   - O modelo foi carregado completamente');
    console.log('   - As instâncias LOGOS existem');
    console.log('   - A aplicação está funcionando corretamente');
  }
  
}, 5000); // 5 segundos para carregar

console.log('⏳ Aguardando modelo carregar (5s)...');
console.log('💡 Para testar manualmente após carregamento:');
console.log('   1. LOGOS_QA.map()');
console.log('   2. LOGOS_QA.setPrefsByIdx({0:1,1:2,2:0,3:3})');
console.log('   3. LOGOS_QA.reapply()');
console.log('   4. LOGOS_QA.verify()');
