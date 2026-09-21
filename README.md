# 🕷️ HexaBOT & Universal Creature IK Engine

[![GitHub Pages](https://img.shields.io/badge/Demo%20Online-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://sandrobenigno.github.io/HexaBOT/)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Simulador 3D interativo de robótica biomecânica em **Three.js** com cinemática inversa vetorial (IK 3-DoF), **Auto-Reach Fallback** analítico em tempo constante $O(1)$, detector hierárquico e auto-rigging universal para modelos 3D arbitrários, console de mesa de som para **Shape Keys** agrupados por canal lógico, renderização PBR com *RoomEnvironment* reativo e sistema de diagnóstico visual em tempo real.

🌐 **Acesse a Demonstração Online**: [https://sandrobenigno.github.io/HexaBOT/](https://sandrobenigno.github.io/HexaBOT/)

---

## 🌟 Visão Geral & Módulos

O ecossistema é estruturado em três ambientes complementares:

### 1. 🤖 [index.html](https://sandrobenigno.github.io/HexaBOT/) — Simulador Clássico & Mobile (GitHub Pages)
* **Objetivo**: Simulador ágil e leve, otimizado para celulares e desktops.
* **Modelo 3D Base**: `aranha.glb`.
* **Recursos**:
  - Curva de elevação adaptativa com interpolação hermítica (*Smoothstep*) para a coxa.
  - Balanço orgânico procedural contínuo (*Auto-Sway / Rebolado*).
  - Telemetria dinâmica HUD em tempo real.
  - Gaveta de parâmetros responsiva para telas touch móveis.
  - Janela central de atalhos e ajuda via tecla **`H`**.

### 2. 🔬 `index2.html` — Oficina de Rigging & Exportador de Bots (.glb / .bot.json)
* **Laboratório Universal de Criaturas**: Importe qualquer modelo 3D GLB/glTF via *Drag-and-Drop* ou seletor de arquivos.
* **Auto-Rigging & Detecção Hierárquica**:
  - Varredura inteligente de sockets de pernas via Regex (`D0/E0`, `Socket`, `Hip`, `LegSocket`, etc.).
  - Medição métrica automática dos comprimentos nativos das juntas no espaço 3D ($L_1, L_2, L_3$).
  - Geração procedural e paramétrica das âncoras de contato proporcionais à anatomia do modelo.
* **Console de Shape Keys (Mesa de Som)**:
  - Faders deslizantes inspirados em mesas de áudio profissionais ocupando toda a extensão do menu Frost.
  - Agrupamento inteligente de BlendShapes/Shape Keys que compartilham o mesmo nome lógico em um único fader sincronizado multi-malhas.
* **Exportação Não-Intrusiva**:
  - 💾 **Baixar Modelo .glb (Com Manifesto)**: Empacota a malha 3D com o manifesto completo gravado no chunk `userData.botManifest` (100% compatível com Blender e visualizadores 3D padrão).
  - 📄 **Baixar Manifesto .bot.json**: Exporta a receita de calibração avulsa em JSON.

### 3. 🚀 `index3.html` — Runtime de Produção (Consumidor de Manifesto)
* **Simulador de Produção de Alta Precisão**:
  - Carrega qualquer `.glb` calibrado ou `.bot.json` e constrói a cinemática inversa diretamente das dimensões e âncoras personalizadas do manifesto.
  - **Travamento Milimétrico das Âncoras**: Elimina folgas ou desvios entre a ponta da tíbia ($P_3$) e a âncora no solo.
  - Painel lateral *Frost Glass* com sistema de abas para **Cinemática & IK** e **Shape Keys**.
  - Iluminação PBR HDR com reflexos rotacionáveis e intensidade em tempo real (*RoomEnvironment*).
  - Suporta *Drag-and-Drop* de arquivos para troca imediata de criaturas em tempo de execução.

---

## ⚡ Principais Recursos & Inovações Técnicas

### 📐 1. Cinemática Inversa Vetorial 3-DoF (Zero-Bank)
* **Base Ortonormal Rigorosa**: Construção explícita de matrizes ortonormais $\mathbf{R} = [\mathbf{X} \mid \mathbf{Y} \mid \mathbf{Z}]$ alinhando o eixo da dobradiça (*hinge axis*) ao vetor local sem distorções de rolamento espúrio (*zero bank/roll distortion*).
* **Solução Fechada por Lei dos Cossenos**: Resolução trigonométrica analítica de alta performance para os ângulos $\alpha$ (fêmur) e $\beta$ (tíbia).

### 🛡️ 2. Auto-Reach Fallback (Relaxamento Adaptativo Analítico)
* Quando o robô se eleva ou as patas se afastam além do alcance nominal da coxa ($\|T - P_1\| > L_2 + L_3$), o algoritmo deduz analiticamente em **tempo constante $O(1)$** o ângulo exato de relaxamento $\gamma_{\text{fallback}}$:
  $$K = \frac{D_{\text{total}}^2 + L_1^2 - (L_2 + L_3)^2}{2 L_1 D_{\text{total}}}$$
  $$\gamma_{\text{fallback}} = \theta_{\text{target}} + \arccos(\text{clamp}(K, -1, 1))$$
  $$\gamma_{\text{efetivo}} = \min(\gamma_{\text{nominal}}, \gamma_{\text{fallback}})$$
* **Garantia Biomecânica**: A ponta da tíbia nunca se descola do solo e a cinemática não quebra em posturas extremas.

### 🎛️ 3. Console de Shape Keys Unificado (Faders de Mesa de Som)
* Agrupamento automático de BlendShapes/Shape Keys que compartilham o mesmo nome lógico entre múltiplas malhas exportadas pelo Blender.
* 1 fader individual por expressão facial/canal mecânico, modulando todas as sub-malhas associadas em tempo real.
* Suporte a controle fino por arrasto do knob, roda do mouse (*wheel*), duplo-clique para reset e botão global de zerar.

### 🩺 4. Telemetria & Diagnóstico Visual de Tensão
* **Linhas de Esqueleto Espessas**: Renderizadas com `Line2` e `LineSegments2` (largura de 5.0px com anti-aliasing e suporte Shader nativo).
* **Feedback de Tensão Dinâmico**:
  - 🟢 **Verde Esmeralda (`#7bed9f` / `#2ed573`)**: Lado Esquerdo em postura nominal.
  - 🔵 **Ciano Elétrico (`#38bdf8` / `#00d2ff`)**: Lado Direito em postura nominal.
  - 🟡 **Amarelo Ouro (`#ffd32a`)**: Perna sob alta tensão geométrica ($\tau > 0.85$).
  - 🔴 **Vermelho Alerta Vivo (`#ff0038`)**: Atuação do **Auto-Reach Fallback** (coxa relaxou para manter a âncora colada no solo).
* **Painel HUD de Telemetria**: Monitoramento em tempo real de altura, rotações, comprimentos $L_1, L_2, L_3$, alcance e estado de contato de cada perna.

### 🦴 5. Modo X-Ray Biomecânico Nítido
* Alternado com a tecla **`X`**.
* Oculta as malhas sólidas do modelo e exibe exclusivamente o sistema articular interno: esferas e eixos em cruz dos 4 pivôs de cada membro ($P_0, P_1, P_2, P_3$), linhas ósseas espessas e a espinha central.

### 💡 6. Iluminação PBR & RoomEnvironment Reativo
* Integração com **`RoomEnvironment`** via gerador PMREM para iluminação baseada em física (PBR) com reflexos metálicos/dielétricos realistas.
* **Presets de Ambiente**:
  - `Studio / Dark Room`
  - `Exterior Dia (Sky Blue)`
  - `Cyberpunk (Neon Dark)`
  - `Por do Sol (Sunset Gold)`
* Controles em tempo real de intensidade de reflexo e rotação do ambiente (`envRotation`).

---

## ⌨️ Teclas de Atalho

| Tecla | Função |
| :---: | :--- |
| **`H`** | Abrir / Fechar **Janela Central de Ajuda & Atalhos** |
| **`P`** | Alternar **Modo Clean View** (Oculta todos os painéis para observação) |
| **`R`** | **Resetar Postura** para os valores nominais padrão |
| **`A`** | Ativar / Desativar **Auto-Balanço (Rebolado)** |
| **`X`** | Alternar **Modo Raio-X** (Visão esquelética / biomecânica) |
| **`I`** | Alternar **Painel de Telemetria / Métricas HUD** |
| **`Esc`** | Fechar janela modal ativa |

---

## 📂 Estrutura de Arquivos

```text
├── glb/
│   ├── aranha.glb               # Modelo 3D base da Aranha HexaBOT calibrada
│   └── aranha_pernalonga.glb    # Variação com pernas alongadas para testes de alcance
├── index.html                   # Simulador clássico e mobile (GitHub Pages)
├── index2.html                  # Oficina de Auto-Rig e Exportador (.glb com manifesto / .bot.json)
├── index3.html                  # Runtime de Produção com console de Shape Keys e abas Frost
└── README.md                    # Documentação do projeto
```

---

## 🚀 Como Executar Localmente

Por utilizar carregamento dinâmico de modelos GLB e módulos ES6 via CDN, execute o projeto através de qualquer servidor HTTP local:

### Com Python 3:
```bash
python -m http.server 8080
```
Acesse em seu navegador:
* `http://localhost:8080/index.html` (HexaBOT Clássico / Mobile)
* `http://localhost:8080/index2.html` (Oficina de Rigging & Exportador)
* `http://localhost:8080/index3.html` (Runtime de Produção com Manifesto)

### Com Node.js (`npx serve` ou `live-server`):
```bash
npx serve .
```

---

## 🛠️ Tecnologias Utilizadas

* **[Three.js (r160)](https://threejs.org/)**: Motor gráfico 3D WebGL / PBR.
* **`three/addons/lines/Line2.js` & `LineMaterial.js`**: Renderização de linhas esqueléticas espessas com anti-aliasing.
* **`three/addons/environments/RoomEnvironment.js`**: Geração de mapa de ambiente HDR procedural.
* **`three/addons/exporters/GLTFExporter.js`**: Exportação de modelos `.glb` auto-contidos com metadados embutidos.
* **[lil-gui (v0.19.1)](https://lil-gui.georgealways.com/)**: Painel de controle paramétrico em tempo real.
* **GLTFLoader** & **OrbitControls**: Carregamento e navegação 3D orbital suave.
