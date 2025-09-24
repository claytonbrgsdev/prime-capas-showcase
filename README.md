# Prime Capas Showcase

Um projeto Three.js para showcase de capas de veículos com iluminação HDR realística e controles interativos.

## 🚀 Deploy no GitHub Pages

### 🚀 Deploy Automático (GitHub Actions)

1. **Fork este repositório no GitHub**
2. **O GitHub Actions fará deploy automaticamente** quando você fizer push para `main`
3. **Acesse o projeto em:**
   ```
   https://seu-usuario.github.io/prime-capas-showcase
   ```

### ⚙️ Deploy Manual (Alternativo)

Se preferir configurar manualmente:

1. **Fork ou Clone este repositório**
2. **Ative o GitHub Pages** no repositório:
   - Vá em Settings → Pages
   - Selecione "GitHub Actions"
   - O workflow já está configurado
3. **Faça push para main** ou use "workflow_dispatch" no Actions tab

### 🛠️ Script de Deploy Local (Para Testes)

```bash
# Clone do repositório
git clone https://github.com/seu-usuario/prime-capas-showcase.git
cd prime-capas-showcase

# Usar o script de deploy
./deploy.sh local     # Iniciar servidor local
./deploy.sh github    # Instruções de setup manual
./deploy.sh status    # Ver status do projeto
./deploy.sh          # Mostrar ajuda
```

### 🎯 Deploy Automático (Recomendado)

1. **Faça push para main**
   ```bash
   git add .
   git commit -m "Deploy to GitHub Pages"
   git push origin main
   ```

2. **Acesse:** https://seu-usuario.github.io/prime-capas-showcase
3. **O GitHub Actions fará deploy automaticamente** 🚀

### Estrutura de Arquivos

O projeto está configurado para funcionar corretamente no GitHub Pages:

```
prime-capas-showcase/
├── .nojekyll                    # Para GitHub Pages não ignorar arquivos
├── prime-capas/                 # Diretório principal da aplicação
│   ├── index.html              # Página principal
│   ├── main.js                 # Lógica principal
│   ├── styles.css              # Estilos CSS
│   ├── assets/                 # Assets estáticos
│   │   ├── images/            # Imagens HDR
│   │   ├── models/            # Modelos 3D
│   │   └── scenarios/         # Cenários 3D
│   └── [outros arquivos JS]
└── README.md
```

### Configurações de Path

Todos os paths estão configurados como relativos para funcionar no GitHub Pages:

- ✅ `./styles.css` - CSS principal
- ✅ `./main.js` - JavaScript principal
- ✅ `./assets/images/` - Imagens HDR
- ✅ `./assets/models/` - Modelos 3D
- ✅ `./assets/scenarios/` - Cenários 3D

### Recursos Implementados

- 🎨 **Iluminação HDR realística** com múltiplas opções de ambiente
- 🎯 **Controles interativos** para câmera, iluminação e materiais
- 🏎️ **Modelos 3D otimizados** para carregamento rápido
- 🎮 **Interface responsiva** otimizada para desktop e mobile
- ⚡ **Performance otimizada** com técnicas de carregamento progressivo

### Controles Disponíveis

- **Cenário**: Seleção entre diferentes ambientes 3D
- **Câmera**: Controles de rotação automática e posicionamento
- **Luzes**: Controle de iluminação ambiente e direcional
- **Logos**: Debug e posicionamento de logos no modelo
- **HDR Environment**: Seleção e configuração de ambientes HDR

### Navegador Recomendado

Para melhor performance, recomenda-se usar navegadores modernos:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Solução de Problemas

**Se os assets não carregarem:**
- Verifique se o `.nojekyll` está presente
- Confirme que todos os arquivos estão na branch correta
- Aguarde alguns minutos após ativar o GitHub Pages (pode demorar)

**Se o JavaScript não funcionar:**
- Verifique se o navegador suporta ES6 modules
- Confirme que todos os arquivos JS estão sendo servidos corretamente

---

**Desenvolvido com ❤️ usando Three.js**
