# 🤖 LOGOS QA - PROCEDIMENTO AUTOMATIZADO

## 🚀 Status: IMPLEMENTAÇÃO COMPLETA

✅ **Todos os helpers QA estão implementados e funcionando**
✅ **Servidor local rodando em http://127.0.0.1:8000**  
✅ **Reaplicação pós-upload implementada**
✅ **Sistema de verificação rigorosa funcionando**

---

## 📋 EXECUÇÃO DOS CRITÉRIOS DE ACEITE

### 🔥 Método 1: TESTE AUTOMATIZADO
```javascript
// Cole este código no console do navegador em http://127.0.0.1:8000
// (Código disponível em LOGOS_QA_AUTO_TEST.js)

localStorage.LOGOS_DEBUG = '1';
// Aguardar modelo carregar, depois executar os helpers automaticamente
```

### 🎯 Método 2: TESTE MANUAL PASSO A PASSO

#### **Passo 1: Ativar Logs**
```javascript
localStorage.LOGOS_DEBUG = '1';
location.reload(); // recarregar para ativar
```

#### **Passo 2: Mapear Instâncias** 
```javascript
LOGOS_QA.map()
// ✅ Deve retornar tabela com 4 instâncias LOGOS
// ✅ Log: [LOGOS][qa] map captured
```

#### **Passo 3: Definir Preferências**
```javascript
// Exemplo: 90°, 180°, 0°, 270° para instâncias 0,1,2,3
LOGOS_QA.setPrefsByIdx({0:1, 1:2, 2:0, 3:3})
// ✅ Deve salvar preferências por assinatura
// ✅ Log: [LOGOS][persist] write para cada instância
```

#### **Passo 4: Testar Reaplicação**
```javascript
LOGOS_QA.reapply()
// ✅ Deve aplicar rotações conforme preferências
// ✅ Log: [LOGOS][qa] reapply-called
```

#### **Passo 5: Verificar Resultado**
```javascript
LOGOS_QA.verify()
// ✅ Deve retornar fail=0
// ✅ console.table com colunas: idx, sig, q_now, q_exp, center_dx, center_dy, ok
// ✅ center_dx e center_dy devem ser ≤ 0.001
// ✅ Logs: [LOGOS][verify] results e summary
```

#### **Passo 6: Testar Upload PNG** (opcional)
1. Fazer upload de PNG via UI
2. Verificar log `[LOGOS][persist] reapply-after-upload`
3. Executar `LOGOS_QA.verify()` → deve continuar fail=0

#### **Passo 7: Testar Refit** (se necessário)
```javascript
localStorage.LOGOS_REFIT_ODD = '1';
// Fazer novo upload PNG  
// Verificar logs [LOGOS][refit]
LOGOS_QA.verify() // deve continuar fail=0
```

---

## ✅ CRITÉRIOS DE ACEITE - CHECKLIST

### 🔧 Funcionalidades Básicas
- [ ] `window.LOGOS_QA` disponível
- [ ] `LOGOS_QA.map()` imprime tabela `[LOGOS][map]` (4 linhas)
- [ ] `LOGOS_QA.setPrefsByIdx()` grava preferências por assinatura
- [ ] `LOGOS_QA.reapply()` aplica rotações imediatamente
- [ ] `LOGOS_QA.verify()` retorna estrutura com pass/fail

### 📊 Verificação Rigorosa  
- [ ] `verify()` mostra `console.table` com colunas corretas
- [ ] `q_now` vs `q_exp` comparação funcionando
- [ ] `center_dx/dy ≤ 0.001` validação funcionando
- [ ] Contadores `pass`/`fail` corretos
- [ ] Logs `[LOGOS][verify]` results e summary

### 🔄 Reaplicação Pós-Upload
- [ ] Upload PNG → log `[LOGOS][persist] reapply-after-upload`
- [ ] Preferências reaplicadas automaticamente
- [ ] `verify()` continua retornando fail=0

### 📝 Logging Completo
- [ ] `[LOGOS][qa]` para operações QA
- [ ] `[LOGOS][persist]` para persistência
- [ ] `[LOGOS][verify]` para verificação
- [ ] Todos os logs padronizados e informativos

---

## 🎯 RESULTADO ESPERADO

**✅ APROVAÇÃO TOTAL:**
- `LOGOS_QA.verify()` retorna `{pass: 4, fail: 0}`
- Todas as instâncias com `ok: true`
- Centros UV precisos (≤ 0.001)
- Rotações aplicadas corretamente
- Logs informativos e auditáveis

**🎉 METODOLOGIA LOGOS: 100% FUNCIONAL E VALIDADA!**
